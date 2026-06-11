from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class BulkImportHistory(Base):
    __tablename__ = "bulk_import_history"

    import_id = Column(Integer, primary_key=True, index=True)
    import_type = Column(String(50), nullable=False)
    filename = Column(String(255), nullable=True)
    total_rows = Column(Integer, default=0, nullable=False)
    success_rows = Column(Integer, default=0, nullable=False)
    error_rows = Column(Integer, default=0, nullable=False)
    status = Column(String(30), default="completed", nullable=False)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    modified_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=True)

    errors = relationship("BulkImportError", back_populates="import_record", cascade="all, delete-orphan")


class BulkImportError(Base):
    __tablename__ = "bulk_import_errors"

    error_id = Column(Integer, primary_key=True, index=True)
    import_id = Column(Integer, ForeignKey("bulk_import_history.import_id"), nullable=False)
    row_number = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=False)
    raw_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    import_record = relationship("BulkImportHistory", back_populates="errors")
