from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime

VALID_STATUSES = {
    "Pending", "Ready To Send", "Sent To Supplier", "Completed", "Cancelled",
}

# Valid forward transitions: current_status → {allowed next statuses}
STATUS_TRANSITIONS: dict = {
    "Pending":          {"Ready To Send", "Cancelled"},
    "Ready To Send":    {"Sent To Supplier", "Cancelled"},
    "Sent To Supplier": {"Completed"},
    "Completed":        set(),
    "Cancelled":        set(),
}


class SupplierReturnCreate(BaseModel):
    supplier_id:  int
    product_id:   int
    return_date:  date
    quantity:     float
    reason:       Optional[str] = None
    status:       str = "Pending"
    remarks:      Optional[str] = None
    receiving_id: Optional[int] = None


class SupplierReturnUpdate(BaseModel):
    return_date:  Optional[date]  = None
    quantity:     Optional[float] = None
    reason:       Optional[str]   = None
    status:       Optional[str]   = None
    remarks:      Optional[str]   = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(VALID_STATUSES))}")
        return v


class _SupplierInfo(BaseModel):
    supplier_id:   int
    supplier_name: str
    class Config:
        from_attributes = True


class _ProductInfo(BaseModel):
    product_id:   int
    product_name: str
    class Config:
        from_attributes = True


class SupplierReturnResponse(BaseModel):
    return_id:    int
    receiving_id: Optional[int]  = None
    supplier_id:  int
    product_id:   int
    return_date:  date
    quantity:     float
    reason:       Optional[str]  = None
    status:       str
    remarks:      Optional[str]  = None
    supplier:     Optional[_SupplierInfo] = None
    product:      Optional[_ProductInfo]  = None
    created_at:   Optional[datetime] = None
    created_by:   Optional[str] = None

    class Config:
        from_attributes = True
