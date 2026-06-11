from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class StockMovementBase(BaseModel):
    movement_date: date
    product_id: int
    movement_type: str
    quantity: float
    from_warehouse_id: Optional[int] = None
    to_warehouse_id: Optional[int] = None
    remark: Optional[str] = None


class StockMovementCreate(StockMovementBase):
    pass


class StockMovementUpdate(BaseModel):
    movement_date: Optional[date] = None
    product_id: Optional[int] = None
    movement_type: Optional[str] = None
    quantity: Optional[float] = None
    from_warehouse_id: Optional[int] = None
    to_warehouse_id: Optional[int] = None
    remark: Optional[str] = None


class ProductInfo(BaseModel):
    product_id: int
    product_name: str

    class Config:
        from_attributes = True


class WarehouseInfo(BaseModel):
    warehouse_id: int
    warehouse_name: str

    class Config:
        from_attributes = True


class StockMovementResponse(StockMovementBase):
    movement_id: int
    product: Optional[ProductInfo] = None
    from_warehouse: Optional[WarehouseInfo] = None
    to_warehouse: Optional[WarehouseInfo] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
