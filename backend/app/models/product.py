from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class Product(Base, AuditMixin):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String(150), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.category_id"), nullable=True, index=True)
    sale_price = Column(Float, default=0.0, nullable=False)
    product_description = Column(Text, nullable=True)
    sku = Column(String(50), unique=True, nullable=True, index=True)
    barcode = Column(String(100), nullable=True)
    unit = Column(String(20), default="PCS", nullable=False)
    status = Column(String(20), default="Active", nullable=False)
    minimum_stock_level = Column(Integer, default=0, nullable=False)

    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    category = relationship("Category", foreign_keys=[category_id])
