from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime

# Stock Movement now only tracks warehouse-to-warehouse transfers — Receiving
# handles incoming stock, Sales handles outgoing stock, Returns handle return
# flows, and Stock Opname handles adjustments. Historical IN/OUT/ADJUSTMENT
# rows are preserved as read-only history, not migrated.
MOVEMENT_TYPE = "TRANSFER"


class StockMovementBase(BaseModel):
    movement_date: date
    product_id: int
    movement_type: str
    quantity: int
    from_warehouse_id: Optional[int] = None
    to_warehouse_id: Optional[int] = None
    remark: Optional[str] = None


class StockMovementCreate(BaseModel):
    movement_date: date
    product_id: int
    movement_type: str = MOVEMENT_TYPE
    quantity: int
    from_warehouse_id: int
    to_warehouse_id: int
    remark: Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v):
        if v != MOVEMENT_TYPE:
            raise ValueError(f"movement_type must be '{MOVEMENT_TYPE}' — Stock Movement only tracks warehouse transfers")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v

    @field_validator("to_warehouse_id")
    @classmethod
    def validate_different_warehouses(cls, v, info):
        if v is not None and info.data.get("from_warehouse_id") == v:
            raise ValueError("from_warehouse_id and to_warehouse_id must be different")
        return v


class StockMovementUpdate(BaseModel):
    movement_date: Optional[date] = None
    product_id: Optional[int] = None
    movement_type: Optional[str] = None
    quantity: Optional[int] = None
    from_warehouse_id: Optional[int] = None
    to_warehouse_id: Optional[int] = None
    remark: Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v):
        if v is not None and v != MOVEMENT_TYPE:
            raise ValueError(f"movement_type must be '{MOVEMENT_TYPE}' — Stock Movement only tracks warehouse transfers")
        return v


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
