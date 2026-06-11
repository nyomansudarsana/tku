from sqlalchemy import Column, Integer, String, Text
from ..database import Base
from .base import AuditMixin


class Warehouse(Base, AuditMixin):
    __tablename__ = "warehouses"

    warehouse_id = Column(Integer, primary_key=True, index=True)
    warehouse_name = Column(String(100), nullable=False, index=True)
    location = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
