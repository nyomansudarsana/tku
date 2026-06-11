import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.receiving import Receiving
from ..models.supplier_return import SupplierReturn
from ..models.supplier_product import SupplierProduct
from ..models.user import User
from ..schemas.receiving import ReceivingCreate, ReceivingUpdate, ReceivingResponse
from ..services.auth import get_current_user
from ..services.inventory_service import update_inventory_balance

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/receivings", tags=["Receiving"])


def load_receiving(db, receiving_id):
    return db.query(Receiving).options(
        joinedload(Receiving.supplier),
        joinedload(Receiving.product),
        joinedload(Receiving.warehouse),
    ).filter(Receiving.receiving_id == receiving_id, Receiving.deleted_at.is_(None)).first()


@router.get("", response_model=dict)
def list_receivings(
    search:       Optional[str]  = None,
    supplier_id:  Optional[int]  = None,
    date_from:    Optional[date] = None,
    date_to:      Optional[date] = None,
    has_rejected: Optional[bool] = None,
    page:         int = Query(1, ge=1),
    limit:        int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Receiving).options(
        joinedload(Receiving.supplier),
        joinedload(Receiving.product),
        joinedload(Receiving.warehouse),
    ).filter(Receiving.deleted_at.is_(None))
    if supplier_id:
        q = q.filter(Receiving.supplier_id == supplier_id)
    if date_from:
        q = q.filter(Receiving.received_date >= date_from)
    if date_to:
        q = q.filter(Receiving.received_date <= date_to)
    if has_rejected:
        q = q.filter(Receiving.quantity_rejected > 0)
    q = q.order_by(Receiving.received_date.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    serialized = []
    for r in items:
        try:
            serialized.append(ReceivingResponse.from_orm(r))
        except Exception as exc:
            logger.warning("Skipping receiving_id=%s during serialization: %s", r.receiving_id, exc)
    return {"total": total, "page": page, "limit": limit, "items": serialized}


@router.post("", response_model=ReceivingResponse)
def create_receiving(
    data: ReceivingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a receiving record.

    quantity_accepted is auto-computed by the schema:
        accepted = received − rejected

    Inventory is updated with quantity_accepted (not quantity_received).
    A SupplierReturn is auto-created when quantity_rejected > 0.
    """
    # Validate product is linked to supplier when both are provided
    if data.supplier_id and data.product_id:
        link = db.query(SupplierProduct).filter(
            SupplierProduct.supplier_id == data.supplier_id,
            SupplierProduct.product_id  == data.product_id,
        ).first()
        if not link:
            raise HTTPException(
                status_code=400,
                detail="The selected product is not linked to the selected supplier. "
                       "Go to Suppliers → [Supplier] → Products to add the link.",
            )

    receiving = Receiving(**data.dict(), created_by=current_user.username)
    db.add(receiving)
    db.flush()  # get receiving_id

    # ── Inventory update (accepted qty only) ────────────────────────────────
    if receiving.warehouse_id and receiving.quantity_accepted > 0:
        try:
            update_inventory_balance(
                db,
                product_id=receiving.product_id,
                warehouse_id=receiving.warehouse_id,
                qty_in=receiving.quantity_accepted,
                qty_out=0,
                transaction_type="RECEIVING",
                reference_no=f"RCV-{receiving.receiving_id}",
                created_by=current_user.username,
            )
        except Exception as exc:
            logger.warning("Inventory update failed for receiving: %s", exc)

    # ── Auto-create Supplier Return for rejected items ───────────────────────
    if receiving.quantity_rejected > 0 and receiving.supplier_id:
        sr = SupplierReturn(
            receiving_id=receiving.receiving_id,
            supplier_id=receiving.supplier_id,
            product_id=receiving.product_id,
            return_date=receiving.received_date,
            quantity=receiving.quantity_rejected,
            reason="Rejected at receiving",
            status="Pending",
            created_by=current_user.username,
        )
        db.add(sr)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_receiving db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    db.refresh(receiving)
    return load_receiving(db, receiving.receiving_id)


@router.get("/{receiving_id}", response_model=ReceivingResponse)
def get_receiving(
    receiving_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    r = load_receiving(db, receiving_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receiving not found")
    return r


@router.put("/{receiving_id}", response_model=ReceivingResponse)
def update_receiving(
    receiving_id: int,
    data: ReceivingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    receiving = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id,
        Receiving.deleted_at.is_(None)
    ).first()
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(receiving, field, value)
    receiving.modified_by = current_user.username
    db.commit()
    return load_receiving(db, receiving_id)


@router.delete("/{receiving_id}")
def delete_receiving(
    receiving_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    receiving = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id,
        Receiving.deleted_at.is_(None)
    ).first()
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")
    receiving.deleted_at = datetime.utcnow()
    receiving.deleted_by = current_user.username
    db.commit()
    return {"message": "Receiving deleted"}
