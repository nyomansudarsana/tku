from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime

VALID_CONDITIONS = {"Good", "Defective", "Damaged", "Pending Inspection"}
VALID_STATUSES = {
    "Submitted", "Under Inspection", "Approved",
    "Sent To Supplier", "Completed", "Rejected",
}

# Valid forward transitions: current_status → {allowed next statuses}
STATUS_TRANSITIONS: dict = {
    "Submitted":        {"Under Inspection", "Rejected"},
    "Under Inspection": {"Approved", "Rejected"},
    "Approved":         {"Sent To Supplier", "Completed"},
    "Sent To Supplier": {"Completed"},
    "Completed":        set(),
    "Rejected":         set(),
}



class SalesReturnBase(BaseModel):
    sales_id: int
    product_id: int
    warehouse_id: Optional[int] = None
    return_date: date
    quantity: float
    return_reason: Optional[str] = None
    condition: str = "Good"
    status: str = "Submitted"
    remarks: Optional[str] = None

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v):
        if v not in VALID_CONDITIONS:
            raise ValueError(f"condition must be one of: {', '.join(VALID_CONDITIONS)}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(VALID_STATUSES)}")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v


class SalesReturnCreate(SalesReturnBase):
    pass


class SalesReturnUpdate(BaseModel):
    return_date:      Optional[date]  = None
    warehouse_id:     Optional[int]   = None
    quantity:         Optional[float] = None
    return_reason:    Optional[str]   = None
    condition:        Optional[str]   = None
    status:           Optional[str]   = None
    inspection_notes: Optional[str]   = None
    inspected_by:     Optional[str]   = None
    remarks:          Optional[str]   = None

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v):
        if v is not None and v not in VALID_CONDITIONS:
            raise ValueError(f"condition must be one of: {', '.join(VALID_CONDITIONS)}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(VALID_STATUSES)}")
        return v


class SaleInfo(BaseModel):
    sales_id: int
    sales_date: date
    customer_name: Optional[str] = None

    class Config:
        from_attributes = True


class ProductInfo(BaseModel):
    product_id: int
    product_name: str
    unit: Optional[str] = None

    class Config:
        from_attributes = True


class WarehouseInfo(BaseModel):
    warehouse_id: int
    warehouse_name: str

    class Config:
        from_attributes = True


class SalesReturnResponse(SalesReturnBase):
    return_id:        int
    inspection_notes: Optional[str]  = None
    inspected_by:     Optional[str]  = None
    inspected_at:     Optional[datetime] = None
    sale:             Optional[SaleInfo]      = None
    product:          Optional[ProductInfo]   = None
    warehouse:        Optional[WarehouseInfo] = None
    created_at:       Optional[datetime] = None

    class Config:
        from_attributes = True
