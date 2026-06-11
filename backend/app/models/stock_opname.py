from sqlalchemy import Column, Integer, String, Float, Text, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class StockOpname(Base, AuditMixin):
    __tablename__ = "stock_opnames"

    opname_id    = Column(Integer, primary_key=True, index=True)
    opname_date  = Column(Date, nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    store_id     = Column(Integer, ForeignKey("stores.store_id"), nullable=True)
    status       = Column(String(20), nullable=False, default="Draft")  # Draft / Approved / Rejected
    remarks      = Column(Text, nullable=True)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    store     = relationship("Store",     foreign_keys=[store_id])
    details   = relationship("StockOpnameDetail", back_populates="opname",
                             cascade="all, delete-orphan")


class StockOpnameDetail(Base):
    __tablename__ = "stock_opname_details"

    id              = Column(Integer, primary_key=True, index=True)
    opname_id       = Column(Integer, ForeignKey("stock_opnames.opname_id"), nullable=False)
    product_id      = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    system_qty      = Column(Float, nullable=False, default=0)
    physical_qty    = Column(Float, nullable=False, default=0)
    difference_qty  = Column(Float, nullable=False, default=0)   # physical - system
    reason          = Column(String(100), nullable=True)
    remarks         = Column(Text, nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    opname  = relationship("StockOpname", back_populates="details")
