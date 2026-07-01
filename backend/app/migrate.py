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

        # ── Add warehouse_id to supplier_returns ────────────────────────────
        _migrate_supplier_returns_v4(c)

        # ── Multi-item sales redesign ────────────────────────────────────────
        _migrate_sales_multiitem(c)

        # ── Stock Opname: good/damaged split + audit fields ──────────────────
        _migrate_stock_opname_v2(c)

        # ── TKU enhancement Phase 1: costing, ownership buckets, incomplete,
        #    integer quantities ───────────────────────────────────────────────
        _migrate_costing_v1(c)
        _migrate_inventory_buckets_v1(c)
        _migrate_stock_opname_incomplete_v1(c)
        _migrate_quantity_integer_v1(c)

        # ── Reports module: filter indexes ────────────────────────────────────
        _migrate_report_indexes_v1(c)

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


def _migrate_supplier_returns_v4(c) -> None:
    """Add warehouse_id to supplier_returns for inventory deduction tracking."""
    if not _table_exists(c, "supplier_returns"):
        return
    if not _column_exists(c, "supplier_returns", "warehouse_id"):
        c.execute(
            "ALTER TABLE supplier_returns ADD COLUMN warehouse_id INTEGER DEFAULT NULL"
        )
        logger.info("supplier_returns: added column warehouse_id")


# ── Multi-item sales redesign ─────────────────────────────────────────────────

def _migrate_sales_multiitem(c) -> None:
    """
    Phase 1: Create sales_details table.
    Phase 2: Rebuild sales table so product_id is nullable (required for multi-item sales
             which have no single product on the header).
    Phase 3: Migrate existing single-item sales rows into sales_details.
    """
    # ── Phase 1: Create sales_details ────────────────────────────────────────
    if not _table_exists(c, "sales_details"):
        c.execute("""
            CREATE TABLE sales_details (
                detail_id       INTEGER PRIMARY KEY AUTOINCREMENT,
                sales_id        INTEGER NOT NULL REFERENCES sales(sales_id),
                product_id      INTEGER NOT NULL REFERENCES products(product_id),
                quantity        REAL    NOT NULL DEFAULT 1,
                unit            TEXT    NOT NULL DEFAULT 'PCS',
                unit_price      REAL    NOT NULL DEFAULT 0,
                discount_pct    REAL    NOT NULL DEFAULT 0,
                discount_amount REAL    NOT NULL DEFAULT 0,
                vat_amount      REAL    NOT NULL DEFAULT 0,
                line_total      REAL    NOT NULL DEFAULT 0
            )
        """)
        logger.info("sales_details: table created")

    # ── Phase 2: Make sales.product_id nullable via table rebuild ────────────
    # Check if product_id column currently has NOT NULL constraint (notnull=1 in PRAGMA)
    c.execute("PRAGMA table_info(sales)")
    cols = {row[1]: row for row in c.fetchall()}   # col_name → row
    product_id_notnull = cols.get("product_id", (None, None, None, 0))[3]  # index 3 = notnull flag

    if product_id_notnull == 1:
        logger.info("sales: rebuilding table to make product_id, quantity, sale_price nullable")
        _rebuild_sales_nullable(c)
    else:
        logger.info("sales: product_id already nullable — skipping table rebuild")

    # ── Phase 3: Migrate existing single-item rows → sales_details ───────────
    c.execute("""
        INSERT INTO sales_details
            (sales_id, product_id, quantity, unit, unit_price,
             discount_pct, discount_amount, vat_amount, line_total)
        SELECT
            s.sales_id,
            s.product_id,
            COALESCE(s.quantity, 1),
            COALESCE(s.unit, 'PCS'),
            COALESCE(s.sale_price, 0),
            COALESCE(s.discount_pct, 0),
            COALESCE(s.discount_amount, 0),
            COALESCE(s.vat_amount, 0),
            COALESCE(s.grand_total, 0)
        FROM sales s
        WHERE s.product_id IS NOT NULL
          AND s.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM sales_details sd
              WHERE sd.sales_id = s.sales_id
          )
    """)
    migrated = c.rowcount
    if migrated:
        logger.info("sales_details: migrated %d existing single-item sales", migrated)


