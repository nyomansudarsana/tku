from sqlalchemy import Column, Integer, String, Text
from ..database import Base
from .base import AuditMixin


class Store(Base, AuditMixin):
    __tablename__ = "stores"

    store_id = Column(Integer, primary_key=True, index=True)
    store_name = Column(String(100), nullable=False, index=True)
    location = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
