from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class Payment(Base, AuditMixin):
    __tablename__ = "payments"

    payment_id = Column(Integer, primary_key=True, index=True)
    sales_id = Column(Integer, ForeignKey("sales.sales_id"), nullable=False)
    payment_method = Column(String(30), nullable=False)
    amount = Column(Float, default=0, nullable=False)
    payment_date = Column(Date, nullable=False)
    reference_no = Column(String(100), nullable=True)
    status = Column(String(20), default="Completed", nullable=False)

    sale = relationship("Sales", foreign_keys=[sales_id])
