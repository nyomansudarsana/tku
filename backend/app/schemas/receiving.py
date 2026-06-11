from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import date, datetime


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
    quantity_received: float
    quantity_rejected: float = 0
    quantity_accepted: float = 0   # computed; stored for reporting
    unit:              str = "PCS"
    notes:             Optional[str] = None


class ReceivingCreate(BaseModel):
    """
    New workflow: user provides quantity_received + quantity_rejected.
    quantity_accepted is auto-calculated = quantity_received - quantity_rejected.
    """
    received_date:     date
    supplier_id:       Optional[int] = None
    product_id:        int
    warehouse_id:      Optional[int] = None
    quantity_received: float
    quantity_rejected: float = 0
    # quantity_accepted sent by client is ignored — computed by validator below
    quantity_accepted: float = 0
    unit:              str = "PCS"
    notes:             Optional[str] = None

    @model_validator(mode='after')
    def compute_accepted_qty(self) -> 'ReceivingCreate':
        """Enforce: accepted = received − rejected (min 0). Reject > received is an error."""
        received = self.quantity_received or 0.0
        rejected = self.quantity_rejected or 0.0
        if rejected < 0:
            raise ValueError("quantity_rejected cannot be negative")
        if rejected > received + 0.001:
            raise ValueError(
                f"quantity_rejected ({rejected}) cannot exceed "
                f"quantity_received ({received})"
            )
        self.quantity_accepted = max(0.0, round(received - rejected, 6))
        return self


class ReceivingUpdate(BaseModel):
    received_date:     Optional[date]  = None
    supplier_id:       Optional[int]   = None
    product_id:        Optional[int]   = None
    warehouse_id:      Optional[int]   = None
    quantity_received: Optional[float] = None
    quantity_rejected: Optional[float] = None
    quantity_accepted: Optional[float] = None
    unit:              Optional[str]   = None
    notes:             Optional[str]   = None

    @model_validator(mode='after')
    def recalculate_if_needed(self) -> 'ReceivingUpdate':
        """If received or rejected changed, recalculate accepted."""
        received = self.quantity_received
        rejected = self.quantity_rejected
        if received is not None and rejected is not None:
            if rejected < 0:
                raise ValueError("quantity_rejected cannot be negative")
            if rejected > received + 0.001:
                raise ValueError("quantity_rejected cannot exceed quantity_received")
            self.quantity_accepted = max(0.0, round(received - rejected, 6))
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
