from sqlalchemy import Column, Integer, String, Boolean
from ..database import Base
from .base import AuditMixin


class BankAccount(Base, AuditMixin):
    __tablename__ = "bank_accounts"

    bank_id = Column(Integer, primary_key=True, index=True)
    bank_name = Column(String(100), nullable=False)
    account_number = Column(String(50), nullable=False)
    beneficiary_name = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
