from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.category import Category
from ..models.user import User
from ..schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=dict)
def list_categories(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Category).filter(Category.deleted_at.is_(None))
    if search:
        q = q.filter(Category.category_name.ilike(f"%{search}%"))
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [CategoryResponse.from_orm(c) for c in items]}


@router.post("", response_model=CategoryResponse)
def create_category(data: CategoryCreate, current_user: User = Depends(require_permission("master_data.categories")), db: Session = Depends(get_db)):
    cat = Category(**data.dict(), created_by=current_user.username)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, data: CategoryUpdate, current_user: User = Depends(require_permission("master_data.categories")), db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(cat, field, value)
    cat.modified_by = current_user.username
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}")
def delete_category(category_id: int, current_user: User = Depends(require_permission("master_data.categories")), db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.deleted_at = datetime.utcnow()
    cat.deleted_by = current_user.username
    db.commit()
    return {"message": "Category deleted"}
