from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    username: str
    full_name: str
    email: Optional[str] = None
    role: str = "Staff"
    status: str = "Active"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class UserResponse(UserBase):
    user_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ResetPasswordRequest(BaseModel):
    new_password: str
