from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.stock_movement import StockMovement
from ..models.inventory import Inventory
from ..models.user import User
from ..schemas.stock_movement import StockMovementCreate, StockMovementUpdate, StockMovementResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance
from ..constants import DEFAULT_INVENTORY_TYPE
from ..utils.xlsx import xlsx_response

router = APIRouter(prefix="/stock-movements", tags=["Stock Movement"])


def load_movement(db, movement_id):
    return db.query(StockMovement).options(
        joinedload(StockMovement.product),
        joinedload(StockMovement.from_warehouse),
        joinedload(StockMovement.to_warehouse)
    ).filter(StockMovement.movement_id == movement_id, StockMovement.deleted_at.is_(None)).first()


def _filtered_movement_query(
    db: Session,
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    q = db.query(StockMovement).options(
        joinedload(StockMovement.product),
        joinedload(StockMovement.from_warehouse),
        joinedload(StockMovement.to_warehouse)
    ).filter(StockMovement.deleted_at.is_(None))
    if product_id:
        q = q.filter(StockMovement.product_id == product_id)
    if movement_type:
        q = q.filter(StockMovement.movement_type == movement_type)
    if date_from:
        q = q.filter(StockMovement.movement_date >= date_from)
    if date_to:
        q = q.filter(StockMovement.movement_date <= date_to)
    return q.order_by(StockMovement.movement_date.desc())


@router.get("", response_model=dict)
def list_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(require_permission("stock_movement.view")),
    db: Session = Depends(get_db)
):
    q = _filtered_movement_query(db, product_id, movement_type, date_from, date_to)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [StockMovementResponse.from_orm(m) for m in items]}


@router.get("/export")
def export_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(require_permission("stock_movement.view")),
    db: Session = Depends(get_db)
):
    """Excel export honoring the same filters as list_movements() above —
    covers every matching row, not just the current page."""
    items = _filtered_movement_query(db, product_id, movement_type, date_from, date_to).all()
    headers = ["Date", "Product", "Type", "Quantity", "From Warehouse", "To Warehouse", "Remark"]
    rows = [
        [str(m.movement_date), m.product.product_name if m.product else "", m.movement_type, m.quantity,
         m.from_warehouse.warehouse_name if m.from_warehouse else "",
         m.to_warehouse.warehouse_name if m.to_warehouse else "", m.remark or ""]
        for m in items
    ]
    return xlsx_response(headers, rows, "stock-movements-export.xlsx")


@router.post("", response_model=StockMovementResponse)
def create_movement(data: StockMovementCreate, current_user: User = Depends(require_permission("stock_movement.view")), db: Session = Depends(get_db)):
    """
    Stock Movement only tracks warehouse-to-warehouse transfers — Receiving,
    Sales, Returns, and Stock Opname own every other kind of stock change.
    The schema already guarantees movement_type == "TRANSFER" and both
    warehouse ids are present and different.
    """
    # Check available stock at source warehouse before moving. Stock Movement
    # only moves the default "TKU Product" bucket (Consignment/Titip Jual
    # transfers are out of scope here) — check the same bucket the deduction
    # below actually touches, not a cross-bucket sum.
    inv = db.query(Inventory).filter(
        Inventory.product_id == data.product_id,
        Inventory.warehouse_id == data.from_warehouse_id,
        Inventory.inventory_type == DEFAULT_INVENTORY_TYPE,
        Inventory.deleted_at.is_(None),
    ).first()
    available = inv.quantity if inv else 0
    if data.quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock at source warehouse. Available: {available}, Requested: {data.quantity}.",
        )

    movement = StockMovement(**data.dict(), created_by=current_user.username)
    db.add(movement)
    db.flush()

    ref = f"MOV-{movement.movement_id}"
    # Transferred stock originates from the same receiving batches as the
    # source bucket — it must carry the same cost basis, not reset to 0.
    source_cost = inv.avg_cost if inv else None
    update_inventory_balance(db, data.product_id, data.from_warehouse_id, 0, data.quantity, "TRANSFER_OUT", ref, created_by=current_user.username)
    update_inventory_balance(
        db, data.product_id, data.to_warehouse_id, data.quantity, 0, "TRANSFER_IN", ref,
        unit_cost_override=source_cost, created_by=current_user.username,
    )

    db.commit()
    return load_movement(db, movement.movement_id)


@router.get("/{movement_id}", response_model=StockMovementResponse)
def get_movement(movement_id: int, current_user: User = Depends(require_permission("stock_movement.view")), db: Session = Depends(get_db)):
    m = load_movement(db, movement_id)
    if not m:
        raise HTTPException(status_code=404, detail="Movement not found")
    return m


@router.put("/{movement_id}", response_model=StockMovementResponse)
def update_movement(movement_id: int, data: StockMovementUpdate, current_user: User = Depends(require_permission("stock_movement.view")), db: Session = Depends(get_db)):
    movement = db.query(StockMovement).filter(StockMovement.movement_id == movement_id, StockMovement.deleted_at.is_(None)).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(movement, field, value)
    movement.modified_by = current_user.username
    db.commit()
    return load_movement(db, movement_id)


@router.delete("/{movement_id}")
def delete_movement(movement_id: int, current_user: User = Depends(require_permission("stock_movement.view")), db: Session = Depends(get_db)):
    movement = db.query(StockMovement).filter(StockMovement.movement_id == movement_id, StockMovement.deleted_at.is_(None)).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")
    movement.deleted_at = datetime.utcnow()
    movement.deleted_by = current_user.username
    db.commit()
    return {"message": "Movement deleted"}