def _rebuild_sales_nullable(c) -> None:
    """
    SQLite does not support ALTER COLUMN. To make columns nullable we must:
      1. Rename existing table to a backup name
      2. Create new table with desired schema (nullable product_id etc.)
      3. Copy all rows
      4. Drop the backup table

    Foreign key enforcement is already OFF when this is called.
    """
    # Step 1 – rename original table
    c.execute("ALTER TABLE sales RENAME TO sales_old")

    # Step 2 – create new table with nullable per-item columns
    c.execute("""
        CREATE TABLE sales (
            sales_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            sales_date          DATE    NOT NULL,
            store_id            INTEGER REFERENCES stores(store_id),
            warehouse_id        INTEGER REFERENCES warehouses(warehouse_id),
            customer_name       VARCHAR(100),
            -- legacy per-item columns; NULL for new multi-item sales
            product_id          INTEGER REFERENCES products(product_id),
            quantity            REAL    DEFAULT 0,
            unit                VARCHAR(20) DEFAULT 'PCS',
            sale_price          REAL    DEFAULT 0,
            discount_pct        REAL    DEFAULT 0,
            -- header-level totals
            discount_amount     REAL    NOT NULL DEFAULT 0,
            vat_amount          REAL    NOT NULL DEFAULT 0,
            subtotal            REAL    NOT NULL DEFAULT 0,
            grand_total         REAL    NOT NULL DEFAULT 0,
            payment_method      VARCHAR(30) NOT NULL DEFAULT 'Cash',
            payment_status      VARCHAR(20) NOT NULL DEFAULT 'Paid',
            remarks             TEXT,
            bank_account_id     INTEGER REFERENCES bank_accounts(bank_id),
            transfer_reference  VARCHAR(100),
            edc_receipt_number  VARCHAR(50),
            edc_special_code    VARCHAR(50),
            tax_amount          REAL    NOT NULL DEFAULT 0,
            -- audit columns
            created_by          VARCHAR(100),
            created_at          DATETIME DEFAULT NULL,
            modified_by         VARCHAR(100),
            modified_at         DATETIME DEFAULT NULL,
            deleted_by          VARCHAR(100),
            deleted_at          DATETIME DEFAULT NULL
        )
    """)

    # Step 3 – copy data; use column names explicitly for safety
    c.execute("""
        INSERT INTO sales (
            sales_id, sales_date, store_id, warehouse_id, customer_name,
            product_id, quantity, unit, sale_price, discount_pct,
            discount_amount, vat_amount, subtotal, grand_total,
            payment_method, payment_status, remarks,
            bank_account_id, transfer_reference, edc_receipt_number, edc_special_code,
            tax_amount,
            created_by, created_at, modified_by, modified_at,
            deleted_by, deleted_at
        )
        SELECT
            sales_id, sales_date, store_id, warehouse_id, customer_name,
            product_id, quantity, unit, sale_price, discount_pct,
            COALESCE(discount_amount, 0), COALESCE(vat_amount, 0),
            COALESCE(subtotal, 0), COALESCE(grand_total, 0),
            COALESCE(payment_method, 'Cash'), COALESCE(payment_status, 'Paid'), remarks,
            bank_account_id, transfer_reference, edc_receipt_number, edc_special_code,
            COALESCE(tax_amount, 0),
            created_by, created_at, modified_by, modified_at,
            deleted_by, deleted_at
        FROM sales_old
    """)
    rows_copied = c.rowcount
    logger.info("sales rebuild: copied %d rows", rows_copied)

    # Step 4 – drop backup
    c.execute("DROP TABLE sales_old")
    logger.info("sales: table rebuilt with nullable product_id")


