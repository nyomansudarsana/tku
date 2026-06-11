from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.sales import Sales
from ..models.bank_account import BankAccount
from ..models.user import User
from ..schemas.sales import SalesCreate, SalesUpdate, SalesResponse
from ..services.auth import get_current_user
from ..services.inventory_service import update_inventory_balance
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales", tags=["Sales"])

VAT_RATE = 0.11   # 11% VAT included in sale_price


def _compute_fields(quantity: float, sale_price: float, discount_pct: float) -> dict:
    """
    Correct VAT-aware calculation.

    sale_price is the VAT-inclusive unit price stored in the product master.

    Steps:
      1. Strip VAT from unit price → basic_price_unit
      2. Discount is applied on the BASIC (pre-VAT) subtotal
      3. Re-apply 11% VAT on the discounted basic subtotal → grand_total

    This matches Indonesian VAT invoicing practice.
    """
    basic_price_unit = sale_price / (1 + VAT_RATE)           # VAT-excluded unit price
    subtotal = round(quantity * sale_price, 2)                 # VAT-incl, no discount (display ref)
    subtotal_basic = round(quantity * basic_price_unit, 4)     # VAT-excl, no discount
    discount_amount = round(subtotal_basic * discount_pct / 100, 2)
    discounted_base = round(subtotal_basic - discount_amount, 2)
    vat_amount = round(discounted_base * VAT_RATE, 2)
    grand_total = round(discounted_base + vat_amount, 2)
    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "grand_total": grand_total,
        "vat_amount": vat_amount,
        "tax_amount": vat_amount,   # legacy column; kept in sync with vat_amount
    }


def load_sale(db, sales_id):
    return db.query(Sales).options(
        joinedload(Sales.store),
        joinedload(Sales.warehouse),
        joinedload(Sales.product),
        joinedload(Sales.bank_account),
    ).filter(Sales.sales_id == sales_id, Sales.deleted_at.is_(None)).first()


@router.get("", response_model=dict)
def list_sales(
    store_id: Optional[int] = None,
    product_id: Optional[int] = None,
    payment_method: Optional[str] = None,
    payment_status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Sales).options(
        joinedload(Sales.store),
        joinedload(Sales.warehouse),
        joinedload(Sales.product),
        joinedload(Sales.bank_account),
    ).filter(Sales.deleted_at.is_(None))
    if store_id:
        q = q.filter(Sales.store_id == store_id)
    if product_id:
        q = q.filter(Sales.product_id == product_id)
    if payment_method:
        q = q.filter(Sales.payment_method == payment_method)
    if payment_status:
        q = q.filter(Sales.payment_status == payment_status)
    if date_from:
        q = q.filter(Sales.sales_date >= date_from)
    if date_to:
        q = q.filter(Sales.sales_date <= date_to)
    q = q.order_by(Sales.sales_date.desc(), Sales.sales_id.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [SalesResponse.from_orm(s) for s in items]}


@router.post("", response_model=SalesResponse)
def create_sale(
    data: SalesCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.bank_account_id:
        ba = db.query(BankAccount).filter(
            BankAccount.bank_id == data.bank_account_id,
            BankAccount.deleted_at.is_(None),
            BankAccount.is_active == True
        ).first()
        if not ba:
            raise HTTPException(status_code=400, detail="Bank account not found or inactive")

    computed = _compute_fields(data.quantity, data.sale_price, data.discount_pct)
    sale_data = data.dict()
    sale_data.update(computed)

    sale = Sales(**sale_data, created_by=current_user.username)
    db.add(sale)
    db.flush()

    # Automatically deduct inventory when warehouse is specified
    if sale.warehouse_id and sale.product_id:
        try:
            update_inventory_balance(
                db,
                product_id=sale.product_id,
                warehouse_id=sale.warehouse_id,
                qty_in=0,
                qty_out=sale.quantity,
                transaction_type="SALE",
                reference_no=f"SALE-{sale.sales_id}",
                created_by=current_user.username,
            )
        except Exception as exc:
            logger.warning("Inventory deduction failed for sale: %s", exc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_sale db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    db.refresh(sale)
    return load_sale(db, sale.sales_id)


@router.get("/{sales_id}", response_model=SalesResponse)
def get_sale(
    sales_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sale = load_sale(db, sales_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


@router.put("/{sales_id}", response_model=SalesResponse)
def update_sale(
    sales_id: int,
    data: SalesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sale = db.query(Sales).filter(Sales.sales_id == sales_id, Sales.deleted_at.is_(None)).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(sale, field, value)

    computed = _compute_fields(sale.quantity, sale.sale_price, sale.discount_pct)
    for k, v in computed.items():
        setattr(sale, k, v)

    sale.modified_by = current_user.username
    db.commit()
    return load_sale(db, sales_id)


@router.patch("/{sales_id}/payment-status", response_model=SalesResponse)
def toggle_payment_status(
    sales_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle payment_status between Paid and Unpaid."""
    sale = db.query(Sales).filter(Sales.sales_id == sales_id, Sales.deleted_at.is_(None)).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    sale.payment_status = "Unpaid" if sale.payment_status == "Paid" else "Paid"
    sale.modified_by = current_user.username
    sale.modified_at = datetime.utcnow()
    db.commit()
    return load_sale(db, sales_id)


@router.delete("/{sales_id}")
def delete_sale(
    sales_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sale = db.query(Sales).filter(Sales.sales_id == sales_id, Sales.deleted_at.is_(None)).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    sale.deleted_at = datetime.utcnow()
    sale.deleted_by = current_user.username
    db.commit()
    return {"message": "Sale deleted"}
