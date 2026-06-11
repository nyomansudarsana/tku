from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from ..database import Base


class SupplierProduct(Base):
    __tablename__ = "supplier_products"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    cost_price = Column(Float, default=0, nullable=True)
    created_at = Column(DateTime, default=func.now())

    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    product = relationship("Product", foreign_keys=[product_id])
