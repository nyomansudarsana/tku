from sqlalchemy import Column, Integer, String, Text
from ..database import Base
from .base import AuditMixin


class Supplier(Base, AuditMixin):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, index=True)
    supplier_name = Column(String(100), nullable=False, index=True)
    supplier_contact = Column(String(50), nullable=True)
    supplier_email = Column(String(100), nullable=True)
    supplier_address = Column(Text, nullable=True)