def _migrate_stock_opname_v2(c) -> None:
    """
    Add good_qty, damaged_qty to stock_opname_details.
    Add performed_by, approved_by to stock_opnames.

    Backfills existing rows: good_qty = physical_qty, damaged_qty = 0.
    difference_qty is already correct (physical - system) for old rows.
    For new rows, difference_qty = good_qty - system_qty — same formula
    since damaged_qty = 0 means physical_qty = good_qty for legacy rows.
    """
    if _table_exists(c, "stock_opname_details"):
        for col, defn in [
            ("good_qty",    "REAL NOT NULL DEFAULT 0"),
            ("damaged_qty", "REAL NOT NULL DEFAULT 0"),
        ]:
            if not _column_exists(c, "stock_opname_details", col):
                c.execute(f"ALTER TABLE stock_opname_details ADD COLUMN {col} {defn}")
                logger.info("stock_opname_details: added column %s", col)
        # Backfill: existing rows have good_qty = physical_qty (all stock was assumed good)
        c.execute("""
            UPDATE stock_opname_details
            SET good_qty = physical_qty
            WHERE good_qty = 0 AND physical_qty > 0
        """)
        if c.rowcount:
            logger.info(
                "stock_opname_details: backfilled good_qty from physical_qty for %d rows",
                c.rowcount,
            )

    if _table_exists(c, "stock_opnames"):
        for col, defn in [
            ("performed_by", "VARCHAR(100) DEFAULT NULL"),
            ("approved_by",  "VARCHAR(100) DEFAULT NULL"),
        ]:
            if not _column_exists(c, "stock_opnames", col):
                c.execute(f"ALTER TABLE stock_opnames ADD COLUMN {col} {defn}")
                logger.info("stock_opnames: added column %s", col)
        # Backfill approved_by from modified_by for already-approved opnames
        c.execute("""
            UPDATE stock_opnames
            SET approved_by = modified_by
            WHERE status = 'Approved' AND approved_by IS NULL AND modified_by IS NOT NULL
        """)


# ── TKU enhancement Phase 1 ────────────────────────────────────────────────────

def _migrate_costing_v1(c) -> None:
    """
    Purchase price → weighted-average costing.

    Adds purchase_price to receivings, avg_cost to inventories, and cost-
    snapshot columns to inventory_ledger/sales_details/damaged_stocks. All new
    columns are nullable/constant-defaulted so this is a plain ADD COLUMN pass
    — no table rebuild needed. Historical rows get purchase_price/avg_cost = 0
    (unknown pre-feature cost); best-effort backfilled below from
    supplier_products.cost_price where available.
    """
    if _table_exists(c, "receivings") and not _column_exists(c, "receivings", "purchase_price"):
        c.execute("ALTER TABLE receivings ADD COLUMN purchase_price REAL DEFAULT 0")
        logger.info("receivings: added column purchase_price")

    if _table_exists(c, "inventories") and not _column_exists(c, "inventories", "avg_cost"):
        c.execute("ALTER TABLE inventories ADD COLUMN avg_cost REAL DEFAULT 0")
        logger.info("inventories: added column avg_cost")

    if _table_exists(c, "inventory_ledger"):
        for col, defn in [
            ("unit_cost",   "REAL DEFAULT NULL"),
            ("total_value", "REAL DEFAULT NULL"),
        ]:
            if not _column_exists(c, "inventory_ledger", col):
                c.execute(f"ALTER TABLE inventory_ledger ADD COLUMN {col} {defn}")
                logger.info("inventory_ledger: added column %s", col)

    if _table_exists(c, "sales_details") and not _column_exists(c, "sales_details", "unit_cost"):
        c.execute("ALTER TABLE sales_details ADD COLUMN unit_cost REAL DEFAULT NULL")
        logger.info("sales_details: added column unit_cost")

    if _table_exists(c, "damaged_stocks"):
        for col, defn in [
            ("unit_cost",   "REAL DEFAULT NULL"),
            ("loss_amount", "REAL DEFAULT NULL"),
        ]:
            if not _column_exists(c, "damaged_stocks", col):
                c.execute(f"ALTER TABLE damaged_stocks ADD COLUMN {col} {defn}")
                logger.info("damaged_stocks: added column %s", col)

    # Best-effort backfill: seed avg_cost from the supplier's quoted cost_price
    # for inventory rows that predate purchase_price tracking (their true
    # historical cost is unknown). Rows with no supplier_products link are left
    # at 0 for manual correction via an opening adjustment receiving.
    if _table_exists(c, "inventories") and _table_exists(c, "supplier_products"):
        c.execute("""
            UPDATE inventories
            SET avg_cost = (
                SELECT sp.cost_price FROM supplier_products sp
                WHERE sp.product_id = inventories.product_id
                ORDER BY sp.id LIMIT 1
            )
            WHERE (avg_cost IS NULL OR avg_cost = 0)
              AND quantity > 0
              AND EXISTS (
                  SELECT 1 FROM supplier_products sp WHERE sp.product_id = inventories.product_id
              )
        """)
        if c.rowcount:
            logger.info(
                "inventories: backfilled avg_cost from supplier_products.cost_price for %d rows",
                c.rowcount,
            )


