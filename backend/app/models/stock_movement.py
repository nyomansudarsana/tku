from sqlalchemy import Column, Integer, String, Text, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class StockMovement(Base, AuditMixin):
    __tablename__ = "stock_movements"

    movement_id = Column(Integer, primary_key=True, index=True)
    movement_date = Column(Date, nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    movement_type = Column(String(20), nullable=False)
    quantity = Column(Float, default=0, nullable=False)
    from_warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    to_warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    remark = Column(Text, nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    from_warehouse = relationship("Warehouse", foreign_keys=[from_warehouse_id])
    to_warehouse = relationship("Warehouse", foreign_keys=[to_warehouse_id])
