"""
Fine-grained menu/module permissions layered on top of the existing
User.role tier (Admin/Manager/Staff) — role stays the default-permission
source, permissions are per-user overrides on top of it (see
models/permission.py::UserPermission for why only deltas are stored).
"""
from typing import Dict
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.permission import Permission, UserPermission
from .auth import get_current_user

# ── Fixed permission catalog ────────────────────────────────────────────────
# Seeded into the `permissions` table at startup (see seed_permission_catalog
# below) purely so the Role Management screen can render/group checkboxes
# from one source of truth. Authorization decisions never query this table —
# they only consult ROLE_DEFAULTS + UserPermission overrides.
PERMISSION_CATALOG = [
    {"key": "master_data.suppliers",     "label": "Suppliers",               "group": "Master Data",     "sort_order": 1},
    {"key": "master_data.categories",    "label": "Categories",              "group": "Master Data",     "sort_order": 2},
    {"key": "master_data.products",      "label": "Products",                "group": "Master Data",     "sort_order": 3},
    {"key": "master_data.warehouses",    "label": "Warehouses",              "group": "Master Data",     "sort_order": 4},
    {"key": "master_data.stores",        "label": "Stores",                  "group": "Master Data",     "sort_order": 5},
    {"key": "master_data.bank_accounts", "label": "Bank Accounts",           "group": "Master Data",     "sort_order": 6},
    {"key": "receiving.view",            "label": "Receiving",               "group": "Receiving",       "sort_order": 10},
    {"key": "supplier_returns.view",     "label": "Supplier Returns",        "group": "Receiving",       "sort_order": 11},
    {"key": "inventory.view",            "label": "Inventory",               "group": "Inventory",       "sort_order": 20},
    {"key": "damaged_stock.view",        "label": "Damaged Stock",           "group": "Inventory",       "sort_order": 21},
    {"key": "stock_movement.view",       "label": "Stock Movement",          "group": "Inventory",       "sort_order": 22},
    {"key": "stock_opname.view",         "label": "Stock Opname",            "group": "Inventory",       "sort_order": 23},
    {"key": "stock_opname.approve",      "label": "Stock Opname — Approve",  "group": "Inventory",       "sort_order": 24},
    {"key": "sales.view",                "label": "Sales",                   "group": "Sales",           "sort_order": 30},
    {"key": "sales_returns.view",        "label": "Sales Returns",           "group": "Sales",           "sort_order": 31},
    {"key": "bulk_upload.view",          "label": "Bulk Upload",             "group": "Administration",  "sort_order": 40},
    {"key": "users.manage",              "label": "User Management",         "group": "Administration",  "sort_order": 41},
    {"key": "roles.manage",              "label": "Role Management",         "group": "Administration",  "sort_order": 42},
]
ALL_PERMISSION_KEYS = [p["key"] for p in PERMISSION_CATALOG]

# ── Default permission grant per role ───────────────────────────────────────
# This is what makes migration day a no-op for existing Admin/Manager users —
# nobody has a UserPermission row yet, so everyone falls back to their role's
# default here, which reproduces today's require_admin/require_manager_or_admin
# behavior exactly (Admin/Manager keep full access) while correctly
# restricting Staff to the areas named in the enhancement request.
_STAFF_GRANTED = {
    "master_data.suppliers", "receiving.view", "supplier_returns.view",
    "inventory.view", "damaged_stock.view", "stock_movement.view", "stock_opname.view",
    "sales.view", "sales_returns.view",
}
_MANAGER_DENIED = {"users.manage", "roles.manage"}

ROLE_DEFAULTS: Dict[str, Dict[str, bool]] = {
    "Admin":   {k: True for k in ALL_PERMISSION_KEYS},
    "Manager": {k: (k not in _MANAGER_DENIED) for k in ALL_PERMISSION_KEYS},
    "Staff":   {k: (k in _STAFF_GRANTED) for k in ALL_PERMISSION_KEYS},
}


def has_permission(user: User, db: Session, key: str) -> bool:
    override = db.query(UserPermission).filter(
        UserPermission.user_id == user.user_id,
        UserPermission.permission_key == key,
        UserPermission.deleted_at.is_(None),
    ).first()
    if override is not None:
        return override.granted
    return ROLE_DEFAULTS.get(user.role, {}).get(key, False)


def get_effective_permissions(user: User, db: Session) -> Dict[str, bool]:
    """Full {key: bool} map — role defaults merged with this user's overrides."""
    overrides = {
        o.permission_key: o.granted
        for o in db.query(UserPermission).filter(
            UserPermission.user_id == user.user_id,
            UserPermission.deleted_at.is_(None),
        ).all()
    }
    defaults = ROLE_DEFAULTS.get(user.role, {})
    return {key: overrides.get(key, defaults.get(key, False)) for key in ALL_PERMISSION_KEYS}


def require_permission(key: str):
    """FastAPI dependency factory — usage identical to require_admin, e.g.
    Depends(require_permission("master_data.products"))."""
    def _dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_permission(current_user, db, key):
            raise HTTPException(status_code=403, detail=f"Missing permission: {key}")
        return current_user
    return _dependency


def seed_permission_catalog(db: Session) -> None:
    """Idempotent upsert of the fixed catalog — safe to call on every startup."""
    existing_keys = {row[0] for row in db.query(Permission.permission_key).all()}
    for p in PERMISSION_CATALOG:
        if p["key"] in existing_keys:
            continue
        db.add(Permission(
            permission_key=p["key"], label=p["label"],
            group_label=p["group"], sort_order=p["sort_order"],
        ))
    db.commit()
