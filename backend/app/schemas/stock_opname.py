from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


# ── Detail schemas ────────────────────────────────────────────────────────────

class StockOpnameDetailCreate(BaseModel):
    product_id:   int
    system_qty:   float = 0
    physical_qty: float
    reason:       Optional[str] = None
    remarks:      Optional[str] = None


class StockOpnameDetailUpdate(BaseModel):
    physical_qty: Optional[float] = None
    reason:       Optional[str]   = None
    remarks:      Optional[str]   = None


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
    physical_qty:   float
    difference_qty: float
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


class StockOpnameUpdate(BaseModel):
    opname_date:  Optional[date] = None
    warehouse_id: Optional[int]  = None
    store_id:     Optional[int]  = None
    status:       Optional[str]  = None
    remarks:      Optional[str]  = None


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
    warehouse:    Optional[_WarehouseInfo] = None
    store:        Optional[_StoreInfo]     = None
    created_at:   Optional[datetime] = None
    created_by:   Optional[str] = None
    detail_count: int = 0

    class Config:
        from_attributes = True
