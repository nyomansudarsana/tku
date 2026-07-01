from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import date, datetime


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


# ── Sales Detail ─────────────────────────────────────────────────────────────

class SalesDetailCreate(BaseModel):
    product_id: int
    quantity: int = 1
    unit: str = "PCS"
    unit_price: float          # VAT-inclusive price from product master
    discount_pct: float = 0    # 0–100
    # Ownership bucket to sell from; required only when the product has stock
    # in more than one bucket at the chosen warehouse (server returns a 400
    # listing the available buckets/quantities otherwise).
    inventory_type: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v

    @field_validator("discount_pct")
    @classmethod
    def validate_discount_pct(cls, v):
        if v < 0 or v > 100:
            raise ValueError("discount_pct must be between 0 and 100")
        return v

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price(cls, v):
        if v < 0:
            raise ValueError("unit_price cannot be negative")
        return v


class SalesDetailResponse(BaseModel):
    detail_id: int
    sales_id: int
    product_id: int
    product: Optional[ProductInfo] = None
    quantity: int
    unit: str
    unit_price: float
    discount_pct: float
    discount_amount: float
    vat_amount: float
    line_total: float
    inventory_type: Optional[str] = None
    unit_cost: Optional[float] = None

    class Config:
        from_attributes = True


# ── Sales Header ─────────────────────────────────────────────────────────────

class SalesCreate(BaseModel):
    sales_date: date
    store_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    customer_name: Optional[str] = None
    payment_method: str = "Cash"
    payment_status: str = "Paid"
    remarks: Optional[str] = None
    bank_account_id: Optional[int] = None
    transfer_reference: Optional[str] = None
    edc_receipt_number: Optional[str] = None
    edc_special_code: Optional[str] = None
    details: List[SalesDetailCreate]

    @field_validator("details")
    @classmethod
    def validate_details(cls, v):
        if not v:
            raise ValueError("A sale must have at least one product line item")
        # Prevent duplicate product_id in same transaction
        seen = {}
        for item in v:
            if item.product_id in seen:
                raise ValueError(
                    f"Product ID {item.product_id} appears more than once. "
                    "Merge quantities into a single line instead."
                )
            seen[item.product_id] = True
        return v


class SalesUpdate(BaseModel):
    sales_date: Optional[date] = None
    store_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    customer_name: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    remarks: Optional[str] = None
    bank_account_id: Optional[int] = None
    transfer_reference: Optional[str] = None
    edc_receipt_number: Optional[str] = None
    edc_special_code: Optional[str] = None
    details: Optional[List[SalesDetailCreate]] = None

    @field_validator("details")
    @classmethod
    def validate_details(cls, v):
        if v is not None:
            if not v:
                raise ValueError("details list cannot be empty")
            seen = {}
            for item in v:
                if item.product_id in seen:
                    raise ValueError(
                        f"Product ID {item.product_id} appears more than once."
                    )
                seen[item.product_id] = True
        return v


class SalesResponse(BaseModel):
    sales_id: int
    sales_date: date
    store_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    customer_name: Optional[str] = None
    payment_method: str
    payment_status: str
    subtotal: float
    discount_amount: float
    vat_amount: float
    grand_total: float
    remarks: Optional[str] = None
    bank_account_id: Optional[int] = None
    transfer_reference: Optional[str] = None
    edc_receipt_number: Optional[str] = None
    edc_special_code: Optional[str] = None
    tax_amount: Optional[float] = None   # legacy

    store: Optional[StoreInfo] = None
    warehouse: Optional[WarehouseInfo] = None
    bank_account: Optional[BankAccountInfo] = None
    details: List[SalesDetailResponse] = []

    # Legacy single-item fields (populated for pre-redesign records, null for new)
    product_id: Optional[int] = None
    product: Optional[ProductInfo] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    sale_price: Optional[float] = None
    discount_pct: Optional[float] = None

    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
