from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime

VALID_REASONS = {
    "Broken", "Defective", "Expired", "Packaging Damaged",
    "Water Damage", "Customer Return - Defective", "Customer Return - Damaged",
    "Opname Variance - Damaged", "Other",
}


class DamagedStockBase(BaseModel):
    product_id:       int
    warehouse_id:     Optional[int]  = None
    quantity:         float
    damage_reason:    str
    damage_date:      date
    source:           Optional[str]  = "Manual"
    source_reference: Optional[str]  = None
    remarks:          Optional[str]  = None

    @field_validator("quantity")
    @classmethod
    def validate_qty(cls, v):
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v


class DamagedStockCreate(DamagedStockBase):
    pass


class DamagedStockUpdate(BaseModel):
    quantity:      Optional[float] = None
    damage_reason: Optional[str]   = None
    damage_date:   Optional[date]  = None
    warehouse_id:  Optional[int]   = None
    remarks:       Optional[str]   = None


class ProductInfo(BaseModel):
    product_id:   int
    product_name: str
    unit:         Optional[str] = None
    class Config:
        from_attributes = True


class WarehouseInfo(BaseModel):
    warehouse_id:   int
    warehouse_name: str
    class Config:
        from_attributes = True


class DamagedStockResponse(DamagedStockBase):
    damaged_stock_id: int
    product:          Optional[ProductInfo]   = None
    warehouse:        Optional[WarehouseInfo] = None
    created_at:       Optional[datetime]      = None
    created_by:       Optional[str]           = None

    class Config:
        from_attributes = True
