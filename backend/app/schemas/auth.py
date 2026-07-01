from pydantic import BaseModel
from typing import Optional, Dict


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    full_name: str
    role: str
    permissions: Dict[str, bool] = {}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
