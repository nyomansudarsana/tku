import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.sales_return import SalesReturn, SalesReturnPartReplacement, SalesExchange
from ..models.sales import Sales
from ..models.sales_detail import SalesDetail
from ..models.inventory import Inventory
from ..models.inventory_ledger import InventoryLedger
from ..models.product import Product
from ..models.damaged_stock import DamagedStock
from ..models.user import User
from ..schemas.sales_return import (
    SalesReturnCreate, SalesReturnUpdate, SalesReturnResponse,
    STATUS_TRANSITIONS,
)
from ..services.auth import get_current_user
from ..services.permissions import require_permission
from ..services.inventory_service import update_inventory_balance
from ..constants import DEFAULT_INVENTORY_TYPE
from ..utils.xlsx import xlsx_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales-returns", tags=["Sales Returns"])


def load_return(db, return_id):
    return db.query(SalesReturn).options(
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.product),
        joinedload(SalesReturn.warehouse),
        joinedload(SalesReturn.part_replacement),
        joinedload(SalesReturn.exchange).joinedload(SalesExchange.old_product),
        joinedload(SalesReturn.exchange).joinedload(SalesExchange.new_product),
    ).filter(SalesReturn.return_id == return_id, SalesReturn.deleted_at.is_(None)).first()


def _sales_return_posted(ret: SalesReturn) -> bool:
    """True when this return already restocked sellable inventory (Approved + Good condition)."""
    return ret.status == "Approved" and ret.condition == "Good" and bool(ret.warehouse_id)


def _reverse_ledger_transaction(
    db: Session, transaction_type: str, reference_no: str,
    product_id: int, warehouse_id: int, inventory_type: str, was_qty_in: bool,
) -> None:
    """
    Undo one previously-posted ledger transaction, subject to the same
    "still the latest ledger entry for this bucket" safety check used
    throughout receiving.py/sales.py — if anything else has touched this
    product/warehouse/inventory-type bucket since, refuse rather than
    retroactively corrupt a cost basis later transactions already relied on.

    was_qty_in=True means the original entry ADDED stock (a restock — so
    reversing SUBTRACTS it back out); False means the original entry REMOVED
    stock (a deduction — so reversing ADDS it back). No-op if no matching
    ledger entry is found (nothing was ever posted).
    """
    ledger_entry = db.query(InventoryLedger).filter(
        InventoryLedger.reference_no == reference_no,
        InventoryLedger.transaction_type == transaction_type,
        InventoryLedger.product_id == product_id,
        InventoryLedger.warehouse_id == warehouse_id,
        InventoryLedger.inventory_type == inventory_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()
    if not ledger_entry:
        return

    latest_for_bucket = db.query(InventoryLedger).filter(
        InventoryLedger.product_id == product_id,
        InventoryLedger.warehouse_id == warehouse_id,
        InventoryLedger.inventory_type == inventory_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()

    if latest_for_bucket.ledger_id != ledger_entry.ledger_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "This sales return can no longer be deleted because other stock "
                "transactions (a sale, transfer, or stock opname) have happened to "
                "this product/warehouse/inventory-type since it was approved. "
                "Create a correcting Stock Opname instead."
            ),
        )

    inventory = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.warehouse_id == warehouse_id,
        Inventory.inventory_type == inventory_type,
        Inventory.deleted_at.is_(None),
    ).first()
    qty = ledger_entry.qty_in if was_qty_in else ledger_entry.qty_out
    if inventory:
        if was_qty_in:
            inventory.quantity = max(0, inventory.quantity - qty)
        else:
            inventory.quantity = inventory.quantity + qty

    db.delete(ledger_entry)
    db.flush()


