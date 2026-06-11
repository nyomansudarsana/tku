from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.inventory import Inventory
from ..models.user import User
from ..schemas.inventory import InventoryCreate, InventoryUpdate, InventoryResponse
from ..services.auth import get_current_user

router = APIRouter(prefix="/inventories", tags=["Inventory"])


def load_inventory(db, inventory_id):
    return db.query(Inventory).options(
        joinedload(Inventory.product),
        joinedload(Inventory.warehouse)
    ).filter(Inventory.inventory_id == inventory_id, Inventory.deleted_at.is_(None)).first()


@router.get("", response_model=dict)
def list_inventories(
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    inventory_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Inventory).options(
        joinedload(Inventory.product), joinedload(Inventory.warehouse)
    ).filter(Inventory.deleted_at.is_(None))
    if product_id:
        q = q.filter(Inventory.product_id == product_id)
    if warehouse_id:
        q = q.filter(Inventory.warehouse_id == warehouse_id)
    if inventory_type:
        q = q.filter(Inventory.inventory_type == inventory_type)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [InventoryResponse.from_orm(i) for i in items]}


@router.post("", response_model=InventoryResponse)
def create_inventory(data: InventoryCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = Inventory(**data.dict(), created_by=current_user.username)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return load_inventory(db, inv.inventory_id)


@router.get("/{inventory_id}", response_model=InventoryResponse)
def get_inventory(inventory_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = load_inventory(db, inventory_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    return inv


@router.put("/{inventory_id}", response_model=InventoryResponse)
def update_inventory(inventory_id: int, data: InventoryUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.query(Inventory).filter(Inventory.inventory_id == inventory_id, Inventory.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(inv, field, value)
    inv.modified_by = current_user.username
    db.commit()
    return load_inventory(db, inventory_id)


@router.delete("/{inventory_id}")
def delete_inventory(inventory_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.query(Inventory).filter(Inventory.inventory_id == inventory_id, Inventory.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    inv.deleted_at = datetime.utcnow()
    inv.deleted_by = current_user.username
    db.commit()
    return {"message": "Inventory deleted"}