def _migrate_inventory_buckets_v1(c) -> None:
    """
    Ownership-bucket (inventory_type) relocation to Receiving.

    Inventory becomes keyed by (product_id, warehouse_id, inventory_type)
    instead of (product_id, warehouse_id) so the same product can carry
    separate TKU Product / Consignment / Titip Jual balances in one warehouse.
    No UniqueConstraint existed on inventories before this migration — the
    (product, warehouse) "key" was purely an application-level convention — so
    existing duplicates are defensively merged before creating the new
    constraint. A partial unique index (WHERE deleted_at IS NULL) is used
    instead of a full table rebuild since SQLite supports CREATE UNIQUE INDEX
    IF NOT EXISTS directly, and a table-level UNIQUE constraint would
    incorrectly also apply to soft-deleted rows.
    """
    if _table_exists(c, "inventories"):
        c.execute("""
            SELECT product_id, warehouse_id, inventory_type, MIN(inventory_id) AS keep_id,
                   SUM(quantity) AS total_qty, COUNT(*) AS cnt
            FROM inventories
            WHERE deleted_at IS NULL
            GROUP BY product_id, warehouse_id, inventory_type
            HAVING COUNT(*) > 1
        """)
        dup_groups = c.fetchall()
        for product_id, warehouse_id, inv_type, keep_id, total_qty, cnt in dup_groups:
            c.execute(
                "UPDATE inventories SET quantity = ? WHERE inventory_id = ?",
                (total_qty, keep_id),
            )
            c.execute("""
                UPDATE inventories SET deleted_at = datetime('now'), deleted_by = 'migration'
                WHERE product_id = ? AND warehouse_id = ? AND inventory_type = ?
                  AND inventory_id != ? AND deleted_at IS NULL
            """, (product_id, warehouse_id, inv_type, keep_id))
            logger.warning(
                "inventories: merged %d duplicate row(s) for product=%s warehouse=%s type=%s "
                "into inventory_id=%s (summed qty=%s) — review for correctness",
                cnt - 1, product_id, warehouse_id, inv_type, keep_id, total_qty,
            )

        c.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_inventories_bucket
            ON inventories(product_id, warehouse_id, inventory_type)
            WHERE deleted_at IS NULL
        """)

    if _table_exists(c, "receivings"):
        for col, defn in [
            ("inventory_type", "VARCHAR(30) DEFAULT 'TKU Product'"),
        ]:
            if not _column_exists(c, "receivings", col):
                c.execute(f"ALTER TABLE receivings ADD COLUMN {col} {defn}")
                logger.info("receivings: added column %s", col)

    for table in ("inventory_ledger", "sales_details", "damaged_stocks", "supplier_returns", "sales_returns"):
        if _table_exists(c, table) and not _column_exists(c, table, "inventory_type"):
            c.execute(f"ALTER TABLE {table} ADD COLUMN inventory_type VARCHAR(30) DEFAULT NULL")
            logger.info("%s: added column inventory_type", table)

    if _table_exists(c, "stock_opname_details") and not _column_exists(c, "stock_opname_details", "inventory_type"):
        c.execute("ALTER TABLE stock_opname_details ADD COLUMN inventory_type VARCHAR(30) DEFAULT NULL")
        logger.info("stock_opname_details: added column inventory_type")

    # ── Backfill inventory_type on existing rows from the matching Inventory
    #    bucket, falling back to 'TKU Product' where no match exists (e.g.
    #    pure historical records with no corresponding Inventory row). ────────
    if _table_exists(c, "inventories"):
        if _table_exists(c, "inventory_ledger"):
            # inventory_ledger was added to the column-add loop above but was
            # missed from this backfill pass originally — legacy rows stayed
            # NULL, which silently broke the per-bucket running `balance`
            # chain (a NULL != 'TKU Product' comparison means the "last
            # ledger for this bucket" lookup in update_inventory_balance()
            # can't find pre-Phase-1 entries, so balance restarts from 0
            # instead of continuing). balance itself is a display/audit
            # convenience, not the source of truth for stock (Inventory.
            # quantity is), so this didn't corrupt actual stock levels, but
            # it does need fixing for the ledger to be trustworthy and for
            # any logic that inspects ledger continuity (e.g. determining
            # whether a receiving is still safe to edit).
            c.execute("""
                UPDATE inventory_ledger
                SET inventory_type = (
                    SELECT i.inventory_type FROM inventories i
                    WHERE i.product_id = inventory_ledger.product_id
                      AND i.warehouse_id = inventory_ledger.warehouse_id
                      AND i.deleted_at IS NULL
                    LIMIT 1
                )
                WHERE inventory_type IS NULL
            """)
        if _table_exists(c, "damaged_stocks"):
            c.execute("""
                UPDATE damaged_stocks
                SET inventory_type = (
                    SELECT i.inventory_type FROM inventories i
                    WHERE i.product_id = damaged_stocks.product_id
                      AND i.warehouse_id = damaged_stocks.warehouse_id
                      AND i.deleted_at IS NULL
                    LIMIT 1
                )
                WHERE inventory_type IS NULL
            """)
        if _table_exists(c, "supplier_returns"):
            c.execute("""
                UPDATE supplier_returns
                SET inventory_type = (
                    SELECT i.inventory_type FROM inventories i
                    WHERE i.product_id = supplier_returns.product_id
                      AND i.warehouse_id = supplier_returns.warehouse_id
                      AND i.deleted_at IS NULL
                    LIMIT 1
                )
                WHERE inventory_type IS NULL
            """)
        if _table_exists(c, "sales_returns"):
            c.execute("""
                UPDATE sales_returns
                SET inventory_type = (
                    SELECT i.inventory_type FROM inventories i
                    WHERE i.product_id = sales_returns.product_id
                      AND i.warehouse_id = sales_returns.warehouse_id
                      AND i.deleted_at IS NULL
                    LIMIT 1
                )
                WHERE inventory_type IS NULL
            """)
        if _table_exists(c, "sales_details") and _table_exists(c, "sales"):
            c.execute("""
                UPDATE sales_details
                SET inventory_type = (
                    SELECT i.inventory_type FROM inventories i
                    JOIN sales s ON s.sales_id = sales_details.sales_id
                    WHERE i.product_id = sales_details.product_id
                      AND i.warehouse_id = s.warehouse_id
                      AND i.deleted_at IS NULL
                    LIMIT 1
                )
                WHERE inventory_type IS NULL
            """)
        if _table_exists(c, "stock_opname_details") and _table_exists(c, "stock_opnames"):
            c.execute("""
                UPDATE stock_opname_details
                SET inventory_type = (
                    SELECT i.inventory_type FROM inventories i
                    JOIN stock_opnames so ON so.opname_id = stock_opname_details.opname_id
                    WHERE i.product_id = stock_opname_details.product_id
                      AND i.warehouse_id = so.warehouse_id
                      AND i.deleted_at IS NULL
                    LIMIT 1
                )
                WHERE inventory_type IS NULL
            """)

    # Anything still unmatched (no corresponding Inventory row found) falls
    # back to the default bucket rather than staying NULL.
    for table in ("inventory_ledger", "damaged_stocks", "supplier_returns", "sales_returns", "sales_details", "stock_opname_details"):
        if _table_exists(c, table):
            c.execute(f"UPDATE {table} SET inventory_type = 'TKU Product' WHERE inventory_type IS NULL")

    # ── Repair running balance/total_value now that inventory_type is fixed ──
    # Legacy rows with inventory_type = NULL silently broke the "last ledger
    # for this bucket" lookup in update_inventory_balance() (NULL never equals
    # a non-null bucket string), so the running `balance` restarted from 0
    # partway through some buckets' real history instead of continuing. This
    # never corrupted actual stock (Inventory.quantity is the source of truth,
    # computed independently) — only the ledger's own display of a running
    # total was wrong. Ledger rows are an append-only log and ledger_id order
    # is chronological, so balance/total_value can be safely recomputed from
    # the authoritative qty_in/qty_out/unit_cost sequence; nothing else is
    # touched.
    if _table_exists(c, "inventory_ledger"):
        c.execute("SELECT DISTINCT product_id, warehouse_id, inventory_type FROM inventory_ledger")
        buckets = c.fetchall()
        fixed_rows = 0
        for product_id, warehouse_id, inv_type in buckets:
            c.execute("""
                SELECT ledger_id, qty_in, qty_out, unit_cost, balance FROM inventory_ledger
                WHERE product_id = ? AND warehouse_id = ? AND inventory_type = ?
                ORDER BY ledger_id
            """, (product_id, warehouse_id, inv_type))
            running = 0
            for ledger_id, qty_in, qty_out, unit_cost, old_balance in c.fetchall():
                running = running + (qty_in or 0) - (qty_out or 0)
                new_total_value = running * unit_cost if unit_cost is not None else None
                if old_balance != running:
                    c.execute(
                        "UPDATE inventory_ledger SET balance = ?, total_value = ? WHERE ledger_id = ?",
                        (running, new_total_value, ledger_id),
                    )
                    fixed_rows += 1
        if fixed_rows:
            logger.warning(
                "inventory_ledger: repaired running balance/total_value for %d row(s) "
                "whose bucket chain was broken by the inventory_type NULL gap",
                fixed_rows,
            )


def _migrate_stock_opname_incomplete_v1(c) -> None:
    """
    Add the 'Incomplete' stock condition — units physically present but no
    longer sellable as a complete product (e.g. cannibalized for spare parts).
    Routed to Damaged Stock on approval just like damaged_qty.
    """
    if not _table_exists(c, "stock_opname_details"):
        return
    if not _column_exists(c, "stock_opname_details", "incomplete_qty"):
        c.execute(
            "ALTER TABLE stock_opname_details ADD COLUMN incomplete_qty INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("stock_opname_details: added column incomplete_qty")


def _migrate_quantity_integer_v1(c) -> None:
    """
    Round any fractional quantity values to whole units. SQLite has no strict
    column-type enforcement (ALTER COLUMN TYPE isn't supported), so switching
    the SQLAlchemy models from Float to Integer doesn't itself change stored
    values — this pass defensively normalizes any legacy fractional data.
    Existing seed/production data is already integer-valued, so this is
    expected to be a no-op; it exists as a safety net, not a corrective fix.
    """
    targets = [
        ("receivings",           ["quantity_received", "quantity_accepted", "quantity_rejected"]),
        ("inventories",          ["quantity"]),
        ("sales",                ["quantity"]),
        ("sales_details",        ["quantity"]),
        ("sales_returns",        ["quantity"]),
        ("supplier_returns",     ["quantity"]),
        ("damaged_stocks",       ["quantity"]),
        ("stock_movements",      ["quantity"]),
        ("stock_opname_details", ["system_qty", "good_qty", "damaged_qty", "physical_qty", "difference_qty"]),
        ("products",             ["minimum_stock_level"]),
    ]
    for table, columns in targets:
        if not _table_exists(c, table):
            continue
        for col in columns:
            if not _column_exists(c, table, col):
                continue
            c.execute(f"""
                UPDATE {table}
                SET {col} = CAST(ROUND({col}) AS INTEGER)
                WHERE {col} IS NOT NULL AND {col} != CAST(ROUND({col}) AS INTEGER)
            """)
            if c.rowcount:
                logger.info(
                    "%s: rounded %d fractional value(s) in column %s to whole units",
                    table, c.rowcount, col,
                )


def _migrate_report_indexes_v1(c) -> None:
    """
    Indexes backing the Inventory Report's Category/Warehouse/Inventory Type
    filters (and the equivalent Damaged Stock join) — none of these FK/filter
    columns had an explicit index before. CREATE INDEX IF NOT EXISTS is
    idempotent and needs no table rebuild.
    """
    index_defs = [
        ("ix_products_category_id",        "products",       "category_id"),
        ("ix_inventories_product_id",      "inventories",    "product_id"),
        ("ix_inventories_warehouse_id",    "inventories",    "warehouse_id"),
        ("ix_inventories_inventory_type",  "inventories",    "inventory_type"),
        ("ix_damaged_stocks_product_id",   "damaged_stocks", "product_id"),
        ("ix_damaged_stocks_warehouse_id", "damaged_stocks", "warehouse_id"),
        ("ix_damaged_stocks_inventory_type", "damaged_stocks", "inventory_type"),
    ]
    for index_name, table, column in index_defs:
        if not _table_exists(c, table) or not _column_exists(c, table, column):
            continue
        c.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table}({column})")