def _reverse_sales_return_effect(db: Session, ret: SalesReturn) -> None:
    """
    Undo a previously-posted return's effect, using the return's CURRENT
    (pre-edit) field values — call this BEFORE applying any field changes.

    - Broken Parts: the customer's original unit was never physically
      returned (nothing to restock) — reverses the cannibalized unit's
      BROKEN_PARTS_ADJUSTMENT deduction and drops the linked Incomplete
      DamagedStock record.
    - "Good" condition (Product Replacement or Exchange's returned side):
      reverses the RETURN_GOOD restock (qty_in) added to Inventory.
    - Defective/Damaged/Incomplete: never touched Inventory directly (those
      units were routed to DamagedStock instead), so there's nothing to
      reverse there — but the auto-created DamagedStock record referencing
      this return would otherwise become an orphan, so it's soft-deleted too.
    - Exchange additionally reverses the EXCHANGE_OUT deduction taken from
      the new product, on top of whichever of the above applies to the
      returned (old) product.
    """
    if ret.status != "Approved":
        return

    ref = f"RTN-{ret.return_id}"
    inv_type = ret.inventory_type or DEFAULT_INVENTORY_TYPE

    if ret.return_type == "Broken Parts":
        if ret.part_replacement:
            _reverse_ledger_transaction(
                db, "BROKEN_PARTS_ADJUSTMENT", ref,
                ret.part_replacement.product_id, ret.warehouse_id, inv_type, was_qty_in=False,
            )
        damage = db.query(DamagedStock).filter(
            DamagedStock.source == "Customer Return",
            DamagedStock.source_reference == ref,
            DamagedStock.deleted_at.is_(None),
        ).first()
        if damage:
            damage.deleted_at = datetime.utcnow()
            damage.deleted_by = "system:sales_return_reversal"
        return

    if ret.condition in ("Defective", "Damaged", "Incomplete"):
        damage = db.query(DamagedStock).filter(
            DamagedStock.source == "Customer Return",
            DamagedStock.source_reference == ref,
            DamagedStock.deleted_at.is_(None),
        ).first()
        if damage:
            damage.deleted_at = datetime.utcnow()
            damage.deleted_by = "system:sales_return_reversal"
    elif _sales_return_posted(ret):
        _reverse_ledger_transaction(
            db, "RETURN_GOOD", ref, ret.product_id, ret.warehouse_id, inv_type, was_qty_in=True,
        )

    if ret.return_type == "Exchange" and ret.exchange:
        exch_ref = f"EXCH-{ret.exchange.exchange_id}"
        _reverse_ledger_transaction(
            db, "EXCHANGE_OUT", exch_ref, ret.exchange.new_product_id, ret.warehouse_id, inv_type, was_qty_in=False,
        )


def _remaining_returnable(
    db: Session,
    sales_id: int,
    product_id: int,
    sales_detail_id: Optional[int],
    exclude_return_id: Optional[int] = None,
) -> tuple:
    """
    (sold_qty, already_returned, remaining) for a sales line.

    Matches by sales_detail_id when available (multi-item sales); falls back
    to sales_id + product_id for legacy single-item sales/returns that
    predate the sales_detail_id link. "Already returned" sums every return
    against this line except status == 'Rejected' — a return that's merely
    Submitted/Under Inspection still reserves its quantity so two concurrent
    return requests can't both claim the same units.
    """
    if sales_detail_id:
        detail = db.query(SalesDetail).filter(SalesDetail.detail_id == sales_detail_id).first()
        sold_qty = detail.quantity if detail else 0
        match_filter = (SalesReturn.sales_detail_id == sales_detail_id)
    else:
        sale = db.query(Sales).filter(Sales.sales_id == sales_id).first()
        sold_qty = sale.quantity if sale and sale.quantity else 0
        match_filter = (
            (SalesReturn.sales_id == sales_id)
            & (SalesReturn.product_id == product_id)
            & (SalesReturn.sales_detail_id.is_(None))
        )

    q = db.query(SalesReturn).filter(
        match_filter,
        SalesReturn.status != "Rejected",
        SalesReturn.deleted_at.is_(None),
    )
    if exclude_return_id is not None:
        q = q.filter(SalesReturn.return_id != exclude_return_id)
    already_returned = sum(r.quantity for r in q.all())
    return sold_qty, already_returned, max(0, sold_qty - already_returned)


