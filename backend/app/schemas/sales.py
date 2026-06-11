from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime


class SalesBase(BaseModel):
    sales_date: date
    store_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    customer_name: Optional[str] = None
    product_id: int
    quantity: float = 1
    unit: str = "PCS"
    sale_price: float = 0         # VAT-inclusive unit price from product master
    discount_pct: float = 0       # 0–100
    discount_amount: float = 0    # computed server-side
    vat_amount: float = 0         # extracted VAT, computed server-side
    subtotal: float = 0           # computed server-side
    grand_total: float = 0        # computed server-side
    payment_method: str = "Cash"
    payment_status: str = "Paid"
    remarks: Optional[str] = None
    bank_account_id: Optional[int] = None
    transfer_reference: Optional[str] = None
    edc_receipt_number: Optional[str] = None
    edc_special_code: Optional[str] = None
    tax_amount: Optional[float] = None   # legacy field; mirrors vat_amount


class SalesCreate(SalesBase):
    @field_validator("discount_pct")
    @classmethod
    def validate_discount_pct(cls, v):
        if v < 0 or v > 100:
            raise ValueError("discount_pct must be between 0 and 100")
        return v


class SalesUpdate(BaseModel):
    sales_date: Optional[date] = None
    store_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    customer_name: Optional[str] = None
    product_id: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    sale_price: Optional[float] = None
    discount_pct: Optional[float] = None
    discount_amount: Optional[float] = None
    vat_amount: Optional[float] = None
    subtotal: Optional[float] = None
    grand_total: Optional[float] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    remarks: Optional[str] = None
    bank_account_id: Optional[int] = None
    transfer_reference: Optional[str] = None
    edc_receipt_number: Optional[str] = None
    edc_special_code: Optional[str] = None

    @field_validator("discount_pct")
    @classmethod
    def validate_discount_pct(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError("discount_pct must be between 0 and 100")
        return v


# ── Nested info schemas ──────────────────────────────────────────────────────

class StoreInfo(BaseModel):
    store_id: int
    store_name: str

    class Config:
        from_attributes = True


class WarehouseInfo(BaseModel):
    warehouse_id: int
    warehouse_name: str

    class Config:
        from_attributes = True


class ProductInfo(BaseModel):
    product_id: int
    product_name: str
    unit: Optional[str] = None

    class Config:
        from_attributes = True


class BankAccountInfo(BaseModel):
    bank_id: int
    bank_name: str
    account_number: str
    beneficiary_name: str

    class Config:
        from_attributes = True


class SalesResponse(SalesBase):
    sales_id: int
    store: Optional[StoreInfo] = None
    warehouse: Optional[WarehouseInfo] = None
    product: Optional[ProductInfo] = None
    bank_account: Optional[BankAccountInfo] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
