from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class Permission(Base):
    """
    Fixed catalog of menu/module permission keys — seeded at startup from
    services/permissions.py::PERMISSION_CATALOG. Not user-editable; exists as
    a table (rather than a hardcoded frontend list) so the Role Management
    checklist can be rendered/grouped from a single source of truth.
    """
    __tablename__ = "permissions"

    permission_key = Column(String(50), primary_key=True)
    label = Column(String(100), nullable=False)
    group_label = Column(String(50), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)


class UserPermission(Base, AuditMixin):
    """
    Per-user permission override — stores ONLY deltas from the user's role
    default (see services/permissions.py::ROLE_DEFAULTS). Absence of a row for
    a given (user_id, permission_key) means "inherit the role default" — this
    table is not a full grid, so migration day is a zero-touch no-op for every
    existing user.
    """
    __tablename__ = "user_permissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    permission_key = Column(String(50), ForeignKey("permissions.permission_key"), nullable=False)
    granted = Column(Boolean, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