def _filtered_sales_return_query(
    db: Session,
    sales_id:   Optional[int]  = None,
    product_id: Optional[int]  = None,
    status:     Optional[str]  = None,
    condition:  Optional[str]  = None,
    date_from:  Optional[date] = None,
    date_to:    Optional[date] = None,
):
    q = db.query(SalesReturn).options(
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.product),
        joinedload(SalesReturn.warehouse),
        joinedload(SalesReturn.part_replacement),
        joinedload(SalesReturn.exchange).joinedload(SalesExchange.old_product),
        joinedload(SalesReturn.exchange).joinedload(SalesExchange.new_product),
    ).filter(SalesReturn.deleted_at.is_(None))
    if sales_id:
        q = q.filter(SalesReturn.sales_id == sales_id)
    if product_id:
        q = q.filter(SalesReturn.product_id == product_id)
    if status:
        q = q.filter(SalesReturn.status == status)
    if condition:
        q = q.filter(SalesReturn.condition == condition)
    if date_from:
        q = q.filter(SalesReturn.return_date >= date_from)
    if date_to:
        q = q.filter(SalesReturn.return_date <= date_to)
    return q.order_by(SalesReturn.return_date.desc(), SalesReturn.return_id.desc())


@router.get("", response_model=dict)
def list_returns(
    sales_id:   Optional[int]  = None,
    product_id: Optional[int]  = None,
    status:     Optional[str]  = None,
    condition:  Optional[str]  = None,
    date_from:  Optional[date] = None,
    date_to:    Optional[date] = None,
    page:       int = Query(1, ge=1),
    limit:      int = Query(20, ge=1, le=500),
    current_user: User = Depends(require_permission("sales_returns.view")),
    db: Session = Depends(get_db)
):
    q = _filtered_sales_return_query(db, sales_id, product_id, status, condition, date_from, date_to)
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit,
            "items": [SalesReturnResponse.from_orm(r) for r in items]}


@router.get("/export")
def export_returns(
    sales_id:   Optional[int]  = None,
    product_id: Optional[int]  = None,
    status:     Optional[str]  = None,
    condition:  Optional[str]  = None,
    date_from:  Optional[date] = None,
    date_to:    Optional[date] = None,
    current_user: User = Depends(require_permission("sales_returns.view")),
    db: Session = Depends(get_db)
):
    """Excel export honoring the same filters as list_returns() above."""
    items = _filtered_sales_return_query(db, sales_id, product_id, status, condition, date_from, date_to).all()
    headers = ["Return Date", "Sales #", "Product", "Warehouse", "Quantity", "Return Type", "Condition", "Status",
               "Reason", "Exchange Product", "Difference Amount", "Remarks"]
    rows = [
        [str(r.return_date), r.sales_id, r.product.product_name if r.product else "",
         r.warehouse.warehouse_name if r.warehouse else "", r.quantity, r.return_type, r.condition, r.status,
         r.return_reason or "",
         (r.exchange.new_product.product_name if r.exchange and r.exchange.new_product else ""),
         (r.exchange.difference_amount if r.exchange else ""),
         r.remarks or ""]
        for r in items
    ]
    return xlsx_response(headers, rows, "sales-returns-export.xlsx")


