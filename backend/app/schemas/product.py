from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


def _blank_to_none(v):
    # products.sku is UNIQUE — SQLite treats '' as a real, colliding value
    # (unlike NULL), so a blank SKU must be stored as NULL, not ''.
    if v is None:
        return None
    v = v.strip()
    return v or None


class ProductBase(BaseModel):
    product_name: str
    supplier_id: Optional[int] = None
    category_id: Optional[int] = None
    sale_price: float = 0.0
    product_description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    unit: str = "PCS"
    status: str = "Active"
    minimum_stock_level: int = 0

    @field_validator("sku", mode="before")
    @classmethod
    def _normalize_sku(cls, v):
        return _blank_to_none(v)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    supplier_id: Optional[int] = None
    category_id: Optional[int] = None
    sale_price: Optional[float] = None
    product_description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    unit: Optional[str] = None
    status: Optional[str] = None
    minimum_stock_level: Optional[int] = None

    @field_validator("sku", mode="before")
    @classmethod
    def _normalize_sku(cls, v):
        return _blank_to_none(v)


class SupplierInfo(BaseModel):
    supplier_id: int
    supplier_name: str

    class Config:
        from_attributes = True


class CategoryInfo(BaseModel):
    category_id: int
    category_name: str

    class Config:
        from_attributes = True


class ProductResponse(ProductBase):
    product_id: int
    supplier: Optional[SupplierInfo] = None
    category: Optional[CategoryInfo] = None
    created_at: Optional[datetime] = None
    minimum_stock_level: int = 0
    available_stock: Optional[int] = None  # populated when in_stock_only=true

    class Config:
        from_attributes = True
