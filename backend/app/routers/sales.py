import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.sales import Sales
from ..models.sales_detail import SalesDetail
from ..models.inventory import Inventory
from ..models.inventory_ledger import InventoryLedger
from ..models.product import Product
from ..models.bank_account import BankAccount
from ..models.user import User
from ..schemas.sales import SalesCreate, SalesUpdate, SalesResponse, SalesDetailResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance
from ..constants import DEFAULT_INVENTORY_TYPE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales", tags=["Sales"])

VAT_RATE = 0.11   # 11% VAT included in sale_price / unit_price


# ── VAT-aware line calculation ────────────────────────────────────────────────

def _compute_line(quantity: float, unit_price: float, discount_pct: float) -> dict:
    """
    Correct VAT-aware calculation per line item.

    unit_price is the VAT-inclusive price from the product master.

    Steps:
      1. Strip VAT → basic_price (excl. VAT)
      2. Apply discount on the BASIC subtotal
      3. Re-apply 11% VAT on the discounted basic subtotal → line_total

    This matches Indonesian VAT invoicing practice.
    """
    basic_unit     = unit_price / (1 + VAT_RATE)
    basic_subtotal = round(quantity * basic_unit, 4)
    discount_amt   = round(basic_subtotal * discount_pct / 100, 2)
    discounted_base = round(basic_subtotal - discount_amt, 2)
    vat_amt        = round(discounted_base * VAT_RATE, 2)
    line_total     = round(discounted_base + vat_amt, 2)
    return {
        "discount_amount": discount_amt,
        "vat_amount": vat_amt,
        "line_total": line_total,
    }


def _compute_header_totals(details: list) -> dict:
    """Sum per-line computed fields into header totals."""
    subtotal        = sum(d.unit_price * d.quantity for d in details)
    discount_amount = sum(d.discount_amount for d in details)
    vat_amount      = sum(d.vat_amount for d in details)
    grand_total     = sum(d.line_total for d in details)
    return {
        "subtotal":        round(subtotal, 2),
        "discount_amount": round(discount_amount, 2),
        "vat_amount":      round(vat_amount, 2),
        "grand_total":     round(grand_total, 2),
        "tax_amount":      round(vat_amount, 2),  # legacy
    }


# ── Stock availability check + ownership-bucket resolution ────────────────────

def _resolve_sale_bucket(
    db: Session,
    product_id: int,
    warehouse_id: int,
    requested_qty: float,
    requested_type: str = None,
    product_name: str = "",
) -> str:
    """
    Determine which Inventory ownership bucket (inventory_type) a sale line
    should be deducted from, and raise HTTP 400 if the resolved bucket doesn't
    have enough stock.

    - If requested_type is given, validate stock against that specific bucket.
    - Otherwise: if exactly one bucket for this product+warehouse has stock,
      auto-select it (frictionless common case). If more than one bucket has
      stock, the caller must specify inventory_type — we reject with a list of
      the available buckets/quantities so the frontend can prompt a picker.
    - If no bucket has stock, behave like the old check (available: 0).

    Returns the resolved inventory_type.
    """
    label = product_name or f"product #{product_id}"
    buckets = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.warehouse_id == warehouse_id,
        Inventory.deleted_at.is_(None),
        Inventory.quantity > 0,
    ).all()

    if requested_type:
        match = next((b for b in buckets if b.inventory_type == requested_type), None)
        available = match.quantity if match else 0
        if requested_qty > available:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock for '{label}' ({requested_type}). "
                    f"Available: {available} pcs, Requested: {requested_qty} pcs."
                ),
            )
        return requested_type

    if len(buckets) > 1:
        options = ", ".join(f"{b.inventory_type} ({b.quantity})" for b in buckets)
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{label}' has stock in more than one inventory type at this warehouse: "
                f"{options}. Please specify which one to sell from."
            ),
        )

    available = buckets[0].quantity if buckets else 0
    resolved_type = buckets[0].inventory_type if buckets else DEFAULT_INVENTORY_TYPE
    if requested_qty > available:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock for '{label}'. "
                f"Available: {available} pcs, Requested: {requested_qty} pcs. "
                "Please reduce quantity or replenish stock before completing this sale."
            ),
        )
    return resolved_type


# ── Deletion reversal ──────────────────────────────────────────────────────────

