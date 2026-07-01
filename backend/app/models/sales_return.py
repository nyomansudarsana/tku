from sqlalchemy import Column, Integer, String, Text, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class SalesReturn(Base, AuditMixin):
    __tablename__ = "sales_returns"

    return_id    = Column(Integer, primary_key=True, index=True)
    sales_id     = Column(Integer, ForeignKey("sales.sales_id"), nullable=False, index=True)
    product_id   = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    return_date  = Column(Date, nullable=False, index=True)
    quantity     = Column(Integer, nullable=False, default=0)
    return_reason = Column(String(200), nullable=True)
    # Ownership bucket the returned unit was originally sold from (see
    # ../constants.py) — inherited from the matching SalesDetail at creation,
    # so "Good" returns restore to the correct bucket, not always TKU Product.
    inventory_type = Column(String(30), nullable=True)
    # Good / Defective / Damaged / Pending Inspection
    condition    = Column(String(50), nullable=False, default="Good")
    # Submitted / Under Inspection / Approved / Sent To Supplier / Completed / Rejected
    status       = Column(String(30), nullable=False, default="Submitted")
    # Receiving Area / Inspection Area / Available / Damaged Goods Area / In Transit / Disposed
    current_location = Column(String(50), nullable=True, default="Receiving Area")
    inspection_notes = Column(Text, nullable=True)
    inspected_by     = Column(String(100), nullable=True)
    inspected_at     = Column(DateTime, nullable=True)
    remarks      = Column(Text, nullable=True)

    sale      = relationship("Sales",     foreign_keys=[sales_id])
    product   = relationship("Product",   foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
