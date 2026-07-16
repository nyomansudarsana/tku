from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.warehouse import Warehouse
from ..models.user import User
from ..schemas.warehouse import WarehouseCreate, WarehouseUpdate, WarehouseResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..utils.xlsx import xlsx_response

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


def _filtered_warehouses_query(db: Session, search: Optional[str] = None):
    q = db.query(Warehouse).filter(Warehouse.deleted_at.is_(None))
    if search:
        q = q.filter(Warehouse.warehouse_name.ilike(f"%{search}%"))
    return q


@router.get("", response_model=dict)
def list_warehouses(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = _filtered_warehouses_query(db, search)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [WarehouseResponse.from_orm(w) for w in items]}


@router.get("/export")
def export_warehouses(
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Excel export honoring the same filters as list_warehouses() above —
    covers every matching row, not just the current page."""
    items = _filtered_warehouses_query(db, search).all()
    headers = ["Warehouse Name", "Location", "Description", "Created"]
    rows = [
        [w.warehouse_name, w.location or "", w.description or "", str(w.created_at) if w.created_at else ""]
        for w in items
    ]
    return xlsx_response(headers, rows, "warehouses-export.xlsx")


@router.post("", response_model=WarehouseResponse)
def create_warehouse(data: WarehouseCreate, current_user: User = Depends(require_permission("master_data.warehouses")), db: Session = Depends(get_db)):
    wh = Warehouse(**data.dict(), created_by=current_user.username)
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.get("/{warehouse_id}", response_model=WarehouseResponse)
def get_warehouse(warehouse_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.warehouse_id == warehouse_id, Warehouse.deleted_at.is_(None)).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return wh


@router.put("/{warehouse_id}", response_model=WarehouseResponse)
def update_warehouse(warehouse_id: int, data: WarehouseUpdate, current_user: User = Depends(require_permission("master_data.warehouses")), db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.warehouse_id == warehouse_id, Warehouse.deleted_at.is_(None)).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(wh, field, value)
    wh.modified_by = current_user.username
    db.commit()
    db.refresh(wh)
    return wh


@router.delete("/{warehouse_id}")
def delete_warehouse(warehouse_id: int, current_user: User = Depends(require_permission("master_data.warehouses")), db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.warehouse_id == warehouse_id, Warehouse.deleted_at.is_(None)).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh.deleted_at = datetime.utcnow()
    wh.deleted_by = current_user.username
    db.commit()
    return {"message": "Warehouse deleted"}
