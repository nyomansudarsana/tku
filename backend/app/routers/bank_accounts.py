from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.bank_account import BankAccount
from ..models.user import User
from ..schemas.bank_account import BankAccountCreate, BankAccountUpdate, BankAccountResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission

router = APIRouter(prefix="/bank-accounts", tags=["Bank Accounts"])


@router.get("", response_model=dict)
def list_bank_accounts(
    active_only: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(BankAccount).filter(BankAccount.deleted_at.is_(None))
    if active_only is True:
        q = q.filter(BankAccount.is_active == True)
    if search:
        q = q.filter(BankAccount.bank_name.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(BankAccount.bank_name).offset((page - 1) * limit).limit(limit).all()
    # Serialize ORM objects via Pydantic before returning in a plain dict response
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [BankAccountResponse.from_orm(b) for b in items],
    }


@router.post("", response_model=BankAccountResponse)
def create_bank_account(
    data: BankAccountCreate,
    current_user: User = Depends(require_permission("master_data.bank_accounts")),
    db: Session = Depends(get_db)
):
    bank = BankAccount(**data.dict(), created_by=current_user.username)
    db.add(bank)
    db.commit()
    db.refresh(bank)
    return bank


@router.get("/{bank_id}", response_model=BankAccountResponse)
def get_bank_account(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    bank = db.query(BankAccount).filter(
        BankAccount.bank_id == bank_id,
        BankAccount.deleted_at.is_(None)
    ).first()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return bank


@router.put("/{bank_id}", response_model=BankAccountResponse)
def update_bank_account(
    bank_id: int,
    data: BankAccountUpdate,
    current_user: User = Depends(require_permission("master_data.bank_accounts")),
    db: Session = Depends(get_db)
):
    bank = db.query(BankAccount).filter(
        BankAccount.bank_id == bank_id,
        BankAccount.deleted_at.is_(None)
    ).first()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(bank, field, value)
    bank.modified_by = current_user.username
    db.commit()
    db.refresh(bank)
    return bank


@router.delete("/{bank_id}")
def delete_bank_account(
    bank_id: int,
    current_user: User = Depends(require_permission("master_data.bank_accounts")),
    db: Session = Depends(get_db)
):
    bank = db.query(BankAccount).filter(
        BankAccount.bank_id == bank_id,
        BankAccount.deleted_at.is_(None)
    ).first()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank account not found")
    bank.deleted_at = datetime.utcnow()
    bank.deleted_by = current_user.username
    db.commit()
    return {"message": "Bank account deleted"}
