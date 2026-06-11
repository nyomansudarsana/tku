import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.sales_return import SalesReturn
from ..models.sales import Sales
from ..models.product import Product
from ..models.damaged_stock import DamagedStock
from ..models.user import User
from ..schemas.sales_return import (
    SalesReturnCreate, SalesReturnUpdate, SalesReturnResponse,
    STATUS_TRANSITIONS,
)
from ..services.auth import get_current_user
from ..services.inventory_service import update_inventory_balance

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales-returns", tags=["Sales Returns"])


def load_return(db, return_id):
    return db.query(SalesReturn).options(
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.product),
        joinedload(SalesReturn.warehouse),
    ).filter(SalesReturn.return_id == return_id, SalesReturn.deleted_at.is_(None)).first()


@router.get("", response_model=dict)
def list_returns(
    sales_id:   Optional[int]  = None,
    product_id: Optional[int]  = None,
    status:     Optional[str]  = None,
    condition:  Optional[str]  = None,
    date_from:  Optional[date] = None,
    date_to:    Optional[date] = None,
    page:       int = Query(1, ge=1),
    limit:      int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(SalesReturn).options(
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.product),
        joinedload(SalesReturn.warehouse),
    ).filter(SalesReturn.deleted_at.is_(None))
    if sales_id:
        q = q.filter(SalesReturn.sales_id == sales_id)
    if product_id:
        q = q.filter(SalesReturn.product_id == product_id)
    if status:
        q = q.filter(SalesReturn.status == status)
    if condition:
        q = q.filter(SalesReturn.condition == condition)
    if date_from:
        q = q.filter(SalesReturn.return_date >= date_from)
    if date_to:
        q = q.filter(SalesReturn.return_date <= date_to)
    q = q.order_by(SalesReturn.return_date.desc(), SalesReturn.return_id.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit,
            "items": [SalesReturnResponse.from_orm(r) for r in items]}


@router.post("", response_model=SalesReturnResponse)
def create_return(
    data: SalesReturnCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sale = db.query(Sales).filter(
        Sales.sales_id == data.sales_id, Sales.deleted_at.is_(None)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    product = db.query(Product).filter(
        Product.product_id == data.product_id, Product.deleted_at.is_(None)
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    create_data = data.dict()
    ret = SalesReturn(**create_data, created_by=current_user.username)
    db.add(ret)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_return db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    db.refresh(ret)
    return load_return(db, ret.return_id)


@router.get("/{return_id}", response_model=SalesReturnResponse)
def get_return(
    return_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ret = load_return(db, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return ret


@router.put("/{return_id}", response_model=SalesReturnResponse)
def update_return(
    return_id: int,
    data: SalesReturnUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ret = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.deleted_at.is_(None)
    ).first()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")

    old_status = ret.status
    update_data = data.dict(exclude_unset=True)

    # Apply all field updates first so condition is current when computing location
    for field, value in update_data.items():
        setattr(ret, field, value)

    new_status = ret.status  # may have changed above

    # ── Status transition validation ────────────────────────────────────────
    if new_status != old_status:
        allowed = STATUS_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{old_status}' to '{new_status}'. "
                       f"Allowed: {sorted(allowed) or 'none'}",
            )

        # If inspection fields provided (Under Inspection → Approved flow)
        if new_status == "Under Inspection" and "inspected_by" not in update_data:
            ret.inspected_by = current_user.username
            ret.inspected_at = datetime.utcnow()

        # ── Inventory effect: only when transitioning INTO Approved ─────────
        if old_status != "Approved" and new_status == "Approved":
            if ret.warehouse_id and ret.product_id:
                ref = f"RTN-{ret.return_id}"
                try:
                    if ret.condition == "Good":
                        update_inventory_balance(
                            db,
                            product_id=ret.product_id,
                            warehouse_id=ret.warehouse_id,
                            qty_in=ret.quantity,
                            qty_out=0,
                            transaction_type="RETURN_GOOD",
                            reference_no=ref,
                            created_by=current_user.username,
                        )
                        logger.info(
                            "Return %s: %s units of product %s restored to available stock",
                            ret.return_id, ret.quantity, ret.product_id,
                        )
                    elif ret.condition in ("Defective", "Damaged"):
                        damage = DamagedStock(
                            product_id=ret.product_id,
                            warehouse_id=ret.warehouse_id,
                            quantity=ret.quantity,
                            damage_reason=f"Customer Return - {ret.condition}",
                            damage_date=ret.return_date,
                            source="Customer Return",
                            source_reference=ref,
                            remarks=ret.remarks,
                            created_by=current_user.username,
                        )
                        db.add(damage)
                        logger.info(
                            "Return %s: %s units of product %s → Damaged Stock (%s)",
                            ret.return_id, ret.quantity, ret.product_id, ret.condition,
                        )
                    else:
                        logger.info(
                            "Return %s: condition '%s' — no inventory action (manual re-inspection required)",
                            ret.return_id, ret.condition,
                        )
                except Exception as exc:
                    logger.warning("Inventory update failed on return approval: %s", exc)

        logger.info("sales_return %s: %s → %s", return_id, old_status, new_status)

    ret.modified_by = current_user.username
    ret.modified_at = datetime.utcnow()
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("update_return db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return load_return(db, return_id)


@router.delete("/{return_id}")
def delete_return(
    return_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ret = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.deleted_at.is_(None)
    ).first()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    ret.deleted_at = datetime.utcnow()
    ret.deleted_by = current_user.username
    db.commit()
    return {"message": "Return deleted"}
