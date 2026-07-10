from pydantic import BaseModel, model_validator, field_validator
from typing import Optional
from datetime import date, datetime
from ..constants import INVENTORY_TYPES, DEFAULT_INVENTORY_TYPE


class ReceivingBase(BaseModel):
    """
    Base fields only — NO business-rule validators here.
    Validators in a base class would run on ReceivingResponse.from_orm() and
    crash the list endpoint on historical records that don't satisfy the check.
    """
    received_date:     date
    supplier_id:       Optional[int] = None
    product_id:        int
    warehouse_id:      Optional[int] = None
    quantity_received: int
    quantity_rejected: int = 0
    quantity_accepted: int = 0   # computed; stored for reporting
    unit:              str = "PCS"
    purchase_price:    float = 0
    inventory_type:    str = DEFAULT_INVENTORY_TYPE
    notes:             Optional[str] = None


class ReceivingCreate(BaseModel):
    """
    New workflow: user provides quantity_received + quantity_rejected.
    quantity_accepted is auto-calculated = quantity_received - quantity_rejected.

    warehouse_id is required — a receiving with no warehouse never posts to
    Inventory at all (see _apply_receiving_effect), silently leaving the
    product's avg_cost/quantity untouched even though a Receiving record
    exists. purchase_price must be > 0 for the same reason: it drives
    Inventory.avg_cost via the weighted-average blend, and a 0 gets blended
    in as a real cost, dragging avg_cost toward 0 on the very first receipt.
    """
    received_date:     date
    supplier_id:       Optional[int] = None
    product_id:        int
    warehouse_id:      int
    quantity_received: int
    quantity_rejected: int = 0
    # quantity_accepted sent by client is ignored — computed by validator below
    quantity_accepted: int = 0
    unit:              str = "PCS"
    purchase_price:    float
    inventory_type:    str = DEFAULT_INVENTORY_TYPE
    notes:             Optional[str] = None

    @field_validator("purchase_price")
    @classmethod
    def validate_purchase_price(cls, v):
        if v <= 0:
            raise ValueError("purchase_price must be greater than 0")
        return v

    @field_validator("inventory_type")
    @classmethod
    def validate_inventory_type(cls, v):
        if v not in INVENTORY_TYPES:
            raise ValueError(f"inventory_type must be one of: {', '.join(INVENTORY_TYPES)}")
        return v

    @model_validator(mode='after')
    def compute_accepted_qty(self) -> 'ReceivingCreate':
        """Enforce: accepted = received − rejected (min 0). Reject > received is an error."""
        received = self.quantity_received or 0
        rejected = self.quantity_rejected or 0
        if rejected < 0:
            raise ValueError("quantity_rejected cannot be negative")
        if rejected > received:
            raise ValueError(
                f"quantity_rejected ({rejected}) cannot exceed "
                f"quantity_received ({received})"
            )
        self.quantity_accepted = max(0, received - rejected)
        return self


class ReceivingUpdate(BaseModel):
    received_date:     Optional[date]  = None
    supplier_id:       Optional[int]   = None
    product_id:        Optional[int]   = None
    warehouse_id:      Optional[int]   = None
    quantity_received: Optional[int]   = None
    quantity_rejected: Optional[int]   = None
    quantity_accepted: Optional[int]   = None
    unit:              Optional[str]   = None
    purchase_price:    Optional[float] = None
    inventory_type:    Optional[str]   = None
    notes:             Optional[str]   = None

    @field_validator("inventory_type")
    @classmethod
    def validate_inventory_type(cls, v):
        if v is not None and v not in INVENTORY_TYPES:
            raise ValueError(f"inventory_type must be one of: {', '.join(INVENTORY_TYPES)}")
        return v

    @field_validator("purchase_price")
    @classmethod
    def validate_purchase_price(cls, v):
        if v is not None and v <= 0:
            raise ValueError("purchase_price must be greater than 0")
        return v

    @field_validator("warehouse_id")
    @classmethod
    def validate_warehouse_id(cls, v):
        if v is None:
            raise ValueError("warehouse_id is required — a receiving must always post to a warehouse")
        return v

    @model_validator(mode='after')
    def recalculate_if_needed(self) -> 'ReceivingUpdate':
        """If received or rejected changed, recalculate accepted."""
        received = self.quantity_received
        rejected = self.quantity_rejected
        if received is not None and rejected is not None:
            if rejected < 0:
                raise ValueError("quantity_rejected cannot be negative")
            if rejected > received:
                raise ValueError("quantity_rejected cannot exceed quantity_received")
            self.quantity_accepted = max(0, received - rejected)
        elif received is not None and self.quantity_accepted is None:
            # only received changed — clear accepted so caller must re-specify
            pass
        return self


class SupplierInfo(BaseModel):
    supplier_id:   int
    supplier_name: str
    class Config:
        from_attributes = True


class ProductInfo(BaseModel):
    product_id:   int
    product_name: str
    unit:         str
    class Config:
        from_attributes = True


class WarehouseInfo(BaseModel):
    warehouse_id:   int
    warehouse_name: str
    class Config:
        from_attributes = True


class ReceivingResponse(ReceivingBase):
    receiving_id: int
    supplier:     Optional[SupplierInfo]  = None
    product:      Optional[ProductInfo]   = None
    warehouse:    Optional[WarehouseInfo] = None
    created_at:   Optional[datetime]      = None

    class Config:
        from_attributes = True
