"""
Database migration utility for TKU.
Runs at application startup to apply schema changes
that SQLAlchemy's create_all() cannot handle (ALTER TABLE).
All migrations are idempotent — safe to run multiple times.

SQLite constraint: ALTER TABLE ADD COLUMN only accepts CONSTANT defaults
(literal values like NULL, 0, '', etc.). Function calls like datetime('now')
are NOT allowed and raise "Cannot add a column with non-constant default".
The ORM (AuditMixin) handles timestamp generation at the Python layer, so
database-level defaults for created_at/modified_at are always NULL here.
"""
import sqlite3
import logging
import os

logger = logging.getLogger(__name__)

# Audit columns added by AuditMixin.
# ALL defaults must be constant literals — no datetime('now') or function calls.
AUDIT_COLS = [
    ("created_by",  "VARCHAR(100) DEFAULT NULL"),
    ("created_at",  "DATETIME     DEFAULT NULL"),
    ("modified_by", "VARCHAR(100) DEFAULT NULL"),
    ("modified_at", "DATETIME     DEFAULT NULL"),
    ("deleted_by",  "VARCHAR(100) DEFAULT NULL"),
    ("deleted_at",  "DATETIME     DEFAULT NULL"),
]

# Tables that use AuditMixin — all six audit columns must exist on these.
AUDITED_TABLES = [
    "suppliers", "categories", "products", "warehouses", "stores",
    "bank_accounts", "receivings", "inventories",
    "stock_movements", "sales", "sales_returns",
    "supplier_returns", "stock_opnames", "damaged_stocks",
]


def _column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def _table_exists(cursor, table: str) -> bool:
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    )
    return cursor.fetchone() is not None


def _add_audit_columns(c, table: str) -> None:
    if not _table_exists(c, table):
        return
    for col, definition in AUDIT_COLS:
        if not _column_exists(c, table, col):
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
            logger.info("%s: added audit column %s", table, col)


def run_migrations(db_path: str) -> None:
    if not os.path.exists(db_path):
        logger.info("Database not found — will be created by SQLAlchemy create_all()")
        return

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = OFF")
    c = conn.cursor()

    try:
        for table in AUDITED_TABLES:
            _add_audit_columns(c, table)

        # inventory_ledger uses minimal audit columns (no AuditMixin).
        if _table_exists(c, "inventory_ledger"):
            if not _column_exists(c, "inventory_ledger", "modified_at"):
                c.execute(
                    "ALTER TABLE inventory_ledger ADD COLUMN modified_at DATETIME DEFAULT NULL"
                )
                logger.info("inventory_ledger: added column modified_at")

        _migrate_sales(c)
        _migrate_supplier_products(c)
        _migrate_payment_status(c)
        _migrate_products(c)
        _migrate_products_supplier_id(c)
        _migrate_receivings(c)
        _migrate_sales_returns(c)
        _migrate_supplier_returns(c)
        _migrate_stock_opnames(c)
        _migrate_damaged_stocks(c)
        _migrate_bulk_import(c)
        _migrate_supplier_returns_v2(c)
        _migrate_sales_returns_v2(c)
        _migrate_supplier_returns_v3(c)

        conn.commit()
        logger.info("Database migrations completed successfully")
    except Exception as exc:
        conn.rollback()
        logger.error("Migration failed: %s", exc)
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.close()


def _migrate_sales(c) -> None:
    table = "sales"
    new_cols = [
        ("discount_pct",         "REAL    DEFAULT 0"),
        ("discount_amount",      "REAL    DEFAULT 0"),
        ("vat_amount",           "REAL    DEFAULT 0"),
        ("subtotal",             "REAL    DEFAULT 0"),
        ("grand_total",          "REAL    DEFAULT 0"),
        ("bank_account_id",      "INTEGER DEFAULT NULL"),
        ("transfer_reference",   "TEXT    DEFAULT NULL"),
        ("edc_receipt_number",   "TEXT    DEFAULT NULL"),
        ("edc_special_code",     "TEXT    DEFAULT NULL"),
        ("warehouse_id",         "INTEGER DEFAULT NULL"),
    ]
    for col, definition in new_cols:
        if not _column_exists(c, table, col):
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
            logger.info("sales: added column %s", col)


def _migrate_supplier_products(c) -> None:
    pass


def _migrate_payment_status(c) -> None:
    if _table_exists(c, "sales"):
        c.execute(
            "UPDATE sales SET payment_status = 'Unpaid' WHERE payment_status = 'Partial'"
        )
        affected = c.rowcount
        if affected:
            logger.info("sales: migrated %d 'Partial' rows to 'Unpaid'", affected)


def _migrate_products(c) -> None:
    if _table_exists(c, "products"):
        if not _column_exists(c, "products", "minimum_stock_level"):
            c.execute(
                "ALTER TABLE products ADD COLUMN minimum_stock_level REAL DEFAULT 0"
            )
            logger.info("products: added column minimum_stock_level")


