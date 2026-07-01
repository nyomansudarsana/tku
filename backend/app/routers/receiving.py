import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.receiving import Receiving
from ..models.supplier_return import SupplierReturn
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.inventory_ledger import InventoryLedger
from ..models.user import User
from ..schemas.receiving import ReceivingCreate, ReceivingUpdate, ReceivingResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/receivings", tags=["Receiving"])

# Fields that, if changed, require the receiving's posted inventory effect to
# be reversed and reapplied — anything that changes WHICH bucket was credited
# or HOW MUCH value/quantity it received.
_INVENTORY_AFFECTING_FIELDS = {
    "product_id", "warehouse_id", "inventory_type", "quantity_accepted", "purchase_price",
}


def _reverse_receiving_effect(db: Session, receiving: Receiving) -> None:
    """
    Undo a previously-posted receiving's effect on Inventory/InventoryLedger,
    using the receiving's CURRENT (pre-edit) field values — call this BEFORE
    applying any changes to the receiving row itself.

    Only safe when this receiving's ledger entry is still the most recent
    entry for its bucket — i.e. nothing else (a sale, transfer, opname, or
    another receiving) has touched that bucket since. If something has,
    silently "undoing" this receiving's blend contribution and reapplying a
    new one would retroactively rewrite a weighted-average cost that other,
    already-completed transactions already relied on — so we refuse rather
    than produce a plausible-looking but wrong number.

    No-op if the receiving never posted to inventory in the first place
    (no warehouse, or zero accepted quantity at the time).
    """
    if not receiving.warehouse_id or not receiving.quantity_accepted or receiving.quantity_accepted <= 0:
        return

    ref = f"RCV-{receiving.receiving_id}"
    ledger_entry = db.query(InventoryLedger).filter(
        InventoryLedger.reference_no == ref,
        InventoryLedger.transaction_type == "RECEIVING",
        InventoryLedger.product_id == receiving.product_id,
        InventoryLedger.warehouse_id == receiving.warehouse_id,
        InventoryLedger.inventory_type == receiving.inventory_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()
    if not ledger_entry:
        # Nothing was ever recorded for this receiving (e.g. the original
        # inventory update failed silently) — nothing to reverse.
        return

    latest_for_bucket = db.query(InventoryLedger).filter(
        InventoryLedger.product_id == receiving.product_id,
        InventoryLedger.warehouse_id == receiving.warehouse_id,
        InventoryLedger.inventory_type == receiving.inventory_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()

    if latest_for_bucket.ledger_id != ledger_entry.ledger_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "This receiving can no longer be edited because other stock "
                "transactions (a sale, transfer, or stock opname) have happened "
                "to this product/warehouse/inventory-type since it was recorded. "
                "Changing its quantity or purchase price now would retroactively "
                "corrupt the cost basis those later transactions already used. "
                "Create a correcting Stock Opname or a new Receiving instead."
            ),
        )

    inventory = db.query(Inventory).filter(
        Inventory.product_id == receiving.product_id,
        Inventory.warehouse_id == receiving.warehouse_id,
        Inventory.inventory_type == receiving.inventory_type,
        Inventory.deleted_at.is_(None),
    ).first()
    if not inventory:
        return

    pre_qty = inventory.quantity - receiving.quantity_accepted
    if pre_qty > 0:
        pre_total_value = (inventory.avg_cost or 0) * inventory.quantity - receiving.quantity_accepted * receiving.purchase_price
        pre_avg = pre_total_value / pre_qty
    else:
        pre_qty = 0
        pre_avg = 0

    inventory.quantity = pre_qty
    inventory.avg_cost = pre_avg
    db.delete(ledger_entry)
    db.flush()


