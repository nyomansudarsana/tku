from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime

VALID_CONDITIONS = {"Good", "Defective", "Damaged", "Incomplete", "Pending Inspection"}
VALID_STATUSES = {
    "Submitted", "Under Inspection", "Approved",
    "Sent To Supplier", "Completed", "Rejected",
}
VALID_RETURN_TYPES = {"Product Replacement", "Broken Parts", "Exchange"}
VALID_PAYMENT_STATUSES = {"Paid", "Unpaid"}

# Valid forward transitions: current_status → {allowed next statuses}
STATUS_TRANSITIONS: dict = {
    "Submitted":        {"Under Inspection", "Rejected"},
    "Under Inspection": {"Approved", "Rejected"},
    "Approved":         {"Sent To Supplier", "Completed"},
    "Sent To Supplier": {"Completed"},
    "Completed":        set(),
    "Rejected":         set(),
}



class PartReplacementCreate(BaseModel):
    product_id: Optional[int] = None   # defaults to the parent return's product_id
    part_name: str
    quantity: int
    remarks: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v


class PartReplacementResponse(BaseModel):
    id: int
    sales_return_id: int
    product_id: int
    part_name: str
    quantity: int
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class ExchangeCreate(BaseModel):
    new_product_id: int
    quantity: Optional[int] = None   # defaults to the parent return's quantity

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if v is not None and v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v


class ExchangeProductInfo(BaseModel):
    product_id: int
    product_name: str

    class Config:
        from_attributes = True


class ExchangeResponse(BaseModel):
    exchange_id: int
    sales_return_id: int
    old_product_id: int
    new_product_id: int
    old_price: float
    new_price: float
    quantity: int
    difference_amount: float
    payment_status: str
    old_product: Optional[ExchangeProductInfo] = None
    new_product: Optional[ExchangeProductInfo] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SalesReturnBase(BaseModel):
    sales_id: int
    sales_detail_id: Optional[int] = None
    product_id: int
    warehouse_id: Optional[int] = None
    return_date: date
    quantity: int
    return_reason: Optional[str] = None
    condition: str = "Good"
    return_type: str = "Product Replacement"
    status: str = "Submitted"
    inventory_type: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v):
        if v not in VALID_CONDITIONS:
            raise ValueError(f"condition must be one of: {', '.join(VALID_CONDITIONS)}")
        return v

    @field_validator("return_type")
    @classmethod
    def validate_return_type(cls, v):
        if v not in VALID_RETURN_TYPES:
            raise ValueError(f"return_type must be one of: {', '.join(VALID_RETURN_TYPES)}")
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
    part_replacement: Optional[PartReplacementCreate] = None
    exchange: Optional[ExchangeCreate] = None


class SalesReturnUpdate(BaseModel):
    return_date:      Optional[date]  = None
    sales_detail_id:  Optional[int]   = None
    warehouse_id:     Optional[int]   = None
    quantity:         Optional[int]   = None
    return_reason:    Optional[str]   = None
    condition:        Optional[str]   = None
    return_type:      Optional[str]   = None
    status:           Optional[str]   = None
    inspection_notes: Optional[str]   = None
    inspected_by:     Optional[str]   = None
    remarks:          Optional[str]   = None
    exchange_payment_status: Optional[str] = None   # applied to the linked SalesExchange, if any

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v):
        if v is not None and v not in VALID_CONDITIONS:
            raise ValueError(f"condition must be one of: {', '.join(VALID_CONDITIONS)}")
        return v

    @field_validator("return_type")
    @classmethod
    def validate_return_type(cls, v):
        if v is not None and v not in VALID_RETURN_TYPES:
            raise ValueError(f"return_type must be one of: {', '.join(VALID_RETURN_TYPES)}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(VALID_STATUSES)}")
        return v

    @field_validator("exchange_payment_status")
    @classmethod
    def validate_exchange_payment_status(cls, v):
        if v is not None and v not in VALID_PAYMENT_STATUSES:
            raise ValueError(f"exchange_payment_status must be one of: {', '.join(VALID_PAYMENT_STATUSES)}")
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
    part_replacement: Optional[PartReplacementResponse] = None
    exchange:         Optional[ExchangeResponse]         = None
    created_at:       Optional[datetime] = None

    class Config:
        from_attributes = True
