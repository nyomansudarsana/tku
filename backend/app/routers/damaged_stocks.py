import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.damaged_stock import DamagedStock
from ..models.inventory import Inventory
from ..models.user import User
from ..schemas.damaged_stock import DamagedStockCreate, DamagedStockUpdate, DamagedStockResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance
from ..constants import DEFAULT_INVENTORY_TYPE

logger = logging.getLogger(__name__)

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
    current_user: User    = Depends(require_permission("damaged_stock.view")),
    db:           Session = Depends(get_db),
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
    data:         DamagedStockCreate,
    current_user: User    = Depends(require_permission("damaged_stock.view")),
    db:           Session = Depends(get_db),
):
    create_data = data.dict()

    # ── Resolve ownership bucket + cost snapshot ──────────────────────────────
    inv_type = create_data.get("inventory_type")
    resolved_inv = None
    if data.warehouse_id:
        buckets = db.query(Inventory).filter(
            Inventory.product_id == data.product_id,
            Inventory.warehouse_id == data.warehouse_id,
            Inventory.deleted_at.is_(None),
            Inventory.quantity > 0,
        ).all()
        if inv_type:
            resolved_inv = next((b for b in buckets if b.inventory_type == inv_type), None)
        elif len(buckets) > 1:
            options = ", ".join(f"{b.inventory_type} ({b.quantity})" for b in buckets)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"This product has stock in more than one inventory type at this "
                    f"warehouse: {options}. Please specify which one is damaged."
                ),
            )
        elif buckets:
            resolved_inv = buckets[0]
            inv_type = resolved_inv.inventory_type
    create_data["inventory_type"] = inv_type or DEFAULT_INVENTORY_TYPE
    create_data["unit_cost"] = resolved_inv.avg_cost if resolved_inv else None
    create_data["loss_amount"] = (
        create_data["quantity"] * resolved_inv.avg_cost if resolved_inv else None
    )

    record = DamagedStock(**create_data, created_by=current_user.username)
    db.add(record)
    db.flush()  # get damaged_stock_id

    # ── Deduct from available inventory ──────────────────────────────────────
    # Manual damaged-stock entries represent units that are no longer sellable.
    # Sources auto-created by opname approval / sales-return approval already
    # deduct inventory at the point they are created; we only deduct here for
    # records created directly via this endpoint (source != "Stock Opname" and
    # source != "Customer Return", or when warehouse_id is provided).
    auto_sources = {"Stock Opname", "Customer Return"}
    if record.warehouse_id and record.source not in auto_sources:
        try:
            update_inventory_balance(
                db,
                product_id       = record.product_id,
                warehouse_id     = record.warehouse_id,
                qty_in           = 0,
                qty_out          = record.quantity,
                transaction_type = "DAMAGED",
                reference_no     = f"DMG-{record.damaged_stock_id}",
                inventory_type   = record.inventory_type or DEFAULT_INVENTORY_TYPE,
                created_by       = current_user.username,
            )
            logger.info(
                "damaged_stock %s: deducted %d units of product %s from inventory",
                record.damaged_stock_id, record.quantity, record.product_id,
            )
        except Exception as exc:
            logger.warning("Inventory deduction failed for damaged_stock: %s", exc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_damaged_stock db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    db.refresh(record)
    return _load(db, record.damaged_stock_id)


@router.get("/{damaged_stock_id}", response_model=DamagedStockResponse)
def get_damaged_stock(
    damaged_stock_id: int,
    current_user:     User    = Depends(require_permission("damaged_stock.view")),
    db:               Session = Depends(get_db),
):
    record = _load(db, damaged_stock_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.put("/{damaged_stock_id}", response_model=DamagedStockResponse)
def update_damaged_stock(
    damaged_stock_id: int,
    data:             DamagedStockUpdate,
    current_user:     User    = Depends(require_permission("damaged_stock.view")),
    db:               Session = Depends(get_db),
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
    current_user:     User    = Depends(require_permission("damaged_stock.view")),
    db:               Session = Depends(get_db),
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
