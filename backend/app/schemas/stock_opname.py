from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import date, datetime


# ── Detail schemas ────────────────────────────────────────────────────────────

class StockOpnameDetailCreate(BaseModel):
    product_id:   int
    system_qty:   float = 0
    good_qty:     float = 0     # sellable units counted (user fills this)
    damaged_qty:  float = 0     # damaged units explicitly found (user fills this)
    reason:       Optional[str] = None
    remarks:      Optional[str] = None

    @field_validator("good_qty", "damaged_qty")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Quantity cannot be negative")
        return v


class StockOpnameDetailUpdate(BaseModel):
    good_qty:     Optional[float] = None
    damaged_qty:  Optional[float] = None
    reason:       Optional[str]   = None
    remarks:      Optional[str]   = None

    @field_validator("good_qty", "damaged_qty")
    @classmethod
    def non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("Quantity cannot be negative")
        return v


class _ProductInfo(BaseModel):
    product_id:   int
    product_name: str
    unit:         Optional[str] = None
    class Config:
        from_attributes = True


class StockOpnameDetailResponse(BaseModel):
    id:             int
    opname_id:      int
    product_id:     int
    system_qty:     float
    good_qty:       float = 0
    damaged_qty:    float = 0
    physical_qty:   float          # good_qty + damaged_qty
    difference_qty: float          # good_qty - system_qty  (inventory adjustment)
    reason:         Optional[str] = None
    remarks:        Optional[str] = None
    product:        Optional[_ProductInfo] = None
    class Config:
        from_attributes = True


# ── Header schemas ────────────────────────────────────────────────────────────

class StockOpnameCreate(BaseModel):
    opname_date:  date
    warehouse_id: Optional[int] = None
    store_id:     Optional[int] = None
    remarks:      Optional[str] = None
    performed_by: Optional[str] = None  # person who performed the physical count


class StockOpnameUpdate(BaseModel):
    opname_date:  Optional[date] = None
    warehouse_id: Optional[int]  = None
    store_id:     Optional[int]  = None
    status:       Optional[str]  = None
    remarks:      Optional[str]  = None
    performed_by: Optional[str]  = None


class _WarehouseInfo(BaseModel):
    warehouse_id:   int
    warehouse_name: str
    class Config:
        from_attributes = True


class _StoreInfo(BaseModel):
    store_id:   int
    store_name: str
    class Config:
        from_attributes = True


class StockOpnameResponse(BaseModel):
    opname_id:    int
    opname_date:  date
    warehouse_id: Optional[int] = None
    store_id:     Optional[int] = None
    status:       str
    remarks:      Optional[str] = None
    performed_by: Optional[str] = None
    approved_by:  Optional[str] = None
    warehouse:    Optional[_WarehouseInfo] = None
    store:        Optional[_StoreInfo]     = None
    details:      List[StockOpnameDetailResponse] = []
    created_at:   Optional[datetime] = None
    created_by:   Optional[str] = None

    class Config:
        from_attributes = True


class StockOpnameSummary(BaseModel):
    """Lightweight list item without details."""
    opname_id:    int
    opname_date:  date
    warehouse_id: Optional[int] = None
    store_id:     Optional[int] = None
    status:       str
    remarks:      Optional[str] = None
    performed_by: Optional[str] = None
    approved_by:  Optional[str] = None
    warehouse:    Optional[_WarehouseInfo] = None
    store:        Optional[_StoreInfo]     = None
    created_at:   Optional[datetime] = None
    created_by:   Optional[str] = None
    detail_count: int = 0

    class Config:
        from_attributes = True
