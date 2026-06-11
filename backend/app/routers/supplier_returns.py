import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.supplier_return import SupplierReturn
from ..models.receiving import Receiving
from ..models.user import User
from ..schemas.supplier_return import (
    SupplierReturnCreate, SupplierReturnUpdate, SupplierReturnResponse,
    STATUS_TRANSITIONS,
)
from ..services.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/supplier-returns", tags=["Supplier Returns"])


def _load(db, return_id: int):
    return db.query(SupplierReturn).options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.product),
    ).filter(
        SupplierReturn.return_id == return_id,
        SupplierReturn.deleted_at.is_(None),
    ).first()


@router.get("", response_model=dict)
def list_supplier_returns(
    supplier_id: Optional[int] = None,
    product_id:  Optional[int] = None,
    status:      Optional[str] = None,
    date_from:   Optional[date] = None,
    date_to:     Optional[date] = None,
    page:        int = Query(1, ge=1),
    limit:       int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(SupplierReturn).options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.product),
    ).filter(SupplierReturn.deleted_at.is_(None))

    if supplier_id:
        q = q.filter(SupplierReturn.supplier_id == supplier_id)
    if product_id:
        q = q.filter(SupplierReturn.product_id == product_id)
    if status:
        q = q.filter(SupplierReturn.status == status)
    if date_from:
        q = q.filter(SupplierReturn.return_date >= date_from)
    if date_to:
        q = q.filter(SupplierReturn.return_date <= date_to)

    q = q.order_by(SupplierReturn.return_date.desc(), SupplierReturn.return_id.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total, "page": page, "limit": limit,
        "items": [SupplierReturnResponse.from_orm(r) for r in items],
    }


@router.post("", response_model=SupplierReturnResponse)
def create_supplier_return(
    data: SupplierReturnCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # When linked to a receiving, validate quantity ≤ quantity_rejected
    if data.receiving_id:
        rcv = db.query(Receiving).filter(
            Receiving.receiving_id == data.receiving_id,
            Receiving.deleted_at.is_(None),
        ).first()
        if not rcv:
            raise HTTPException(status_code=404, detail=f"Receiving #{data.receiving_id} not found")
        if data.quantity > rcv.quantity_rejected + 0.001:
            raise HTTPException(
                status_code=400,
                detail=f"Return quantity ({data.quantity}) exceeds the rejected quantity "
                       f"from Receiving #{data.receiving_id} ({rcv.quantity_rejected}).",
            )

    create_data = data.dict()
    sr = SupplierReturn(**create_data, created_by=current_user.username)
    db.add(sr)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_supplier_return db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    db.refresh(sr)
    return _load(db, sr.return_id)


@router.get("/{return_id}", response_model=SupplierReturnResponse)
def get_supplier_return(
    return_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = _load(db, return_id)
    if not r:
        raise HTTPException(status_code=404, detail="Supplier return not found")
    return r


@router.put("/{return_id}", response_model=SupplierReturnResponse)
def update_supplier_return(
    return_id: int,
    data: SupplierReturnUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sr = db.query(SupplierReturn).filter(
        SupplierReturn.return_id == return_id,
        SupplierReturn.deleted_at.is_(None),
    ).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Supplier return not found")

    update_data = data.dict(exclude_unset=True)

    # Validate status transition
    new_status = update_data.get("status")
    if new_status and new_status != sr.status:
        allowed = STATUS_TRANSITIONS.get(sr.status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{sr.status}' to '{new_status}'. "
                       f"Allowed next statuses: {sorted(allowed) or 'none'}",
            )
        logger.info("supplier_return %s: %s → %s", return_id, sr.status, new_status)

    for field, value in update_data.items():
        setattr(sr, field, value)
    sr.modified_by = current_user.username
    sr.modified_at = datetime.utcnow()
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("update_supplier_return db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return _load(db, return_id)


@router.delete("/{return_id}")
def delete_supplier_return(
    return_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sr = db.query(SupplierReturn).filter(
        SupplierReturn.return_id == return_id,
        SupplierReturn.deleted_at.is_(None),
    ).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Supplier return not found")
    sr.deleted_at = datetime.utcnow()
    sr.deleted_by = current_user.username
    db.commit()
    return {"message": "Supplier return deleted"}