def _reverse_sale_effect(db: Session, sale: Sales) -> None:
    """
    Restore inventory for every line of a sale being deleted. Sales never
    touch avg_cost (only RECEIVING does), so this is just "add the quantity
    back" — no weighted-average unwinding needed, unlike Receiving's reversal.

    Same safety principle as receivings.py::_reverse_receiving_effect: only
    safe when each line's SALE ledger entry is still the most recent entry
    for its bucket (nothing — another sale, a transfer, an opname — has
    consumed further stock from that bucket since). Refuses per-line with a
    clear error rather than silently restoring stock into a bucket whose
    state has already moved on.
    """
    if not sale.warehouse_id:
        return
    ref = f"SALE-{sale.sales_id}"
    for detail in sale.details:
        inv_type = detail.inventory_type or DEFAULT_INVENTORY_TYPE
        ledger_entry = db.query(InventoryLedger).filter(
            InventoryLedger.reference_no == ref,
            InventoryLedger.transaction_type == "SALE",
            InventoryLedger.product_id == detail.product_id,
            InventoryLedger.warehouse_id == sale.warehouse_id,
            InventoryLedger.inventory_type == inv_type,
        ).order_by(InventoryLedger.ledger_id.desc()).first()
        if not ledger_entry:
            continue  # this line's deduction was never recorded — nothing to undo

        latest_for_bucket = db.query(InventoryLedger).filter(
            InventoryLedger.product_id == detail.product_id,
            InventoryLedger.warehouse_id == sale.warehouse_id,
            InventoryLedger.inventory_type == inv_type,
        ).order_by(InventoryLedger.ledger_id.desc()).first()

        if latest_for_bucket.ledger_id != ledger_entry.ledger_id:
            product = db.query(Product).filter(Product.product_id == detail.product_id).first()
            label = product.product_name if product else f"#{detail.product_id}"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot delete this sale: '{label}' has had other stock activity "
                    "(another sale, transfer, or stock opname) since this sale was made. "
                    "Deleting it now would restore stock into a bucket whose count has "
                    "already moved on. Use a Stock Opname adjustment instead."
                ),
            )

        inventory = db.query(Inventory).filter(
            Inventory.product_id == detail.product_id,
            Inventory.warehouse_id == sale.warehouse_id,
            Inventory.inventory_type == inv_type,
            Inventory.deleted_at.is_(None),
        ).first()
        if inventory:
            inventory.quantity += detail.quantity
        db.delete(ledger_entry)
    db.flush()


# ── Eager-load helper ─────────────────────────────────────────────────────────

