from sqlalchemy import Column, Integer, String, Text, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class Receiving(Base, AuditMixin):
    __tablename__ = "receivings"

    receiving_id = Column(Integer, primary_key=True, index=True)
    received_date = Column(Date, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    quantity_received = Column(Float, default=0, nullable=False)
    quantity_accepted = Column(Float, default=0, nullable=False)
    quantity_rejected = Column(Float, default=0, nullable=False)
    unit = Column(String(20), default="PCS", nullable=False)
    notes = Column(Text, nullable=True)

    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    product = relationship("Product", foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
