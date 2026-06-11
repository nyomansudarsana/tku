from sqlalchemy import Column, Integer, String, Float, Text, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class SupplierReturn(Base, AuditMixin):
    __tablename__ = "supplier_returns"

    return_id    = Column(Integer, primary_key=True, index=True)
    receiving_id = Column(Integer, ForeignKey("receivings.receiving_id"), nullable=True)
    supplier_id  = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False)
    product_id   = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    return_date  = Column(Date, nullable=False, index=True)
    quantity     = Column(Float, nullable=False, default=0)
    reason       = Column(String(200), nullable=True)
    # Pending / Ready To Send / Sent To Supplier / Completed / Cancelled
    status           = Column(String(30), nullable=False, default="Pending")
    current_location = Column(String(50), nullable=True)  # kept in DB, not exposed via API
    remarks      = Column(Text, nullable=True)

    supplier  = relationship("Supplier",  foreign_keys=[supplier_id])
    product   = relationship("Product",   foreign_keys=[product_id])
    receiving = relationship("Receiving", foreign_keys=[receiving_id])
