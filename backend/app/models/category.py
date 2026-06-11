from sqlalchemy import Column, Integer, String, Text
from ..database import Base
from .base import AuditMixin


class Category(Base, AuditMixin):
    __tablename__ = "categories"

    category_id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
