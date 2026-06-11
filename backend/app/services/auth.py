from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..database import get_db
from ..models.user import User
from ..utils.security import verify_password, decode_access_token

security = HTTPBearer()


def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(
        User.username == username,
        User.deleted_at.is_(None)
    ).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="Account is inactive")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = db.query(User).filter(User.user_id == int(user_id), User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["Admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_manager_or_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Manager or Admin access required")
    return current_user
