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
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance
from ..constants import DEFAULT_INVENTORY_TYPE

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
    current_user: User = Depends(require_permission("stock_opname.view")),
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
    current_user: User = Depends(require_permission("stock_opname.view")),
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
    current_user: User = Depends(require_permission("stock_opname.view")),
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
    current_user: User = Depends(require_permission("stock_opname.view")),
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
    current_user: User = Depends(require_permission("stock_opname.view")),
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
    current_user: User = Depends(require_permission("stock_opname.view")),
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

    inv_type = data.inventory_type or DEFAULT_INVENTORY_TYPE

    # Prevent duplicate (product, inventory_type) bucket in same opname
    existing = db.query(StockOpnameDetail).filter(
        StockOpnameDetail.opname_id == opname_id,
        StockOpnameDetail.product_id == data.product_id,
        StockOpnameDetail.inventory_type == inv_type,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Product already added to this opname")

    # Enforce Available Stock > 0 on manual add too, same filter as
    # populate-from-inventory — a product/bucket with no stock can't be opnamed.
    inv = None
    if op.warehouse_id:
        inv = db.query(Inventory).filter(
            Inventory.product_id == data.product_id,
            Inventory.warehouse_id == op.warehouse_id,
            Inventory.inventory_type == inv_type,
            Inventory.deleted_at.is_(None),
            Inventory.quantity > 0,
        ).first()
        if not inv:
            raise HTTPException(
                status_code=400,
                detail=f"Product has no available stock in the '{inv_type}' bucket at this warehouse.",
            )

    # Auto-populate system_qty from current inventory if not provided.
    system_qty = data.system_qty
    if system_qty == 0 and inv:
        system_qty = inv.quantity

    good_qty       = data.good_qty
    damaged_qty    = data.damaged_qty
    incomplete_qty = data.incomplete_qty
    physical_qty   = good_qty + damaged_qty + incomplete_qty
    diff = good_qty - system_qty  # inventory impact: sellable qty vs system

    detail = StockOpnameDetail(
        opname_id=opname_id,
        product_id=data.product_id,
        inventory_type=inv_type,
        system_qty=system_qty,
        good_qty=good_qty,
        damaged_qty=damaged_qty,
        incomplete_qty=incomplete_qty,
        physical_qty=physical_qty,
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
    current_user: User = Depends(require_permission("stock_opname.view")),
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

    if data.good_qty is not None:
        detail.good_qty = data.good_qty
    if data.damaged_qty is not None:
        detail.damaged_qty = data.damaged_qty
    if data.incomplete_qty is not None:
        detail.incomplete_qty = data.incomplete_qty
    if data.reason is not None:
        detail.reason = data.reason
    if data.remarks is not None:
        detail.remarks = data.remarks

    # Recompute derived fields
    detail.physical_qty   = detail.good_qty + detail.damaged_qty + detail.incomplete_qty
    detail.difference_qty = detail.good_qty - detail.system_qty

    db.commit()
    return db.query(StockOpnameDetail).options(
        joinedload(StockOpnameDetail.product)
    ).filter(StockOpnameDetail.id == detail_id).first()


@router.delete("/{opname_id}/details/{detail_id}")
def delete_detail(
    opname_id: int,
    detail_id: int,
    current_user: User = Depends(require_permission("stock_opname.view")),
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
    current_user: User = Depends(require_permission("stock_opname.approve")),
    db: Session = Depends(get_db),
):
    """
    Approve a stock opname.

    Gated on the discrete "stock_opname.approve" permission — Manager/Admin
    have it by default, Staff doesn't, but an admin can grant/revoke it per
    user via Role Management without changing that user's broader role.

    For each detail:
      - difference_qty = good_qty - system_qty
      - diff > 0  → physical surplus  → add to sellable inventory
      - diff < 0  → physical shortfall → remove from sellable inventory
      - damaged_qty > 0 → create DamagedStock record (inventory deduction
        is already included in the good_qty → system_qty adjustment above)

    Inventory only tracks SELLABLE stock. Damaged items found during opname
    are recorded in DamagedStock for traceability but are NOT double-deducted.
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

    ref = f"OPNAME-{op.opname_id}"

    for detail in op.details:
        diff = detail.difference_qty  # = good_qty - system_qty
        inv_type = detail.inventory_type or DEFAULT_INVENTORY_TYPE

        # ── Adjust sellable inventory ─────────────────────────────────────────
        if diff != 0:
            try:
                update_inventory_balance(
                    db,
                    product_id=detail.product_id,
                    warehouse_id=op.warehouse_id,
                    qty_in=max(0, diff),
                    qty_out=max(0, -diff),
                    transaction_type="OPNAME",
                    reference_no=ref,
                    inventory_type=inv_type,
                    created_by=current_user.username,
                )
            except Exception as exc:
                logger.warning("Inventory update failed for detail %s: %s", detail.id, exc)

        # ── Record damaged / incomplete items found during count ───────────────
        # These are NOT deducted again — the sellable adjustment already accounts
        # for them (good_qty excludes both damaged and incomplete units).
        # Cost is snapshotted from the bucket's current avg_cost for loss reporting,
        # recorded for every ownership type including Consignment/Titip Jual.
        bucket = db.query(Inventory).filter(
            Inventory.product_id == detail.product_id,
            Inventory.warehouse_id == op.warehouse_id,
            Inventory.inventory_type == inv_type,
            Inventory.deleted_at.is_(None),
        ).first()
        unit_cost = bucket.avg_cost if bucket else None

        if detail.damaged_qty and detail.damaged_qty > 0:
            try:
                db.add(DamagedStock(
                    product_id=detail.product_id,
                    warehouse_id=op.warehouse_id,
                    quantity=detail.damaged_qty,
                    damage_reason=f"Stock Opname - {detail.reason or 'Found damaged during count'}",
                    damage_date=op.opname_date,
                    source="Stock Opname",
                    source_reference=ref,
                    inventory_type=inv_type,
                    unit_cost=unit_cost,
                    loss_amount=(detail.damaged_qty * unit_cost) if unit_cost is not None else None,
                    remarks=detail.remarks,
                    created_by=current_user.username,
                ))
            except Exception as exc:
                logger.warning("DamagedStock creation failed for detail %s: %s", detail.id, exc)

        if detail.incomplete_qty and detail.incomplete_qty > 0:
            try:
                db.add(DamagedStock(
                    product_id=detail.product_id,
                    warehouse_id=op.warehouse_id,
                    quantity=detail.incomplete_qty,
                    damage_reason="Incomplete",
                    damage_date=op.opname_date,
                    source="Stock Opname",
                    source_reference=ref,
                    inventory_type=inv_type,
                    unit_cost=unit_cost,
                    loss_amount=(detail.incomplete_qty * unit_cost) if unit_cost is not None else None,
                    remarks=detail.remarks,
                    created_by=current_user.username,
                ))
            except Exception as exc:
                logger.warning("DamagedStock (incomplete) creation failed for detail %s: %s", detail.id, exc)

    op.status = "Approved"
    op.approved_by = current_user.username
    op.modified_by = current_user.username
    db.commit()
    return _load_opname(db, opname_id)


@router.post("/{opname_id}/reject", response_model=StockOpnameResponse)
def reject_opname(
    opname_id: int,
    current_user: User = Depends(require_permission("stock_opname.approve")),
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
    current_user: User = Depends(require_permission("stock_opname.view")),
    db: Session = Depends(get_db),
):
    """
    Auto-add all products currently in stock for the opname's warehouse.
    Sets good_qty = system_qty and damaged_qty = 0 as the starting point.
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

    existing_keys = {
        (d.product_id, d.inventory_type) for d in db.query(
            StockOpnameDetail.product_id, StockOpnameDetail.inventory_type
        ).filter(StockOpnameDetail.opname_id == opname_id).all()
    }

    inventories = db.query(Inventory).filter(
        Inventory.warehouse_id == op.warehouse_id,
        Inventory.deleted_at.is_(None),
        Inventory.quantity > 0,
    ).all()

    added = 0
    for inv in inventories:
        if (inv.product_id, inv.inventory_type) in existing_keys:
            continue
        detail = StockOpnameDetail(
            opname_id=opname_id,
            product_id=inv.product_id,
            inventory_type=inv.inventory_type,
            system_qty=inv.quantity,
            good_qty=inv.quantity,    # user edits this to match physical count
            damaged_qty=0,
            incomplete_qty=0,
            physical_qty=inv.quantity,
            difference_qty=0,
        )
        db.add(detail)
        added += 1

    db.commit()
    return {"message": f"Added {added} products from current inventory"}
