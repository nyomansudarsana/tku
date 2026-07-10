from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class InventoryBase(BaseModel):
    product_id: int
    warehouse_id: int
    inventory_type: str = "TKU Product"
    quantity: int = 0
    unit: str = "PCS"
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


class InventoryResponse(InventoryBase):
    inventory_id: int
    avg_cost: float = 0
    product: Optional[ProductInfo] = None
    warehouse: Optional[WarehouseInfo] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
