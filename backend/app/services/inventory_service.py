from sqlalchemy.orm import Session
from ..models.inventory import Inventory
from ..models.inventory_ledger import InventoryLedger


def update_inventory_balance(
    db: Session,
    product_id: int,
    warehouse_id: int,
    qty_in: float,
    qty_out: float,
    transaction_type: str,
    reference_no: str,
    created_by: str = "system"
):
    inventory = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.warehouse_id == warehouse_id,
        Inventory.deleted_at.is_(None)
    ).first()

    if not inventory:
        inventory = Inventory(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity=0,
            created_by=created_by
        )
        db.add(inventory)
        db.flush()

    inventory.quantity = inventory.quantity + qty_in - qty_out

    last_ledger = db.query(InventoryLedger).filter(
        InventoryLedger.product_id == product_id,
        InventoryLedger.warehouse_id == warehouse_id
    ).order_by(InventoryLedger.ledger_id.desc()).first()

    balance = (last_ledger.balance if last_ledger else 0) + qty_in - qty_out

    ledger = InventoryLedger(
        transaction_type=transaction_type,
        reference_no=reference_no,
        product_id=product_id,
        warehouse_id=warehouse_id,
        qty_in=qty_in,
        qty_out=qty_out,
        balance=balance,
        created_by=created_by
    )
    db.add(ledger)
    return inventory
