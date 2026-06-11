from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SupplierBase(BaseModel):
    supplier_name: str
    supplier_contact: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_address: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    supplier_name: Optional[str] = None
    supplier_contact: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_address: Optional[str] = None


class SupplierResponse(SupplierBase):
    supplier_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
