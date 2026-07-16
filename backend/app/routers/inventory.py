from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..models.inventory import Inventory
from ..models.user import User
from ..schemas.inventory import InventoryResponse
from ..services.permissions import require_permission
from ..utils.xlsx import xlsx_response

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


def _filtered_inventory_query(
    db: Session,
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    inventory_type: Optional[str] = None,
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
    return q


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
    q = _filtered_inventory_query(db, product_id, warehouse_id, inventory_type)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [InventoryResponse.from_orm(i) for i in items]}


@router.get("/export")
def export_inventories(
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    inventory_type: Optional[str] = None,
    current_user: User = Depends(require_permission("inventory.view")),
    db: Session = Depends(get_db)
):
    """Excel export honoring the same filters as list_inventories() above —
    covers every matching row, not just the current page."""
    items = _filtered_inventory_query(db, product_id, warehouse_id, inventory_type).all()
    headers = ["Product", "Warehouse", "Type", "Quantity", "Avg Cost", "Unit", "Remark"]
    rows = [
        [i.product.product_name if i.product else "", i.warehouse.warehouse_name if i.warehouse else "",
         i.inventory_type, i.quantity, i.avg_cost, i.unit, i.remark or ""]
        for i in items
    ]
    return xlsx_response(headers, rows, "inventory-export.xlsx")


@router.get("/{inventory_id}", response_model=InventoryResponse)
def get_inventory(inventory_id: int, current_user: User = Depends(require_permission("inventory.view")), db: Session = Depends(get_db)):
    inv = load_inventory(db, inventory_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    return inv