def _migrate_products_supplier_id(c) -> None:
    """Add supplier_id to products; populate from supplier_products for existing data."""
    if not _table_exists(c, "products"):
        return
    if not _column_exists(c, "products", "supplier_id"):
        c.execute("ALTER TABLE products ADD COLUMN supplier_id INTEGER DEFAULT NULL")
        logger.info("products: added column supplier_id")
    # Populate rows where supplier_id is still NULL but a supplier_products link exists.
    # Takes the link with the lowest id (first-linked supplier) as the primary supplier.
    if _table_exists(c, "supplier_products"):
        c.execute("""
            UPDATE products
            SET supplier_id = (
                SELECT sp.supplier_id FROM supplier_products sp
                WHERE sp.product_id = products.product_id
                ORDER BY sp.id
                LIMIT 1
            )
            WHERE products.supplier_id IS NULL
              AND EXISTS (
                SELECT 1 FROM supplier_products sp
                WHERE sp.product_id = products.product_id
              )
        """)
        if c.rowcount:
            logger.info(
                "products: populated supplier_id from supplier_products for %d rows",
                c.rowcount,
            )


def _migrate_receivings(c) -> None:
    if _table_exists(c, "receivings"):
        for col, defn in [
            ("warehouse_id",       "INTEGER DEFAULT NULL"),
            ("quantity_received",  "REAL    DEFAULT 0"),
            ("quantity_accepted",  "REAL    DEFAULT 0"),
            ("quantity_rejected",  "REAL    DEFAULT 0"),
        ]:
            if not _column_exists(c, "receivings", col):
                c.execute(f"ALTER TABLE receivings ADD COLUMN {col} {defn}")
                logger.info("receivings: added column %s", col)


def _migrate_sales_returns(c) -> None:
    if not _table_exists(c, "sales_returns"):
        c.execute("""
            CREATE TABLE sales_returns (
                return_id    INTEGER PRIMARY KEY AUTOINCREMENT,
                sales_id     INTEGER NOT NULL REFERENCES sales(sales_id),
                product_id   INTEGER NOT NULL REFERENCES products(product_id),
                warehouse_id INTEGER REFERENCES warehouses(warehouse_id),
                return_date  DATE    NOT NULL,
                quantity     REAL    NOT NULL DEFAULT 0,
                return_reason TEXT,
                condition    TEXT    NOT NULL DEFAULT 'Good',
                status       TEXT    NOT NULL DEFAULT 'Pending',
                remarks      TEXT,
                created_by   VARCHAR(100),
                created_at   DATETIME DEFAULT NULL,
                modified_by  VARCHAR(100),
                modified_at  DATETIME DEFAULT NULL,
                deleted_by   VARCHAR(100),
                deleted_at   DATETIME DEFAULT NULL
            )
        """)
        logger.info("sales_returns: table created")


def _migrate_supplier_returns(c) -> None:
    if not _table_exists(c, "supplier_returns"):
        c.execute("""
            CREATE TABLE supplier_returns (
                return_id    INTEGER PRIMARY KEY AUTOINCREMENT,
                receiving_id INTEGER REFERENCES receivings(receiving_id),
                supplier_id  INTEGER NOT NULL REFERENCES suppliers(supplier_id),
                product_id   INTEGER NOT NULL REFERENCES products(product_id),
                return_date  DATE    NOT NULL,
                quantity     REAL    NOT NULL DEFAULT 0,
                reason       TEXT,
                status       TEXT    NOT NULL DEFAULT 'Pending',
                remarks      TEXT,
                created_by   VARCHAR(100),
                created_at   DATETIME DEFAULT NULL,
                modified_by  VARCHAR(100),
                modified_at  DATETIME DEFAULT NULL,
                deleted_by   VARCHAR(100),
                deleted_at   DATETIME DEFAULT NULL
            )
        """)
        logger.info("supplier_returns: table created")


def _migrate_stock_opnames(c) -> None:
    if not _table_exists(c, "stock_opnames"):
        c.execute("""
            CREATE TABLE stock_opnames (
                opname_id    INTEGER PRIMARY KEY AUTOINCREMENT,
                opname_date  DATE    NOT NULL,
                warehouse_id INTEGER REFERENCES warehouses(warehouse_id),
                store_id     INTEGER REFERENCES stores(store_id),
                status       TEXT    NOT NULL DEFAULT 'Draft',
                remarks      TEXT,
                created_by   VARCHAR(100),
                created_at   DATETIME DEFAULT NULL,
                modified_by  VARCHAR(100),
                modified_at  DATETIME DEFAULT NULL,
                deleted_by   VARCHAR(100),
                deleted_at   DATETIME DEFAULT NULL
            )
        """)
        logger.info("stock_opnames: table created")

    if not _table_exists(c, "stock_opname_details"):
        c.execute("""
            CREATE TABLE stock_opname_details (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                opname_id       INTEGER NOT NULL REFERENCES stock_opnames(opname_id),
                product_id      INTEGER NOT NULL REFERENCES products(product_id),
                system_qty      REAL    NOT NULL DEFAULT 0,
                physical_qty    REAL    NOT NULL DEFAULT 0,
                difference_qty  REAL    NOT NULL DEFAULT 0,
                reason          TEXT,
                remarks         TEXT
            )
        """)
        logger.info("stock_opname_details: table created")


