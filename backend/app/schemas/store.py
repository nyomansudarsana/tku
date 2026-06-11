from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class StoreBase(BaseModel):
    store_name: str
    location: Optional[str] = None
    description: Optional[str] = None


class StoreCreate(StoreBase):
    pass


class StoreUpdate(BaseModel):
    store_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None


class StoreResponse(StoreBase):
    store_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
