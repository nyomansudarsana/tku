from pydantic import BaseModel
from typing import Optional
from datetime import datetime


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
    minimum_stock_level: float = 0.0


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
    minimum_stock_level: Optional[float] = None


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
    minimum_stock_level: float = 0.0

    class Config:
        from_attributes = True
