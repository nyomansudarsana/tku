from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class BulkImportErrorSchema(BaseModel):
    row_number: Optional[int] = None
    error_message: str
    raw_data: Optional[str] = None

    class Config:
        from_attributes = True


class BulkImportHistoryResponse(BaseModel):
    import_id: int
    import_type: str
    filename: Optional[str] = None
    total_rows: int
    success_rows: int
    error_rows: int
    status: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BulkValidateResponse(BaseModel):
    import_type: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    preview: List[Dict[str, Any]]
    errors: List[BulkImportErrorSchema]


class BulkImportResponse(BaseModel):
    import_id: int
    import_type: str
    total_rows: int
    success_rows: int
    error_rows: int
    status: str
    errors: List[BulkImportErrorSchema] = []
