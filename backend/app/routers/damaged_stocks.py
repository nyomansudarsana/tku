from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.damaged_stock import DamagedStock
from ..models.user import User
from ..schemas.damaged_stock import DamagedStockCreate, DamagedStockUpdate, DamagedStockResponse
from ..services.auth import get_current_user

router = APIRouter(prefix="/damaged-stocks", tags=["Damaged Stock"])

DAMAGE_REASONS = [
    "Broken", "Defective", "Expired", "Packaging Damaged",
    "Water Damage", "Customer Return - Defective", "Customer Return - Damaged",
    "Opname Variance - Damaged", "Other",
]


def _load(db, damaged_stock_id: int):
    return db.query(DamagedStock).options(
        joinedload(DamagedStock.product),
        joinedload(DamagedStock.warehouse),
    ).filter(
        DamagedStock.damaged_stock_id == damaged_stock_id,
        DamagedStock.deleted_at.is_(None),
    ).first()


@router.get("", response_model=dict)
def list_damaged_stocks(
    product_id:   Optional[int]  = None,
    warehouse_id: Optional[int]  = None,
    source:       Optional[str]  = None,
    date_from:    Optional[date] = None,
    date_to:      Optional[date] = None,
    page:         int = Query(1, ge=1),
    limit:        int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(DamagedStock).options(
        joinedload(DamagedStock.product),
        joinedload(DamagedStock.warehouse),
    ).filter(DamagedStock.deleted_at.is_(None))

    if product_id:
        q = q.filter(DamagedStock.product_id == product_id)
    if warehouse_id:
        q = q.filter(DamagedStock.warehouse_id == warehouse_id)
    if source:
        q = q.filter(DamagedStock.source == source)
    if date_from:
        q = q.filter(DamagedStock.damage_date >= date_from)
    if date_to:
        q = q.filter(DamagedStock.damage_date <= date_to)

    q = q.order_by(DamagedStock.damage_date.desc(), DamagedStock.damaged_stock_id.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total, "page": page, "limit": limit,
        "items": [DamagedStockResponse.from_orm(r) for r in items],
    }


@router.post("", response_model=DamagedStockResponse)
def create_damaged_stock(
    data: DamagedStockCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = DamagedStock(**data.dict(), created_by=current_user.username)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _load(db, record.damaged_stock_id)


@router.get("/{damaged_stock_id}", response_model=DamagedStockResponse)
def get_damaged_stock(
    damaged_stock_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = _load(db, damaged_stock_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.put("/{damaged_stock_id}", response_model=DamagedStockResponse)
def update_damaged_stock(
    damaged_stock_id: int,
    data: DamagedStockUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.query(DamagedStock).filter(
        DamagedStock.damaged_stock_id == damaged_stock_id,
        DamagedStock.deleted_at.is_(None),
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(record, field, value)
    record.modified_by = current_user.username
    db.commit()
    return _load(db, damaged_stock_id)


@router.delete("/{damaged_stock_id}")
def delete_damaged_stock(
    damaged_stock_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.query(DamagedStock).filter(
        DamagedStock.damaged_stock_id == damaged_stock_id,
        DamagedStock.deleted_at.is_(None),
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = datetime.utcnow()
    record.deleted_by = current_user.username
    db.commit()
    return {"message": "Record deleted"}
