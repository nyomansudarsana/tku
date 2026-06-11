from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BankAccountBase(BaseModel):
    bank_name: str
    account_number: str
    beneficiary_name: str
    is_active: bool = True


class BankAccountCreate(BankAccountBase):
    pass


class BankAccountUpdate(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    beneficiary_name: Optional[str] = None
    is_active: Optional[bool] = None


class BankAccountResponse(BankAccountBase):
    bank_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
