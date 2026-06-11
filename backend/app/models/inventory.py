from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class Inventory(Base, AuditMixin):
    __tablename__ = "inventories"

    inventory_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=False)
    inventory_type = Column(String(30), default="TKU Product", nullable=False)
    quantity = Column(Float, default=0, nullable=False)
    unit = Column(String(20), default="PCS", nullable=False)
    remark = Column(Text, nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
