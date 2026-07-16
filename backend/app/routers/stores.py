from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.store import Store
from ..models.user import User
from ..schemas.store import StoreCreate, StoreUpdate, StoreResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..utils.xlsx import xlsx_response

router = APIRouter(prefix="/stores", tags=["Stores"])


def _filtered_stores_query(db: Session, search: Optional[str] = None):
    q = db.query(Store).filter(Store.deleted_at.is_(None))
    if search:
        q = q.filter(Store.store_name.ilike(f"%{search}%"))
    return q


@router.get("", response_model=dict)
def list_stores(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = _filtered_stores_query(db, search)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [StoreResponse.from_orm(s) for s in items]}


@router.get("/export")
def export_stores(
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Excel export honoring the same filters as list_stores() above —
    covers every matching row, not just the current page."""
    items = _filtered_stores_query(db, search).all()
    headers = ["Store Name", "Location", "Description", "Created"]
    rows = [
        [s.store_name, s.location or "", s.description or "", str(s.created_at) if s.created_at else ""]
        for s in items
    ]
    return xlsx_response(headers, rows, "stores-export.xlsx")


@router.post("", response_model=StoreResponse)
def create_store(data: StoreCreate, current_user: User = Depends(require_permission("master_data.stores")), db: Session = Depends(get_db)):
    store = Store(**data.dict(), created_by=current_user.username)
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.get("/{store_id}", response_model=StoreResponse)
def get_store(store_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = db.query(Store).filter(Store.store_id == store_id, Store.deleted_at.is_(None)).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.put("/{store_id}", response_model=StoreResponse)
def update_store(store_id: int, data: StoreUpdate, current_user: User = Depends(require_permission("master_data.stores")), db: Session = Depends(get_db)):
    store = db.query(Store).filter(Store.store_id == store_id, Store.deleted_at.is_(None)).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(store, field, value)
    store.modified_by = current_user.username
    db.commit()
    db.refresh(store)
    return store


@router.delete("/{store_id}")
def delete_store(store_id: int, current_user: User = Depends(require_permission("master_data.stores")), db: Session = Depends(get_db)):
    store = db.query(Store).filter(Store.store_id == store_id, Store.deleted_at.is_(None)).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store.deleted_at = datetime.utcnow()
    store.deleted_by = current_user.username
    db.commit()
    return {"message": "Store deleted"}
