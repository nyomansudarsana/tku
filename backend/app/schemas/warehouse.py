from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class WarehouseBase(BaseModel):
    warehouse_name: str
    location: Optional[str] = None
    description: Optional[str] = None


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    warehouse_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None


class WarehouseResponse(WarehouseBase):
    warehouse_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
