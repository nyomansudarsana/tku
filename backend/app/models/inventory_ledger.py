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
    qty_in = Column(Float, default=0, nullable=False)
    qty_out = Column(Float, default=0, nullable=False)
    balance = Column(Float, default=0, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    created_by = Column(String(100), nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
