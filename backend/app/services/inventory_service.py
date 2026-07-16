from sqlalchemy.orm import Session
from ..models.inventory import Inventory
from ..models.inventory_ledger import InventoryLedger
from ..constants import DEFAULT_INVENTORY_TYPE


def update_inventory_balance(
    db: Session,
    product_id: int,
    warehouse_id: int,
    qty_in: float,
    qty_out: float,
    transaction_type: str,
    reference_no: str,
    inventory_type: str = DEFAULT_INVENTORY_TYPE,
    unit_cost_override: float = None,
    created_by: str = "system",
):
    """
    Find-or-create the Inventory row for (product_id, warehouse_id, inventory_type)
    and apply qty_in/qty_out to it, writing a matching InventoryLedger row.

    Costing: Inventory.avg_cost is a running weighted-average cost per unit.
    It is recomputed whenever a caller supplies unit_cost_override alongside
    qty_in > 0 — originally this was gated to transaction_type == "RECEIVING"
    only, which left every OTHER qty_in path (Stock Movement transfers, Sales
    Return restocks, Stock Opname positive adjustments) permanently stamping
    a brand-new bucket at avg_cost=0 the first time it was touched, since
    nothing ever revisited it afterwards. Any caller that knows the correct
    cost for the stock it's adding (Receiving's purchase_price, a Transfer's
    source-bucket avg_cost, a Sales Return's originating sale cost) should
    pass unit_cost_override so the bucket's cost basis stays correct from
    the moment it's created:

        new_avg = (old_qty * old_avg + qty_in * unit_cost_override) / (old_qty + qty_in)

    falling back to new_avg = unit_cost_override when old_qty <= 0 (new bucket or
    stock had gone to zero) to avoid division-by-zero and stale-cost carryover.
    Callers that don't pass unit_cost_override (Sales/Damaged/Supplier Return/
    Transfer-Out/Exchange-Out are qty_out-only anyway) leave avg_cost
    untouched — the ledger row's unit_cost/total_value are stamped from the
    (possibly just-updated) avg_cost so callers can read it back immediately
    after this call.
    """
    inventory = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.warehouse_id == warehouse_id,
        Inventory.inventory_type == inventory_type,
        Inventory.deleted_at.is_(None)
    ).first()

    if not inventory:
        inventory = Inventory(
            product_id=product_id,
            warehouse_id=warehouse_id,
            inventory_type=inventory_type,
            quantity=0,
            avg_cost=0,
            created_by=created_by
        )
        db.add(inventory)
        db.flush()

    if unit_cost_override is not None and qty_in > 0:
        old_qty = inventory.quantity or 0
        if old_qty <= 0:
            inventory.avg_cost = unit_cost_override
        else:
            inventory.avg_cost = (
                (old_qty * inventory.avg_cost) + (qty_in * unit_cost_override)
            ) / (old_qty + qty_in)

    inventory.quantity = inventory.quantity + qty_in - qty_out

    last_ledger = db.query(InventoryLedger).filter(
        InventoryLedger.product_id == product_id,
        InventoryLedger.warehouse_id == warehouse_id,
        InventoryLedger.inventory_type == inventory_type,
    ).order_by(InventoryLedger.ledger_id.desc()).first()

    balance = (last_ledger.balance if last_ledger else 0) + qty_in - qty_out
    unit_cost = inventory.avg_cost

    ledger = InventoryLedger(
        transaction_type=transaction_type,
        reference_no=reference_no,
        product_id=product_id,
        warehouse_id=warehouse_id,
        inventory_type=inventory_type,
        qty_in=qty_in,
        qty_out=qty_out,
        balance=balance,
        unit_cost=unit_cost,
        total_value=(balance * unit_cost) if unit_cost is not None else None,
        created_by=created_by
    )
    db.add(ledger)
    return inventory
