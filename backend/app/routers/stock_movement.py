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
from ..services.inventory_service import update_inventory_balance

router = APIRouter(prefix="/stock-movements", tags=["Stock Movement"])


def load_movement(db, movement_id):
    return db.query(StockMovement).options(
        joinedload(StockMovement.product),
        joinedload(StockMovement.from_warehouse),
        joinedload(StockMovement.to_warehouse)
    ).filter(StockMovement.movement_id == movement_id, StockMovement.deleted_at.is_(None)).first()


@router.get("", response_model=dict)
def list_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
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
    q = q.order_by(StockMovement.movement_date.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [StockMovementResponse.from_orm(m) for m in items]}


@router.post("", response_model=StockMovementResponse)
def create_movement(data: StockMovementCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    movement = StockMovement(**data.dict(), created_by=current_user.username)
    db.add(movement)
    db.flush()

    ref = f"MOV-{movement.movement_id}"
    mtype = data.movement_type

    if mtype == "IN" and data.to_warehouse_id:
        update_inventory_balance(db, data.product_id, data.to_warehouse_id, data.quantity, 0, "MOVEMENT_IN", ref, current_user.username)
    elif mtype == "OUT" and data.from_warehouse_id:
        update_inventory_balance(db, data.product_id, data.from_warehouse_id, 0, data.quantity, "MOVEMENT_OUT", ref, current_user.username)
    elif mtype == "TRANSFER" and data.from_warehouse_id and data.to_warehouse_id:
        update_inventory_balance(db, data.product_id, data.from_warehouse_id, 0, data.quantity, "TRANSFER_OUT", ref, current_user.username)
        update_inventory_balance(db, data.product_id, data.to_warehouse_id, data.quantity, 0, "TRANSFER_IN", ref, current_user.username)
    elif mtype == "ADJUSTMENT":
        # Positive adjustment: use to_warehouse_id (qty_in = increase stock)
        # Negative adjustment: use from_warehouse_id (qty_out = decrease stock)
        if data.to_warehouse_id and not data.from_warehouse_id:
            update_inventory_balance(db, data.product_id, data.to_warehouse_id, data.quantity, 0, "ADJUSTMENT_IN", ref, current_user.username)
        elif data.from_warehouse_id and not data.to_warehouse_id:
            update_inventory_balance(db, data.product_id, data.from_warehouse_id, 0, data.quantity, "ADJUSTMENT_OUT", ref, current_user.username)
        elif data.to_warehouse_id and data.from_warehouse_id:
            # Both set: treat as positive adjustment to destination
            update_inventory_balance(db, data.product_id, data.to_warehouse_id, data.quantity, 0, "ADJUSTMENT_IN", ref, current_user.username)

    db.commit()
    return load_movement(db, movement.movement_id)


@router.get("/{movement_id}", response_model=StockMovementResponse)
def get_movement(movement_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = load_movement(db, movement_id)
    if not m:
        raise HTTPException(status_code=404, detail="Movement not found")
    return m


@router.put("/{movement_id}", response_model=StockMovementResponse)
def update_movement(movement_id: int, data: StockMovementUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    movement = db.query(StockMovement).filter(StockMovement.movement_id == movement_id, StockMovement.deleted_at.is_(None)).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(movement, field, value)
    movement.modified_by = current_user.username
    db.commit()
    return load_movement(db, movement_id)


@router.delete("/{movement_id}")
def delete_movement(movement_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    movement = db.query(StockMovement).filter(StockMovement.movement_id == movement_id, StockMovement.deleted_at.is_(None)).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")
    movement.deleted_at = datetime.utcnow()
    movement.deleted_by = current_user.username
    db.commit()
    return {"message": "Movement deleted"}