def _load_sale(db: Session, sales_id: int) -> Sales:
    return (
        db.query(Sales)
        .options(
            joinedload(Sales.store),
            joinedload(Sales.warehouse),
            joinedload(Sales.bank_account),
            joinedload(Sales.details).joinedload(SalesDetail.product),
            # Legacy single-item relation
            joinedload(Sales.product),
        )
        .filter(Sales.sales_id == sales_id, Sales.deleted_at.is_(None))
        .first()
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
def list_sales(
    store_id:         Optional[int]  = None,
    product_id:       Optional[int]  = None,
    payment_method:   Optional[str]  = None,
    payment_status:   Optional[str]  = None,
    date_from:        Optional[date] = None,
    date_to:          Optional[date] = None,
    page:             int = Query(1, ge=1),
    limit:            int = Query(20, ge=1, le=2000),
    current_user:     User    = Depends(require_permission("sales.view")),
    db:               Session = Depends(get_db),
):
    q = (
        db.query(Sales)
        .options(
            joinedload(Sales.store),
            joinedload(Sales.warehouse),
            joinedload(Sales.bank_account),
            joinedload(Sales.details).joinedload(SalesDetail.product),
            joinedload(Sales.product),   # legacy
        )
        .filter(Sales.deleted_at.is_(None))
    )
    if store_id:
        q = q.filter(Sales.store_id == store_id)
    if product_id:
        # Match sales that contain this product (via sales_details or legacy column)
        detail_subq = (
            db.query(SalesDetail.sales_id)
            .filter(SalesDetail.product_id == product_id)
            .subquery()
        )
        q = q.filter(
            (Sales.product_id == product_id) | Sales.sales_id.in_(detail_subq)
        )
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
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [SalesResponse.from_orm(s) for s in items],
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=SalesResponse)
def create_sale(
    data: SalesCreate,
    current_user: User    = Depends(require_permission("sales.view")),
    db:           Session = Depends(get_db),
):
    # Validate bank account
    if data.bank_account_id:
        ba = db.query(BankAccount).filter(
            BankAccount.bank_id == data.bank_account_id,
            BankAccount.deleted_at.is_(None),
            BankAccount.is_active == True,
        ).first()
        if not ba:
            raise HTTPException(status_code=400, detail="Bank account not found or inactive")

    # ── Pre-flight stock availability check + bucket resolution ──────────────
    resolved_types = {}   # product_id -> resolved inventory_type for this sale
    if data.warehouse_id:
        for item in data.details:
            product = db.query(Product).filter(
                Product.product_id == item.product_id,
                Product.deleted_at.is_(None),
            ).first()
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product #{item.product_id} not found or inactive",
                )
            if product.status != "Active":
                raise HTTPException(
                    status_code=400,
                    detail=f"Product '{product.product_name}' is not active and cannot be sold",
                )
            resolved_types[item.product_id] = _resolve_sale_bucket(
                db,
                product_id=item.product_id,
                warehouse_id=data.warehouse_id,
                requested_qty=item.quantity,
                requested_type=item.inventory_type,
                product_name=product.product_name,
            )

    # ── Build Sales header ────────────────────────────────────────────────────
    sale = Sales(
        sales_date         = data.sales_date,
        store_id           = data.store_id,
        warehouse_id       = data.warehouse_id,
        customer_name      = data.customer_name,
        payment_method     = data.payment_method,
        payment_status     = data.payment_status,
        remarks            = data.remarks,
        bank_account_id    = data.bank_account_id,
        transfer_reference = data.transfer_reference,
        edc_receipt_number = data.edc_receipt_number,
        edc_special_code   = data.edc_special_code,
        subtotal           = 0,
        discount_amount    = 0,
        vat_amount         = 0,
        grand_total        = 0,
        tax_amount         = 0,
        created_by         = current_user.username,
    )
    db.add(sale)
    db.flush()  # get sales_id before creating details

    # ── Build SalesDetail rows and accumulate totals ──────────────────────────
    detail_objs = []
    for item in data.details:
        computed = _compute_line(item.quantity, item.unit_price, item.discount_pct)
        detail = SalesDetail(
            sales_id        = sale.sales_id,
            product_id      = item.product_id,
            quantity        = item.quantity,
            unit            = item.unit,
            unit_price      = item.unit_price,
            discount_pct    = item.discount_pct,
            discount_amount = computed["discount_amount"],
            vat_amount      = computed["vat_amount"],
            line_total      = computed["line_total"],
            inventory_type  = resolved_types.get(item.product_id),
        )
        db.add(detail)
        detail_objs.append(detail)

    db.flush()  # assign detail_ids

    # ── Update header totals ──────────────────────────────────────────────────
    totals = _compute_header_totals(detail_objs)
    for k, v in totals.items():
        setattr(sale, k, v)

    # ── Deduct inventory for each line (FATAL if deduction fails) ─────────────
    # Also snapshot the bucket's avg_cost onto the detail for margin reporting —
    # taken AFTER deduction so it reflects the cost in effect at sale time.
    if sale.warehouse_id:
        for detail in detail_objs:
            try:
                inv = update_inventory_balance(
                    db,
                    product_id       = detail.product_id,
                    warehouse_id     = sale.warehouse_id,
                    qty_in           = 0,
                    qty_out          = detail.quantity,
                    transaction_type = "SALE",
                    reference_no     = f"SALE-{sale.sales_id}",
                    inventory_type   = detail.inventory_type or DEFAULT_INVENTORY_TYPE,
                    created_by       = current_user.username,
                )
                detail.unit_cost = inv.avg_cost
            except Exception as exc:
                db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to deduct inventory for product #{detail.product_id}: {exc}",
                )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_sale db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    return _load_sale(db, sale.sales_id)


# ── Read single ───────────────────────────────────────────────────────────────

