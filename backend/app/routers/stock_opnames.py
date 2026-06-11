import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime, date
from ..database import get_db
from ..models.stock_opname import StockOpname, StockOpnameDetail
from ..models.inventory import Inventory
from ..models.damaged_stock import DamagedStock
from ..models.product import Product
from ..models.warehouse import Warehouse
from ..models.user import User
from ..schemas.stock_opname import (
    StockOpnameCreate, StockOpnameUpdate, StockOpnameResponse, StockOpnameSummary,
    StockOpnameDetailCreate, StockOpnameDetailUpdate, StockOpnameDetailResponse,
)
from ..services.auth import get_current_user
from ..services.inventory_service import update_inventory_balance

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stock-opnames", tags=["Stock Opname"])


def _load_opname(db, opname_id: int):
    return db.query(StockOpname).options(
        joinedload(StockOpname.warehouse),
        joinedload(StockOpname.store),
        joinedload(StockOpname.details).joinedload(StockOpnameDetail.product),
    ).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()


# ── Header CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
def list_opnames(
    warehouse_id: Optional[int] = None,
    status:       Optional[str] = None,
    date_from:    Optional[date] = None,
    date_to:      Optional[date] = None,
    page:         int = Query(1, ge=1),
    limit:        int = Query(20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(StockOpname).options(
        joinedload(StockOpname.warehouse),
        joinedload(StockOpname.store),
    ).filter(StockOpname.deleted_at.is_(None))

    if warehouse_id:
        q = q.filter(StockOpname.warehouse_id == warehouse_id)
    if status:
        q = q.filter(StockOpname.status == status)
    if date_from:
        q = q.filter(StockOpname.opname_date >= date_from)
    if date_to:
        q = q.filter(StockOpname.opname_date <= date_to)

    q = q.order_by(StockOpname.opname_date.desc(), StockOpname.opname_id.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    result = []
    for op in items:
        d = StockOpnameSummary.from_orm(op)
        d.detail_count = len(op.details) if op.details else 0
        result.append(d)
    return {"total": total, "page": page, "limit": limit, "items": result}


@router.post("", response_model=StockOpnameResponse)
def create_opname(
    data: StockOpnameCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    opname = StockOpname(**data.dict(), created_by=current_user.username)
    db.add(opname)
    db.commit()
    db.refresh(opname)
    return _load_opname(db, opname.opname_id)


@router.get("/{opname_id}", response_model=StockOpnameResponse)
def get_opname(
    opname_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = _load_opname(db, opname_id)
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    return op


@router.put("/{opname_id}", response_model=StockOpnameResponse)
def update_opname(
    opname_id: int,
    data: StockOpnameUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved opname cannot be modified")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(op, field, value)
    op.modified_by = current_user.username
    db.commit()
    return _load_opname(db, opname_id)


@router.delete("/{opname_id}")
def delete_opname(
    opname_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Cannot delete an approved opname")
    op.deleted_at = datetime.utcnow()
    op.deleted_by = current_user.username
    db.commit()
    return {"message": "Stock opname deleted"}


# ── Detail CRUD ───────────────────────────────────────────────────────────────

@router.post("/{opname_id}/details", response_model=StockOpnameDetailResponse)
def add_detail(
    opname_id: int,
    data: StockOpnameDetailCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved opname cannot be modified")

    # Prevent duplicate product in same opname
    existing = db.query(StockOpnameDetail).filter(
        StockOpnameDetail.opname_id == opname_id,
        StockOpnameDetail.product_id == data.product_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Product already added to this opname")

    # Auto-populate system_qty from current inventory if not provided
    system_qty = data.system_qty
    if system_qty == 0 and op.warehouse_id:
        inv = db.query(Inventory).filter(
            Inventory.product_id == data.product_id,
            Inventory.warehouse_id == op.warehouse_id,
            Inventory.deleted_at.is_(None),
        ).first()
        system_qty = inv.quantity if inv else 0.0

    diff = round(data.physical_qty - system_qty, 6)
    detail = StockOpnameDetail(
        opname_id=opname_id,
        product_id=data.product_id,
        system_qty=system_qty,
        physical_qty=data.physical_qty,
        difference_qty=diff,
        reason=data.reason,
        remarks=data.remarks,
    )
    db.add(detail)
    db.commit()
    db.refresh(detail)
    return db.query(StockOpnameDetail).options(
        joinedload(StockOpnameDetail.product)
    ).filter(StockOpnameDetail.id == detail.id).first()


@router.put("/{opname_id}/details/{detail_id}", response_model=StockOpnameDetailResponse)
def update_detail(
    opname_id: int,
    detail_id: int,
    data: StockOpnameDetailUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved opname cannot be modified")

    detail = db.query(StockOpnameDetail).filter(
        StockOpnameDetail.id == detail_id,
        StockOpnameDetail.opname_id == opname_id,
    ).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Detail not found")

    if data.physical_qty is not None:
        detail.physical_qty = data.physical_qty
        detail.difference_qty = round(data.physical_qty - detail.system_qty, 6)
    if data.reason is not None:
        detail.reason = data.reason
    if data.remarks is not None:
        detail.remarks = data.remarks
    db.commit()
    return db.query(StockOpnameDetail).options(
        joinedload(StockOpnameDetail.product)
    ).filter(StockOpnameDetail.id == detail_id).first()


@router.delete("/{opname_id}/details/{detail_id}")
def delete_detail(
    opname_id: int,
    detail_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved opname cannot be modified")
    detail = db.query(StockOpnameDetail).filter(
        StockOpnameDetail.id == detail_id,
        StockOpnameDetail.opname_id == opname_id,
    ).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Detail not found")
    db.delete(detail)
    db.commit()
    return {"message": "Detail removed"}


# ── Approve workflow ──────────────────────────────────────────────────────────

@router.post("/{opname_id}/approve", response_model=StockOpnameResponse)
def approve_opname(
    opname_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Approve a stock opname.

    For each detail where |difference_qty| > 0:
      - diff > 0  →  physical exceeds system → qty_in  = +diff (stock gain)
      - diff < 0  →  physical < system:
            if reason is damage-related → reduce available stock AND create DamagedStock record
            otherwise                  → reduce available stock (unexplained variance)
    """
    op = _load_opname(db, opname_id)
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Already approved")
    if op.status == "Rejected":
        raise HTTPException(status_code=400, detail="Rejected opname cannot be approved")
    if not op.details:
        raise HTTPException(status_code=400, detail="No details — add products before approving")
    if not op.warehouse_id:
        raise HTTPException(status_code=400, detail="A warehouse must be selected to approve")

    DAMAGE_KEYWORDS = {"damaged", "broken", "defective", "expired", "spoiled", "rusty", "mold"}

    ref = f"OPNAME-{op.opname_id}"
    for detail in op.details:
        diff = detail.difference_qty
        if abs(diff) < 0.001:
            continue
        try:
            if diff < 0:
                reason_lower = (detail.reason or "").lower()
                is_damage = any(kw in reason_lower for kw in DAMAGE_KEYWORDS)

                # Always update available inventory (physical count is truth)
                update_inventory_balance(
                    db,
                    product_id=detail.product_id,
                    warehouse_id=op.warehouse_id,
                    qty_in=0,
                    qty_out=abs(diff),
                    transaction_type="OPNAME_DAMAGE" if is_damage else "OPNAME",
                    reference_no=ref,
                    created_by=current_user.username,
                )

                if is_damage:
                    # Record these units in Damaged Stock for traceability
                    db.add(DamagedStock(
                        product_id=detail.product_id,
                        warehouse_id=op.warehouse_id,
                        quantity=abs(diff),
                        damage_reason=f"Opname Variance - {detail.reason or 'Damaged'}",
                        damage_date=op.opname_date,
                        source="Stock Opname",
                        source_reference=ref,
                        remarks=detail.remarks,
                        created_by=current_user.username,
                    ))
            else:
                # Positive difference → stock gain
                update_inventory_balance(
                    db,
                    product_id=detail.product_id,
                    warehouse_id=op.warehouse_id,
                    qty_in=diff,
                    qty_out=0,
                    transaction_type="OPNAME",
                    reference_no=ref,
                    created_by=current_user.username,
                )
        except Exception as exc:
            logger.warning("Inventory update failed for detail %s: %s", detail.id, exc)

    op.status = "Approved"
    op.modified_by = current_user.username
    db.commit()
    return _load_opname(db, opname_id)


@router.post("/{opname_id}/reject", response_model=StockOpnameResponse)
def reject_opname(
    opname_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved opname cannot be rejected")
    op.status = "Rejected"
    op.modified_by = current_user.username
    db.commit()
    return _load_opname(db, opname_id)


# ── Utility: populate from current inventory ──────────────────────────────────

@router.post("/{opname_id}/populate-from-inventory")
def populate_from_inventory(
    opname_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Auto-add all products currently in stock for the opname's warehouse.
    Skips products already added to this opname.
    """
    op = db.query(StockOpname).filter(
        StockOpname.opname_id == opname_id,
        StockOpname.deleted_at.is_(None),
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="Stock opname not found")
    if op.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved opname cannot be modified")
    if not op.warehouse_id:
        raise HTTPException(status_code=400, detail="Set a warehouse before populating")

    existing_ids = {d.product_id for d in db.query(StockOpnameDetail.product_id).filter(
        StockOpnameDetail.opname_id == opname_id
    ).all()}

    inventories = db.query(Inventory).filter(
        Inventory.warehouse_id == op.warehouse_id,
        Inventory.deleted_at.is_(None),
        Inventory.quantity > 0,
    ).all()

    added = 0
    for inv in inventories:
        if inv.product_id in existing_ids:
            continue
        detail = StockOpnameDetail(
            opname_id=opname_id,
            product_id=inv.product_id,
            system_qty=inv.quantity,
            physical_qty=inv.quantity,   # start equal; user edits physical count
            difference_qty=0.0,
        )
        db.add(detail)
        added += 1

    db.commit()
    return {"message": f"Added {added} products from current inventory"}
