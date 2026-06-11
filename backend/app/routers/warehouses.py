from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.warehouse import Warehouse
from ..models.user import User
from ..schemas.warehouse import WarehouseCreate, WarehouseUpdate, WarehouseResponse
from ..services.auth import get_current_user

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


@router.get("", response_model=dict)
def list_warehouses(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Warehouse).filter(Warehouse.deleted_at.is_(None))
    if search:
        q = q.filter(Warehouse.warehouse_name.ilike(f"%{search}%"))
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [WarehouseResponse.from_orm(w) for w in items]}


@router.post("", response_model=WarehouseResponse)
def create_warehouse(data: WarehouseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
def update_warehouse(warehouse_id: int, data: WarehouseUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
def delete_warehouse(warehouse_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.warehouse_id == warehouse_id, Warehouse.deleted_at.is_(None)).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh.deleted_at = datetime.utcnow()
    wh.deleted_by = current_user.username
    db.commit()
    return {"message": "Warehouse deleted"}
