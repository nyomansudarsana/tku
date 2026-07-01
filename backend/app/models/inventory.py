from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin
from ..constants import DEFAULT_INVENTORY_TYPE


class Inventory(Base, AuditMixin):
    __tablename__ = "inventories"

    inventory_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=False, index=True)
    # Ownership bucket, set at Receiving time — see ../constants.py. Part of the
    # application-level upsert key in update_inventory_balance() alongside
    # product_id/warehouse_id, so the same product can carry separate TKU/
    # Consignment/Titip Jual balances in one warehouse.
    inventory_type = Column(String(30), default=DEFAULT_INVENTORY_TYPE, nullable=False, index=True)
    quantity = Column(Integer, default=0, nullable=False)
    # Running weighted-average cost per unit; recomputed only by RECEIVING
    # transactions in update_inventory_balance(). See migrate.py _migrate_costing_v1.
    avg_cost = Column(Float, default=0, nullable=False)
    unit = Column(String(20), default="PCS", nullable=False)
    remark = Column(Text, nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
