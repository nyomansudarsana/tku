from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class SalesDetail(Base):
    __tablename__ = "sales_details"

    detail_id     = Column(Integer, primary_key=True, index=True)
    sales_id      = Column(Integer, ForeignKey("sales.sales_id"), nullable=False, index=True)
    product_id    = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    quantity      = Column(Float, nullable=False, default=1)
    unit          = Column(String(20), default="PCS", nullable=False)
    unit_price    = Column(Float, nullable=False, default=0)   # VAT-inclusive unit price
    discount_pct  = Column(Float, default=0, nullable=False)   # 0–100
    discount_amount = Column(Float, default=0, nullable=False) # computed
    vat_amount    = Column(Float, default=0, nullable=False)   # computed
    line_total    = Column(Float, default=0, nullable=False)   # grand total for this line

    product = relationship("Product", foreign_keys=[product_id])
    sale    = relationship("Sales", back_populates="details", foreign_keys=[sales_id])