@router.post("", response_model=SalesReturnResponse)
def create_return(
    data: SalesReturnCreate,
    current_user: User = Depends(require_permission("sales_returns.view")),
    db: Session = Depends(get_db)
):
    sale = db.query(Sales).filter(
        Sales.sales_id == data.sales_id, Sales.deleted_at.is_(None)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    create_data = data.dict()

    source_detail = None
    if data.sales_detail_id:
        source_detail = db.query(SalesDetail).filter(
            SalesDetail.detail_id == data.sales_detail_id,
        ).first()
        if not source_detail or source_detail.sales_id != data.sales_id:
            raise HTTPException(
                status_code=400,
                detail="The selected product line does not belong to this sale.",
            )
        # Derive product_id/inventory_type from the chosen line rather than
        # trusting a client-supplied product_id to silently diverge from it.
        create_data["product_id"] = source_detail.product_id
        if not create_data.get("inventory_type"):
            create_data["inventory_type"] = source_detail.inventory_type or DEFAULT_INVENTORY_TYPE
    else:
        source_detail = db.query(SalesDetail).filter(
            SalesDetail.sales_id == data.sales_id,
            SalesDetail.product_id == data.product_id,
        ).first()
        if not create_data.get("inventory_type"):
            create_data["inventory_type"] = (
                source_detail.inventory_type if source_detail and source_detail.inventory_type
                else DEFAULT_INVENTORY_TYPE
            )

    product = db.query(Product).filter(
        Product.product_id == create_data["product_id"], Product.deleted_at.is_(None)
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    sold_qty, already_returned, remaining = _remaining_returnable(
        db, data.sales_id, create_data["product_id"], data.sales_detail_id,
    )
    if data.quantity > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Only {remaining} unit(s) remain returnable for this line "
                   f"({sold_qty} sold, {already_returned} already returned/pending).",
        )

    # part_replacement/exchange are nested payloads for the new Broken Parts /
    # Exchange workflows, not columns on SalesReturn itself.
    part_replacement_data = create_data.pop("part_replacement", None)
    exchange_data = create_data.pop("exchange", None)

    if create_data["return_type"] == "Broken Parts" and not part_replacement_data:
        raise HTTPException(status_code=400, detail="Broken Parts returns require a replacement part, quantity, and remarks.")
    if create_data["return_type"] == "Exchange" and not exchange_data:
        raise HTTPException(status_code=400, detail="Exchange returns require an exchange product.")

    # For Exchange, historical old_price comes from what the customer actually
    # paid (the matched SalesDetail line), falling back to the legacy Sales
    # single-item column — never the product's current sale_price, which may
    # have changed since the original purchase.
    exchange_new_product = None
    if exchange_data:
        old_price = (
            source_detail.unit_price if source_detail and source_detail.unit_price is not None
            else (sale.sale_price or 0)
        )
        exchange_new_product = db.query(Product).filter(
            Product.product_id == exchange_data["new_product_id"], Product.deleted_at.is_(None)
        ).first()
        if not exchange_new_product:
            raise HTTPException(status_code=404, detail="Exchange product not found")
        new_price = exchange_new_product.sale_price or 0
        if new_price < old_price:
            raise HTTPException(
                status_code=400,
                detail=(
                    "TKU does not offer cash refunds for exchanges — please choose a "
                    f"product priced at or above {old_price:,.0f} (the original product's price)."
                ),
            )

    ret = SalesReturn(**create_data, created_by=current_user.username)
    db.add(ret)
    db.flush()  # get return_id before writing nested rows

    if part_replacement_data:
        db.add(SalesReturnPartReplacement(
            sales_return_id=ret.return_id,
            product_id=part_replacement_data.get("product_id") or ret.product_id,
            part_name=part_replacement_data["part_name"],
            quantity=part_replacement_data["quantity"],
            remarks=part_replacement_data.get("remarks"),
        ))

    if exchange_data:
        qty = exchange_data.get("quantity") or ret.quantity
        db.add(SalesExchange(
            sales_return_id=ret.return_id,
            old_product_id=ret.product_id,
            new_product_id=exchange_new_product.product_id,
            old_price=old_price,
            new_price=new_price,
            quantity=qty,
            difference_amount=round((new_price - old_price) * qty, 2),
            payment_status="Paid" if new_price <= old_price else "Unpaid",
            created_at=datetime.utcnow(),
        ))

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("create_return db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    db.refresh(ret)
    return load_return(db, ret.return_id)


@router.get("/{return_id}", response_model=SalesReturnResponse)
def get_return(
    return_id: int,
    current_user: User = Depends(require_permission("sales_returns.view")),
    db: Session = Depends(get_db)
):
    ret = load_return(db, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return ret


@router.put("/{return_id}", response_model=SalesReturnResponse)
def update_return(
    return_id: int,
    data: SalesReturnUpdate,
    current_user: User = Depends(require_permission("sales_returns.view")),
    db: Session = Depends(get_db)
):
    ret = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.deleted_at.is_(None)
    ).first()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")

    old_status = ret.status
    update_data = data.dict(exclude_unset=True)

    # Not a SalesReturn column — applies to the linked SalesExchange instead.
    exchange_payment_status = update_data.pop("exchange_payment_status", None)
    if exchange_payment_status is not None:
        if not ret.exchange:
            raise HTTPException(status_code=400, detail="This return has no linked exchange.")
        ret.exchange.payment_status = exchange_payment_status

    # Apply all field updates first so condition is current when computing location
    for field, value in update_data.items():
        setattr(ret, field, value)

    # Re-validate the remaining-returnable cap whenever quantity or the line
    # this return targets changed — excludes this return's own prior quantity
    # from "already returned" so editing a return's quantity doesn't double-count itself.
    if "quantity" in update_data or "sales_detail_id" in update_data:
        sold_qty, already_returned, remaining = _remaining_returnable(
            db, ret.sales_id, ret.product_id, ret.sales_detail_id, exclude_return_id=ret.return_id,
        )
        if ret.quantity > remaining:
            raise HTTPException(
                status_code=400,
                detail=f"Only {remaining} unit(s) remain returnable for this line "
                       f"({sold_qty} sold, {already_returned} already returned/pending).",
            )

    new_status = ret.status  # may have changed above

    # ── Status transition validation ────────────────────────────────────────
    if new_status != old_status:
        allowed = STATUS_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{old_status}' to '{new_status}'. "
                       f"Allowed: {sorted(allowed) or 'none'}",
            )

        # If inspection fields provided (Under Inspection → Approved flow)
        if new_status == "Under Inspection" and "inspected_by" not in update_data:
            ret.inspected_by = current_user.username
            ret.inspected_at = datetime.utcnow()

        # ── Inventory effect: only when transitioning INTO Approved ─────────
        if old_status != "Approved" and new_status == "Approved":
            ref = f"RTN-{ret.return_id}"
            inv_type = ret.inventory_type or DEFAULT_INVENTORY_TYPE

            if ret.return_type == "Broken Parts":
                # The customer's original unit is never physically returned —
                # it stays with them, repaired. Instead, a separate complete
                # unit of the same product is cannibalized in the warehouse:
                # Available -qty / Incomplete +qty. Nothing here touches the
                # originally-sold quantity/product's "Good" restock path.
                if not ret.part_replacement:
                    raise HTTPException(status_code=400, detail="Broken Parts return has no replacement part recorded.")
                if ret.warehouse_id:
                    part = ret.part_replacement
                    try:
                        update_inventory_balance(
                            db,
                            product_id=part.product_id,
                            warehouse_id=ret.warehouse_id,
                            qty_in=0,
                            qty_out=part.quantity,
                            transaction_type="BROKEN_PARTS_ADJUSTMENT",
                            reference_no=ref,
                            inventory_type=inv_type,
                            created_by=current_user.username,
                        )
                        bucket = db.query(Inventory).filter(
                            Inventory.product_id == part.product_id,
                            Inventory.warehouse_id == ret.warehouse_id,
                            Inventory.inventory_type == inv_type,
                            Inventory.deleted_at.is_(None),
                        ).first()
                        unit_cost = bucket.avg_cost if bucket else None
                        db.add(DamagedStock(
                            product_id=part.product_id,
                            warehouse_id=ret.warehouse_id,
                            quantity=part.quantity,
                            damage_reason=f"Incomplete - Broken Parts Replacement ({part.part_name})",
                            damage_date=ret.return_date,
                            source="Customer Return",
                            source_reference=ref,
                            inventory_type=inv_type,
                            unit_cost=unit_cost,
                            loss_amount=(part.quantity * unit_cost) if unit_cost is not None else None,
                            remarks=part.remarks,
                            created_by=current_user.username,
                        ))
                        logger.info(
                            "Return %s: %s unit(s) of product %s cannibalized for part '%s' — Available -%s / Incomplete +%s",
                            ret.return_id, part.quantity, part.product_id, part.part_name, part.quantity, part.quantity,
                        )
                    except Exception as exc:
                        logger.warning("Broken Parts inventory adjustment failed on return approval: %s", exc)
            elif ret.warehouse_id and ret.product_id:
                try:
                    if ret.condition == "Good":
                        # Carries the originating line's cost forward so a
                        # cross-warehouse return (restocking somewhere that
                        # never received this product directly) doesn't
                        # strand the destination bucket at avg_cost=0.
                        original_cost = ret.sales_detail.unit_cost if ret.sales_detail else None
                        update_inventory_balance(
                            db,
                            product_id=ret.product_id,
                            warehouse_id=ret.warehouse_id,
                            qty_in=ret.quantity,
                            qty_out=0,
                            transaction_type="RETURN_GOOD",
                            reference_no=ref,
                            inventory_type=inv_type,
                            unit_cost_override=original_cost,
                            created_by=current_user.username,
                        )
                        logger.info(
                            "Return %s: %s units of product %s restored to available stock",
                            ret.return_id, ret.quantity, ret.product_id,
                        )
                    elif ret.condition in ("Defective", "Damaged", "Incomplete"):
                        bucket = db.query(Inventory).filter(
                            Inventory.product_id == ret.product_id,
                            Inventory.warehouse_id == ret.warehouse_id,
                            Inventory.inventory_type == inv_type,
                            Inventory.deleted_at.is_(None),
                        ).first()
                        unit_cost = bucket.avg_cost if bucket else None
                        damage = DamagedStock(
                            product_id=ret.product_id,
                            warehouse_id=ret.warehouse_id,
                            quantity=ret.quantity,
                            damage_reason=f"Customer Return - {ret.condition}",
                            damage_date=ret.return_date,
                            source="Customer Return",
                            source_reference=ref,
                            inventory_type=inv_type,
                            unit_cost=unit_cost,
                            loss_amount=(ret.quantity * unit_cost) if unit_cost is not None else None,
                            remarks=ret.remarks,
                            created_by=current_user.username,
                        )
                        db.add(damage)
                        logger.info(
                            "Return %s: %s units of product %s → Damaged Stock (%s)",
                            ret.return_id, ret.quantity, ret.product_id, ret.condition,
                        )
                    else:
                        logger.info(
                            "Return %s: condition '%s' — no inventory action (manual re-inspection required)",
                            ret.return_id, ret.condition,
                        )
                except Exception as exc:
                    logger.warning("Inventory update failed on return approval: %s", exc)

            # ── Exchange: additionally deduct the new product's stock ───────
            # Deliberately NOT swallowed like the branches above — going
            # negative here would directly violate "available stock always
            # reflects physical stock," so insufficient stock aborts the
            # whole approval rather than silently posting a bad ledger entry.
            if ret.return_type == "Exchange":
                if not ret.exchange:
                    raise HTTPException(status_code=400, detail="Exchange return has no linked exchange record.")
                if not ret.warehouse_id:
                    raise HTTPException(status_code=400, detail="A warehouse is required to approve an exchange.")
                exch = ret.exchange
                bucket = db.query(Inventory).filter(
                    Inventory.product_id == exch.new_product_id,
                    Inventory.warehouse_id == ret.warehouse_id,
                    Inventory.inventory_type == inv_type,
                    Inventory.deleted_at.is_(None),
                ).first()
                available = bucket.quantity if bucket else 0
                if available < exch.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot approve exchange: only {available} unit(s) of the exchange product "
                               f"available at this warehouse (need {exch.quantity}).",
                    )
                update_inventory_balance(
                    db,
                    product_id=exch.new_product_id,
                    warehouse_id=ret.warehouse_id,
                    qty_in=0,
                    qty_out=exch.quantity,
                    transaction_type="EXCHANGE_OUT",
                    reference_no=f"EXCH-{exch.exchange_id}",
                    inventory_type=inv_type,
                    created_by=current_user.username,
                )
                logger.info(
                    "Return %s: exchange %s deducted %s unit(s) of product %s",
                    ret.return_id, exch.exchange_id, exch.quantity, exch.new_product_id,
                )

        logger.info("sales_return %s: %s → %s", return_id, old_status, new_status)

    ret.modified_by = current_user.username
    ret.modified_at = datetime.utcnow()
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("update_return db.commit failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return load_return(db, return_id)


@router.delete("/{return_id}")
def delete_return(
    return_id: int,
    current_user: User = Depends(require_permission("sales_returns.view")),
    db: Session = Depends(get_db)
):
    """
    Deleting a return that already restocked inventory (Approved + Good) or
    spawned a DamagedStock record (Approved + Defective/Damaged/Incomplete)
    must undo that effect (same safety rule as receiving/sales — see
    _reverse_sales_return_effect), or stock/records it contributed would
    remain with no Sales Return left to explain where they came from.
    """
    ret = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.deleted_at.is_(None)
    ).first()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    _reverse_sales_return_effect(db, ret)  # raises 400 if unsafe; no-op if never posted
    ret.deleted_at = datetime.utcnow()
    ret.deleted_by = current_user.username
    db.commit()
    return {"message": "Return deleted"}
