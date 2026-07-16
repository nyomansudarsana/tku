import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.damaged_stock import DamagedStock
from ..models.inventory import Inventory
from ..models.inventory_ledger import InventoryLedger
from ..models.user import User
from ..schemas.damaged_stock import DamagedStockCreate, DamagedStockUpdate, DamagedStockResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance
from ..constants import DEFAULT_INVENTORY_TYPE
from ..utils.xlsx import xlsx_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/damaged-stocks", tags=["Damaged Stock"])

DAMAGE_REASONS = [
    "Broken", "Defective", "Expired", "Packaging Damaged",
    "Water Damage", "Customer Return - Defective", "Customer Return - Damaged",
    "Opname Variance - Damaged", "Other",
]

# Records auto-created by Stock Opname / Sales Return approval already had
# their inventory effect (if any) posted by THAT flow, not this router — so
# they never post/reverse their own deduction here.
_AUTO_SOURCES = {"Stock Opname", "Customer Return"}
_INVENTORY_AFFECTING_FIELDS = {"product_id", "warehouse_id", "inventory_type", "quantity", "source"}


def _load(db, damaged_stock_id: int):
    return db.query(DamagedStock).options(
        joinedload(DamagedStock.product),
        joinedload(DamagedStock.warehouse),
    ).filter(
        DamagedStock.damaged_stock_id == damaged_stock_id,
        DamagedStock.deleted_at.is_(None),
    ).first()


def _is_posted(record: DamagedStock) -> bool:
    """True when this record posted its own inventory deduction — i.e. a
    manually-entered damaged-stock record (source not Stock Opname/Customer
    Return) with a warehouse set."""
    return bool(record.warehouse_id) and record.source not in _AUTO_SOURCES


def _reverse_damaged_stock_effect(db: Session, record: DamagedStock) -> None:
    """
    Undo a previously-posted manual damaged-stock deduction, using the
    record's CURRENT (pre-edit) field values — call this BEFORE applying any
    field changes. Same "still the latest ledger entry for this bucket"
    safety check as receiving.py/sales.py/supplier_returns.py/sales_returns.py
    — refuse rather than retroactively corrupt a cost basis later
    transactions already relied on.
    """
    if not _is_posted(record):
        return

    ref = f"DMG-{record.damaged_stock_id}"
    inv_type = record.inventory_type or DEFAULT_INVENTORY_TYPE
    ledger_entry = db.query(InventoryLedger).filter(
        InventoryLedger.reference_no == ref,
        InventoryLedger.transaction_type == "DAMAGED",
        InventoryLedger.product_id == record.product_id,
        InventoryLedger.warehouse_id == record.warehouse_id,
        InventoryLedger.inventory_type == inv_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()
    if not ledger_entry:
        return

    latest_for_bucket = db.query(InventoryLedger).filter(
        InventoryLedger.product_id == record.product_id,
        InventoryLedger.warehouse_id == record.warehouse_id,
        InventoryLedger.inventory_type == inv_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()

    if latest_for_bucket.ledger_id != ledger_entry.ledger_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "This damaged stock record can no longer be edited or deleted because "
                "other stock transactions (a sale, transfer, or stock opname) have "
                "happened to this product/warehouse/inventory-type since it was "
                "recorded. Create a correcting Stock Opname instead."
            ),
        )

    inventory = db.query(Inventory).filter(
        Inventory.product_id == record.product_id,
        Inventory.warehouse_id == record.warehouse_id,
        Inventory.inventory_type == inv_type,
        Inventory.deleted_at.is_(None),
    ).first()
    if inventory:
        inventory.quantity += record.quantity

    db.delete(ledger_entry)
    db.flush()


def _apply_damaged_stock_effect(db: Session, record: DamagedStock, created_by: str) -> None:
    if not _is_posted(record):
        return
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
            created_by       = created_by,
        )
        logger.info(
            "damaged_stock %s: deducted %d units of product %s from inventory",
            record.damaged_stock_id, record.quantity, record.product_id,
        )
    except Exception as exc:
        logger.warning("Inventory deduction failed for damaged_stock: %s", exc)


def _filtered_damaged_stock_query(
    db: Session,
    product_id:   Optional[int]  = None,
    warehouse_id: Optional[int]  = None,
    source:       Optional[str]  = None,
    date_from:    Optional[date] = None,
    date_to:      Optional[date] = None,
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

    return q.order_by(DamagedStock.damage_date.desc(), DamagedStock.damaged_stock_id.desc())


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
    q = _filtered_damaged_stock_query(db, product_id, warehouse_id, source, date_from, date_to)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total, "page": page, "limit": limit,
        "items": [DamagedStockResponse.from_orm(r) for r in items],
    }


@router.get("/export")
def export_damaged_stocks(
    product_id:   Optional[int]  = None,
    warehouse_id: Optional[int]  = None,
    source:       Optional[str]  = None,
    date_from:    Optional[date] = None,
    date_to:      Optional[date] = None,
    current_user: User    = Depends(require_permission("damaged_stock.view")),
    db:           Session = Depends(get_db),
):
    """Excel export honoring the same filters as list_damaged_stocks() above."""
    items = _filtered_damaged_stock_query(db, product_id, warehouse_id, source, date_from, date_to).all()
    headers = ["Damage Date", "Product", "Warehouse", "Quantity", "Loss Amount", "Reason", "Source", "Reference", "Remarks"]
    rows = [
        [str(r.damage_date), r.product.product_name if r.product else "",
         r.warehouse.warehouse_name if r.warehouse else "", r.quantity,
         r.loss_amount if r.loss_amount is not None else "N/A",
         r.damage_reason, r.source or "Manual", r.source_reference or "", r.remarks or ""]
        for r in items
    ]
    return xlsx_response(headers, rows, "damaged-stock-export.xlsx")


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

    update_data = data.dict(exclude_unset=True)

    # Editing product/warehouse/quantity/inventory_type/source on a record
    # that already posted its own inventory deduction must undo the old
    # deduction before the fields change — see _reverse_damaged_stock_effect.
    was_posted = _is_posted(record)
    inventory_fields_changed = any(
        field in update_data and update_data[field] != getattr(record, field)
        for field in _INVENTORY_AFFECTING_FIELDS
    )
    if was_posted and inventory_fields_changed:
        _reverse_damaged_stock_effect(db, record)  # raises 400 if unsafe

    for field, value in update_data.items():
        setattr(record, field, value)

    now_posted = _is_posted(record)
    if now_posted and (not was_posted or inventory_fields_changed):
        _apply_damaged_stock_effect(db, record, current_user.username)

    record.modified_by = current_user.username
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("update_damaged_stock db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return _load(db, damaged_stock_id)


@router.delete("/{damaged_stock_id}")
def delete_damaged_stock(
    damaged_stock_id: int,
    current_user:     User    = Depends(require_permission("damaged_stock.view")),
    db:               Session = Depends(get_db),
):
    """
    Deleting a manually-entered damaged-stock record that already deducted
    inventory must also undo that effect (same safety rule as
    receiving/sales — see _reverse_damaged_stock_effect), or the stock it
    removed would stay gone forever with no record left to explain why.
    """
    record = db.query(DamagedStock).filter(
        DamagedStock.damaged_stock_id == damaged_stock_id,
        DamagedStock.deleted_at.is_(None),
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    _reverse_damaged_stock_effect(db, record)  # raises 400 if unsafe; no-op if never posted
    record.deleted_at = datetime.utcnow()
    record.deleted_by = current_user.username
    db.commit()
    return {"message": "Record deleted"}
