from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.sql import func
from ..database import Base
from .base import AuditMixin
import enum


class UserRole(str, enum.Enum):
    Admin = "Admin"
    Manager = "Manager"
    Staff = "Staff"


class UserStatus(str, enum.Enum):
    Active = "Active"
    Inactive = "Inactive"


class User(Base, AuditMixin):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="Staff", nullable=False)
    status = Column(String(20), default="Active", nullable=False)
