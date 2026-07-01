from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.user import User
from ..models.permission import Permission, UserPermission
from ..schemas.permission import PermissionCatalogItem, UserPermissionsResponse, UserPermissionsUpdate
from ..services.permissions import require_permission, get_effective_permissions, ROLE_DEFAULTS, ALL_PERMISSION_KEYS

router = APIRouter(tags=["Roles & Permissions"])


@router.get("/permissions", response_model=List[PermissionCatalogItem])
def list_permission_catalog(
    current_user: User = Depends(require_permission("roles.manage")),
    db: Session = Depends(get_db),
):
    """Fixed catalog, grouped/sorted for the Role Management checklist screen."""
    return db.query(Permission).order_by(Permission.sort_order).all()


def _load_user_permissions(db: Session, user_id: int) -> UserPermissionsResponse:
    user = db.query(User).filter(User.user_id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    overrides = {
        o.permission_key: o.granted
        for o in db.query(UserPermission).filter(
            UserPermission.user_id == user_id,
            UserPermission.deleted_at.is_(None),
        ).all()
    }
    return UserPermissionsResponse(
        user_id=user_id,
        role=user.role,
        effective=get_effective_permissions(user, db),
        overrides=overrides,
    )


@router.get("/users/{user_id}/permissions", response_model=UserPermissionsResponse)
def get_user_permissions(
    user_id: int,
    current_user: User = Depends(require_permission("roles.manage")),
    db: Session = Depends(get_db),
):
    return _load_user_permissions(db, user_id)


@router.put("/users/{user_id}/permissions", response_model=UserPermissionsResponse)
def update_user_permissions(
    user_id: int,
    data: UserPermissionsUpdate,
    current_user: User = Depends(require_permission("roles.manage")),
    db: Session = Depends(get_db),
):
    """
    Full-replace semantics: the payload is the complete desired checkbox state
    for every permission key. For each key, if the desired value matches the
    user's role default, any existing override row is removed (so the table
    only ever stores deltas); otherwise an override row is upserted.
    """
    user = db.query(User).filter(User.user_id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    unknown = set(data.overrides.keys()) - set(ALL_PERMISSION_KEYS)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown permission key(s): {', '.join(sorted(unknown))}")

    role_defaults = ROLE_DEFAULTS.get(user.role, {})
    existing_rows = {
        o.permission_key: o
        for o in db.query(UserPermission).filter(
            UserPermission.user_id == user_id,
            UserPermission.deleted_at.is_(None),
        ).all()
    }

    for key in ALL_PERMISSION_KEYS:
        desired = data.overrides.get(key, role_defaults.get(key, False))
        is_default = desired == role_defaults.get(key, False)
        row = existing_rows.get(key)
        if is_default:
            if row:
                db.delete(row)
        elif row:
            row.granted = desired
            row.modified_by = current_user.username
        else:
            db.add(UserPermission(
                user_id=user_id, permission_key=key, granted=desired,
                created_by=current_user.username,
            ))

    db.commit()
    return _load_user_permissions(db, user_id)