def _apply_receiving_effect(db: Session, receiving: Receiving, created_by: str) -> None:
    """Post (or re-post) a receiving's accepted quantity/cost to Inventory."""
    if receiving.warehouse_id and receiving.quantity_accepted and receiving.quantity_accepted > 0:
        try:
            update_inventory_balance(
                db,
                product_id=receiving.product_id,
                warehouse_id=receiving.warehouse_id,
                qty_in=receiving.quantity_accepted,
                qty_out=0,
                transaction_type="RECEIVING",
                reference_no=f"RCV-{receiving.receiving_id}",
                inventory_type=receiving.inventory_type,
                unit_cost_override=receiving.purchase_price,
                created_by=created_by,
            )
        except Exception as exc:
            logger.warning("Inventory update failed for receiving: %s", exc)


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
    current_user: User = Depends(require_permission("receiving.view")),
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
    current_user: User = Depends(require_permission("receiving.view")),
    db: Session = Depends(get_db)
):
    """
    Create a receiving record.

    quantity_accepted is auto-computed by the schema:
        accepted = received − rejected

    Inventory is updated with quantity_accepted (not quantity_received).
    A SupplierReturn is auto-created when quantity_rejected > 0.
    """
    # Validate product belongs to the selected supplier
    if data.supplier_id and data.product_id:
        product = db.query(Product).filter(
            Product.product_id == data.product_id,
            Product.deleted_at.is_(None),
        ).first()
        if not product or product.supplier_id != data.supplier_id:
            raise HTTPException(
                status_code=400,
                detail="The selected product is not assigned to the selected supplier. "
                       "Edit the product in Products → [Product] and set the correct Supplier.",
            )

    receiving = Receiving(**data.dict(), created_by=current_user.username)
    db.add(receiving)
    db.flush()  # get receiving_id

    # ── Inventory update (accepted qty only) ────────────────────────────────
    _apply_receiving_effect(db, receiving, current_user.username)

    # ── Auto-create Supplier Return for rejected items ───────────────────────
    if receiving.quantity_rejected > 0 and receiving.supplier_id:
        sr = SupplierReturn(
            receiving_id=receiving.receiving_id,
            supplier_id=receiving.supplier_id,
            product_id=receiving.product_id,
            warehouse_id=receiving.warehouse_id,
            return_date=receiving.received_date,
            quantity=receiving.quantity_rejected,
            reason="Rejected at receiving",
            status="Pending",
            inventory_type=receiving.inventory_type,
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
    current_user: User = Depends(require_permission("receiving.view")),
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
    current_user: User = Depends(require_permission("receiving.view")),
    db: Session = Depends(get_db)
):
    """
    Editing a receiving's product/warehouse/inventory_type/quantity_accepted/
    purchase_price requires undoing its old effect on Inventory and reposting
    the new one — a plain setattr() would silently leave the (possibly very
    wrong) original cost/quantity baked into Inventory.avg_cost forever, with
    the edited Receiving record showing a value that was never actually
    applied to stock. See _reverse_receiving_effect for why this is only done
    when safe (nothing else has touched the bucket since).
    """
    receiving = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id,
        Receiving.deleted_at.is_(None)
    ).first()
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")

    update_data = data.dict(exclude_unset=True)
    # The schema's validator recomputes quantity_accepted whenever both
    # quantity_received and quantity_rejected are supplied together, but that
    # recomputation isn't guaranteed to register under exclude_unset — force
    # it into update_data explicitly so the check below can't miss a real
    # accepted-quantity change.
    if "quantity_received" in update_data or "quantity_rejected" in update_data:
        update_data["quantity_accepted"] = data.quantity_accepted

    needs_reapply = any(
        field in update_data and update_data[field] != getattr(receiving, field)
        for field in _INVENTORY_AFFECTING_FIELDS
    )

    if needs_reapply:
        _reverse_receiving_effect(db, receiving)  # raises 400 if unsafe

    for field, value in update_data.items():
        setattr(receiving, field, value)
    receiving.modified_by = current_user.username
    db.flush()

    if needs_reapply:
        _apply_receiving_effect(db, receiving, current_user.username)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("update_receiving db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return load_receiving(db, receiving_id)


@router.delete("/{receiving_id}")
def delete_receiving(
    receiving_id: int,
    current_user: User = Depends(require_permission("receiving.view")),
    db: Session = Depends(get_db)
):
    """
    Deleting a receiving that already posted to inventory must also undo that
    effect (same safety rule as editing — see _reverse_receiving_effect), or
    the stock/cost it contributed would remain in Inventory forever with no
    Receiving record left to explain where it came from.
    """
    receiving = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id,
        Receiving.deleted_at.is_(None)
    ).first()
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")
    _reverse_receiving_effect(db, receiving)  # raises 400 if unsafe
    receiving.deleted_at = datetime.utcnow()
    receiving.deleted_by = current_user.username
    db.commit()
    return {"message": "Receiving deleted"}