@router.get("/{sales_id}", response_model=SalesResponse)
def get_sale(
    sales_id:     int,
    current_user: User    = Depends(require_permission("sales.view")),
    db:           Session = Depends(get_db),
):
    sale = _load_sale(db, sales_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{sales_id}", response_model=SalesResponse)
def update_sale(
    sales_id:     int,
    data:         SalesUpdate,
    current_user: User    = Depends(require_permission("sales.view")),
    db:           Session = Depends(get_db),
):
    sale = db.query(Sales).filter(
        Sales.sales_id == sales_id, Sales.deleted_at.is_(None)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    # Update header-only fields (non-detail fields)
    header_fields = [
        "sales_date", "store_id", "warehouse_id", "customer_name",
        "payment_method", "payment_status", "remarks",
        "bank_account_id", "transfer_reference", "edc_receipt_number", "edc_special_code",
    ]
    update_data = data.dict(exclude_unset=True)
    for field in header_fields:
        if field in update_data:
            setattr(sale, field, update_data[field])

    # If details are provided, replace all line items
    if "details" in update_data and update_data["details"] is not None:
        new_details = update_data["details"]

        # Stock check + bucket resolution against new warehouse (use updated
        # warehouse_id if changed). NOTE: pre-existing gap — this endpoint does
        # NOT call update_inventory_balance() for replaced details, so inventory
        # is not actually adjusted when a sale is edited; that gap predates this
        # change and is out of scope here (flagged in TKU enhancement Phase 1 plan).
        wh_id = sale.warehouse_id
        resolved_types = {}
        if wh_id:
            for item in new_details:
                product = db.query(Product).filter(
                    Product.product_id == item["product_id"],
                    Product.deleted_at.is_(None),
                ).first()
                if not product:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Product #{item['product_id']} not found",
                    )
                resolved_types[item["product_id"]] = _resolve_sale_bucket(
                    db,
                    product_id    = item["product_id"],
                    warehouse_id  = wh_id,
                    requested_qty = item["quantity"],
                    requested_type = item.get("inventory_type"),
                    product_name  = product.product_name,
                )

        # Delete existing details
        db.query(SalesDetail).filter(SalesDetail.sales_id == sales_id).delete()

        # Re-create details
        detail_objs = []
        for item in new_details:
            computed = _compute_line(item["quantity"], item["unit_price"], item["discount_pct"])
            inv_type = resolved_types.get(item["product_id"])
            inv = None
            if wh_id:
                inv = db.query(Inventory).filter(
                    Inventory.product_id == item["product_id"],
                    Inventory.warehouse_id == wh_id,
                    Inventory.inventory_type == inv_type,
                    Inventory.deleted_at.is_(None),
                ).first()
            detail = SalesDetail(
                sales_id        = sales_id,
                product_id      = item["product_id"],
                quantity        = item["quantity"],
                unit            = item["unit"],
                unit_price      = item["unit_price"],
                discount_pct    = item["discount_pct"],
                discount_amount = computed["discount_amount"],
                vat_amount      = computed["vat_amount"],
                line_total      = computed["line_total"],
                inventory_type  = inv_type,
                unit_cost       = inv.avg_cost if inv else None,
            )
            db.add(detail)
            detail_objs.append(detail)

        db.flush()
        totals = _compute_header_totals(detail_objs)
        for k, v in totals.items():
            setattr(sale, k, v)

    sale.modified_by = current_user.username
    sale.modified_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    return _load_sale(db, sales_id)


# ── Toggle payment status ─────────────────────────────────────────────────────

@router.patch("/{sales_id}/payment-status", response_model=SalesResponse)
def toggle_payment_status(
    sales_id:     int,
    current_user: User    = Depends(require_permission("sales.view")),
    db:           Session = Depends(get_db),
):
    """Toggle payment_status between Paid and Unpaid."""
    sale = db.query(Sales).filter(
        Sales.sales_id == sales_id, Sales.deleted_at.is_(None)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    sale.payment_status = "Unpaid" if sale.payment_status == "Paid" else "Paid"
    sale.modified_by = current_user.username
    sale.modified_at = datetime.utcnow()
    db.commit()
    return _load_sale(db, sales_id)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{sales_id}")
def delete_sale(
    sales_id:     int,
    current_user: User    = Depends(require_permission("sales.view")),
    db:           Session = Depends(get_db),
):
    """
    Deleting a sale must also restore the inventory it deducted — a plain
    soft-delete would leave stock permanently short by the deleted sale's
    quantity with no surviving record explaining why. See _reverse_sale_effect
    for why this is refused (per line) when unsafe.
    """
    sale = _load_sale(db, sales_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    _reverse_sale_effect(db, sale)  # raises 400 if unsafe
    sale.deleted_at = datetime.utcnow()
    sale.deleted_by = current_user.username
    db.commit()
    return {"message": "Sale deleted"}
