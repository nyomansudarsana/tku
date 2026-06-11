from sqlalchemy import Column, Integer, String, Text, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class DamagedStock(Base, AuditMixin):
    __tablename__ = "damaged_stocks"

    damaged_stock_id = Column(Integer, primary_key=True, index=True)
    product_id       = Column(Integer, ForeignKey("products.product_id"),   nullable=False)
    warehouse_id     = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    quantity         = Column(Float,   nullable=False, default=0)
    damage_reason    = Column(String(100), nullable=False)
    damage_date      = Column(Date,    nullable=False, index=True)
    # 'Customer Return' | 'Stock Opname' | 'Manual'
    source           = Column(String(50),  nullable=True)
    source_reference = Column(String(100), nullable=True)  # e.g. RTN-12, OPNAME-7
    remarks          = Column(Text, nullable=True)

    product   = relationship("Product",   foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