def _migrate_damaged_stocks(c) -> None:
    if not _table_exists(c, "damaged_stocks"):
        c.execute("""
            CREATE TABLE damaged_stocks (
                damaged_stock_id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id       INTEGER NOT NULL REFERENCES products(product_id),
                warehouse_id     INTEGER REFERENCES warehouses(warehouse_id),
                quantity         REAL    NOT NULL DEFAULT 0,
                damage_reason    TEXT    NOT NULL,
                damage_date      DATE    NOT NULL,
                source           TEXT,
                source_reference TEXT,
                remarks          TEXT,
                created_by   VARCHAR(100),
                created_at   DATETIME DEFAULT NULL,
                modified_by  VARCHAR(100),
                modified_at  DATETIME DEFAULT NULL,
                deleted_by   VARCHAR(100),
                deleted_at   DATETIME DEFAULT NULL
            )
        """)
        logger.info("damaged_stocks: table created")


def _migrate_supplier_returns_v2(c) -> None:
    """Add current_location and migrate legacy status values for supplier_returns."""
    if not _table_exists(c, "supplier_returns"):
        return
    if not _column_exists(c, "supplier_returns", "current_location"):
        c.execute(
            "ALTER TABLE supplier_returns ADD COLUMN current_location TEXT DEFAULT 'Return Staging Area'"
        )
        logger.info("supplier_returns: added column current_location")
    # Migrate old status values → new workflow statuses (idempotent)
    c.execute("""
        UPDATE supplier_returns SET status = CASE
            WHEN status = 'Pending'  THEN 'Pending Review'
            WHEN status = 'Approved' THEN 'Awaiting Shipment'
            WHEN status = 'Rejected' THEN 'Cancelled'
            ELSE status
        END
        WHERE status IN ('Pending', 'Approved', 'Rejected')
    """)
    if c.rowcount:
        logger.info("supplier_returns: migrated %d rows to new status values", c.rowcount)


def _migrate_sales_returns_v2(c) -> None:
    """Add workflow tracking fields and migrate legacy status values for sales_returns."""
    if not _table_exists(c, "sales_returns"):
        return
    new_cols = [
        ("current_location", "TEXT DEFAULT 'Receiving Area'"),
        ("inspection_notes", "TEXT DEFAULT NULL"),
        ("inspected_by",     "VARCHAR(100) DEFAULT NULL"),
        ("inspected_at",     "DATETIME DEFAULT NULL"),
    ]
    for col, defn in new_cols:
        if not _column_exists(c, "sales_returns", col):
            c.execute(f"ALTER TABLE sales_returns ADD COLUMN {col} {defn}")
            logger.info("sales_returns: added column %s", col)
    # Migrate Pending → Submitted (Approved and Rejected stay as-is)
    c.execute("UPDATE sales_returns SET status = 'Submitted' WHERE status = 'Pending'")
    if c.rowcount:
        logger.info("sales_returns: migrated %d 'Pending' rows to 'Submitted'", c.rowcount)


def _migrate_supplier_returns_v3(c) -> None:
    """Simplify supplier_returns to 5-status model (Pending, Ready To Send, Sent To Supplier, Completed, Cancelled)."""
    if not _table_exists(c, "supplier_returns"):
        return
    c.execute("""
        UPDATE supplier_returns SET status = CASE
            WHEN status = 'Pending Review'    THEN 'Pending'
            WHEN status = 'Awaiting Shipment' THEN 'Ready To Send'
            WHEN status = 'Shipped'           THEN 'Sent To Supplier'
            WHEN status = 'Supplier Rejected' THEN 'Cancelled'
            ELSE status
        END
        WHERE status IN ('Pending Review', 'Awaiting Shipment', 'Shipped', 'Supplier Rejected')
    """)
    if c.rowcount:
        logger.info("supplier_returns: migrated %d rows to simplified 5-status model", c.rowcount)


def _migrate_bulk_import(c) -> None:
    if not _table_exists(c, "bulk_import_history"):
        c.execute("""
            CREATE TABLE bulk_import_history (
                import_id    INTEGER PRIMARY KEY AUTOINCREMENT,
                import_type  TEXT    NOT NULL,
                filename     TEXT,
                total_rows   INTEGER DEFAULT 0,
                success_rows INTEGER DEFAULT 0,
                error_rows   INTEGER DEFAULT 0,
                status       TEXT    NOT NULL DEFAULT 'completed',
                created_by   VARCHAR(100),
                created_at   DATETIME DEFAULT NULL,
                modified_at  DATETIME DEFAULT NULL
            )
        """)
        logger.info("bulk_import_history: table created")

    if not _table_exists(c, "bulk_import_errors"):
        c.execute("""
            CREATE TABLE bulk_import_errors (
                error_id      INTEGER PRIMARY KEY AUTOINCREMENT,
                import_id     INTEGER NOT NULL REFERENCES bulk_import_history(import_id),
                row_number    INTEGER,
                error_message TEXT    NOT NULL,
                raw_data      TEXT,
                created_at    DATETIME DEFAULT NULL
            )
        """)
        logger.info("bulk_import_errors: table created")
