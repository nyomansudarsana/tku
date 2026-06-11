from datetime import datetime
from sqlalchemy import Column, String, DateTime


class AuditMixin:
    """
    Mixin that adds six audit-trail columns to any SQLAlchemy model.

    Uses Python-callable defaults (datetime.utcnow) NOT SQL function expressions
    (func.now()) so the timestamp is generated in Python and passed as a literal
    value in the INSERT. This avoids SQLite dialect issues with func.now() and
    also avoids the ALTER TABLE restriction on non-constant DEFAULT expressions.
    """
    created_by  = Column(String(100), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    modified_by = Column(String(100), nullable=True)
    modified_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    deleted_by  = Column(String(100), nullable=True)
    deleted_at  = Column(DateTime, nullable=True)
