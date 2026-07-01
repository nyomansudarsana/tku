from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class InventoryLedger(Base):
    __tablename__ = "inventory_ledger"

    ledger_id = Column(Integer, primary_key=True, index=True)
    transaction_type = Column(String(30), nullable=False)
    reference_no = Column(String(100), nullable=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=False)
    # Ownership bucket this movement applies to (see ../constants.py); scopes the
    # running `balance` per bucket once Inventory is split by inventory_type.
    inventory_type = Column(String(30), nullable=True)
    qty_in = Column(Integer, default=0, nullable=False)
    qty_out = Column(Integer, default=0, nullable=False)
    balance = Column(Integer, default=0, nullable=False)
    # Cost snapshot at the moment of this movement (Inventory.avg_cost as read
    # inside update_inventory_balance()); total_value = balance * unit_cost.
    unit_cost = Column(Float, nullable=True)
    total_value = Column(Float, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    created_by = Column(String(100), nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
