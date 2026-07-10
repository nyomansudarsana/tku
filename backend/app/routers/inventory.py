from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..models.inventory import Inventory
from ..models.user import User
from ..schemas.inventory import InventoryResponse
from ..services.permissions import require_permission

router = APIRouter(prefix="/inventories", tags=["Inventory"])

# Inventory is system-generated and read-only by design: quantity/avg_cost
# must only change through an audited business transaction (Receiving, Sale,
# Sales/Supplier Return, Damaged Stock, Stock Opname, Stock Movement) that
# writes a matching InventoryLedger row via update_inventory_balance(). A
# direct create/update/delete here previously let any user with
# "inventory.view" silently overwrite quantity or soft-delete a bucket with
# no ledger entry and no avg_cost protection, desyncing the ledger from the
# on-hand balance — so those endpoints were removed rather than left as a
# bypass. See services/inventory_service.py.


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
    current_user: User = Depends(require_permission("inventory.view")),
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


@router.get("/{inventory_id}", response_model=InventoryResponse)
def get_inventory(inventory_id: int, current_user: User = Depends(require_permission("inventory.view")), db: Session = Depends(get_db)):
    inv = load_inventory(db, inventory_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    return inv
