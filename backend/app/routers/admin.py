import logging
import os
import random
import sqlite3
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.user import User
from ..models.supplier import Supplier
from ..models.product import Product
from ..models.warehouse import Warehouse
from ..models.store import Store
from ..services.auth import require_admin
from ..schemas.receiving import ReceivingCreate
from ..schemas.sales import SalesCreate, SalesDetailCreate
from .receiving import create_receiving as _create_receiving
from .sales import create_sale as _create_sale

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Admin"])

CONFIRM_PHRASE = "RESET TRANSACTIONS"

# Children before parents. SQLite here doesn't enforce FKs at runtime, but the
# order is kept correct anyway in case that ever changes.
_RESET_TABLES_IN_ORDER = [
    "payments",
    "sales_details",
    "sales_returns",
    "supplier_returns",
    "sales",
    "receivings",
    "stock_opname_details",
    "stock_opnames",
    "damaged_stocks",
    "stock_movements",
    "inventory_ledger",
    "inventories",
]


def _get_db_path() -> str:
    url = settings.DATABASE_URL
    return url[len("sqlite:///"):] if url.startswith("sqlite:///") else "tku.db"


def _backups_dir() -> str:
    base_dir = os.path.dirname(os.path.abspath(_get_db_path())) or "."
    backups_dir = os.path.join(base_dir, "backups")
    os.makedirs(backups_dir, exist_ok=True)
    return backups_dir


def _create_backup() -> str:
    """
    Safe live copy of the SQLite file via sqlite3's own online backup API
    (not a raw file copy, which risks reading a half-written page while the
    app is serving requests).
    """
    backup_path = os.path.join(
        _backups_dir(),
        f"tku_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.db",
    )
    src = sqlite3.connect(_get_db_path())
    try:
        dst = sqlite3.connect(backup_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return backup_path


class ResetConfirm(BaseModel):
    confirm_phrase: str


@router.get("/backups")
def list_backups(current_user: User = Depends(require_admin)):
    backups_dir = _backups_dir()
    items = []
    for name in sorted(os.listdir(backups_dir), reverse=True):
        if not name.endswith(".db"):
            continue
        full = os.path.join(backups_dir, name)
        items.append({
            "filename": name,
            "size_bytes": os.path.getsize(full),
            "created_at": datetime.utcfromtimestamp(os.path.getmtime(full)).isoformat(),
        })
    return {"items": items}


@router.post("/backup")
def create_backup_endpoint(current_user: User = Depends(require_admin)):
    backup_path = _create_backup()
    logger.warning("Manual database backup created by %s: %s", current_user.username, backup_path)
    return {"message": "Backup created", "filename": os.path.basename(backup_path)}


@router.post("/reset-transactions")
def reset_transactions(
    payload: ResetConfirm,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Deletes all transactional data (Receiving, Inventory, Inventory Ledger,
    Sales/Sales Details/Payments, Sales Returns, Supplier Returns, Stock
    Opname, Damaged Stock, Stock Movement) while preserving master data
    (Users, Suppliers, Products, Warehouses, Stores, Bank Accounts,
    Categories, Permissions). Always takes an automatic backup first.
    """
    if payload.confirm_phrase != CONFIRM_PHRASE:
        raise HTTPException(
            status_code=400,
            detail=f'Confirmation phrase does not match. Type exactly: "{CONFIRM_PHRASE}"',
        )

    backup_path = _create_backup()

    has_sqlite_sequence = db.execute(
        text("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    ).first() is not None

    deleted_counts = {}
    try:
        for table in _RESET_TABLES_IN_ORDER:
            result = db.execute(text(f"DELETE FROM {table}"))
            deleted_counts[table] = result.rowcount
            if has_sqlite_sequence:
                db.execute(text("DELETE FROM sqlite_sequence WHERE name = :t"), {"t": table})
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("reset_transactions failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reset failed, no changes were committed: {exc}")

    logger.warning(
        "Transaction data reset by %s. Backup: %s. Deleted counts: %s",
        current_user.username, os.path.basename(backup_path), deleted_counts,
    )
    return {
        "message": "Transaction data cleared successfully.",
        "backup_file": os.path.basename(backup_path),
        "deleted_counts": deleted_counts,
    }


@router.post("/load-demo-data")
def load_demo_data(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Generates demo Receiving + Sales transactions against EXISTING master data
    (Suppliers/Products/Warehouses/Stores), routed through the real
    create_receiving/create_sale business logic so demo data exercises the
    same costing/validation pipeline as real usage instead of raw SQL inserts.
    """
    suppliers = db.query(Supplier).filter(Supplier.deleted_at.is_(None)).all()
    products = db.query(Product).filter(Product.deleted_at.is_(None)).all()
    warehouses = db.query(Warehouse).filter(Warehouse.deleted_at.is_(None)).all()
    stores = db.query(Store).filter(Store.deleted_at.is_(None)).all()

    if not suppliers or not products or not warehouses or not stores:
        raise HTTPException(
            status_code=400,
            detail=(
                "Need at least one active Supplier, Product, Warehouse, and Store "
                "before loading demo data. Add master data first via the normal "
                "pages, then load demo transactions."
            ),
        )

    main_warehouse = warehouses[0]
    today = date.today()

    receivings_created = 0
    sellable_products = []
    for product in products:
        if not product.supplier_id:
            continue
        if product.sale_price and product.sale_price > 0:
            basic_price = product.sale_price / 1.11
            purchase_price = round(basic_price * 0.65 / 1000) * 1000
        else:
            purchase_price = 50000
        purchase_price = max(purchase_price, 1000)

        data = ReceivingCreate(
            received_date=today,
            supplier_id=product.supplier_id,
            product_id=product.product_id,
            warehouse_id=main_warehouse.warehouse_id,
            quantity_received=random.randint(20, 100),
            quantity_rejected=0,
            unit=product.unit or "PCS",
            purchase_price=float(purchase_price),
            inventory_type="TKU Product",
        )
        try:
            _create_receiving(data, current_user, db)
            receivings_created += 1
            sellable_products.append(product)
        except HTTPException as exc:
            logger.warning("Demo receiving skipped for product %s: %s", product.product_id, exc.detail)

    sales_created = 0
    demo_customers = ["Walk-in Customer", "Wayan", "Made", "Ketut", "Nyoman", "Putu"]
    sellable_with_price = [p for p in sellable_products if p.sale_price and p.sale_price > 0]
    for _ in range(min(15, len(sellable_with_price) * 2)):
        if not sellable_with_price:
            break
        product = random.choice(sellable_with_price)
        data = SalesCreate(
            sales_date=today,
            store_id=random.choice(stores).store_id,
            warehouse_id=main_warehouse.warehouse_id,
            customer_name=random.choice(demo_customers),
            payment_method=random.choice(["Cash", "Bank Transfer"]),
            payment_status="Paid",
            details=[SalesDetailCreate(
                product_id=product.product_id,
                quantity=random.randint(1, 3),
                unit=product.unit or "PCS",
                unit_price=product.sale_price,
                discount_pct=0,
            )],
        )
        try:
            _create_sale(data, current_user, db)
            sales_created += 1
        except HTTPException as exc:
            logger.warning("Demo sale skipped for product %s: %s", product.product_id, exc.detail)

    return {
        "message": "Demo data loaded",
        "receivings_created": receivings_created,
        "sales_created": sales_created,
        "warehouse_used": main_warehouse.warehouse_name,
    }
