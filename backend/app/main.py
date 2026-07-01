import logging
import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import engine, Base, SessionLocal
from .migrate import run_migrations
from .routers import (
    auth, users, suppliers, categories, products,
    warehouses, stores, receiving, inventory,
    stock_movement, sales, dashboard, bank_accounts,
)
from .routers import sales_returns, bulk_upload
from .routers import supplier_returns, stock_opnames, damaged_stocks
from .routers import permissions as permissions_router
from .routers import notifications
from .routers import reports
from .routers import admin
from .services.permissions import seed_permission_catalog
# Ensure SalesDetail model is registered with SQLAlchemy before create_all()
from .models import sales_detail as _sales_detail_model  # noqa: F401

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ── Run schema migrations BEFORE SQLAlchemy create_all ─────────────────────
# Extract filesystem path from SQLite URL (handles both relative and absolute)
# sqlite:///./tku.db → ./tku.db   sqlite:////data/tku.db → /data/tku.db
_db_url = settings.DATABASE_URL
db_path = _db_url[len("sqlite:///"):] if _db_url.startswith("sqlite:///") else "tku.db"
try:
    run_migrations(db_path)
except Exception as exc:
    logger.error("Startup migration error: %s", exc)

Base.metadata.create_all(bind=engine)

# Seed the fixed permission catalog after tables exist — safe/idempotent on
# every startup, and avoids the chicken-and-egg gap of migrate.py running
# before create_all() creates the permissions table for the first time.
try:
    _seed_db = SessionLocal()
    seed_permission_catalog(_seed_db)
finally:
    _seed_db.close()

# ── FastAPI application ─────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Tech Kiosk Ubud — Inventory & Sales Management System",
    docs_url="/docs",
    redoc_url="/redoc",
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})

_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,  # credentials + wildcard is an HTTP protocol violation
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,              prefix="/api/v1")
app.include_router(users.router,             prefix="/api/v1")
app.include_router(suppliers.router,         prefix="/api/v1")
app.include_router(categories.router,        prefix="/api/v1")
app.include_router(products.router,          prefix="/api/v1")
app.include_router(warehouses.router,        prefix="/api/v1")
app.include_router(stores.router,            prefix="/api/v1")
app.include_router(receiving.router,         prefix="/api/v1")
app.include_router(inventory.router,         prefix="/api/v1")
app.include_router(stock_movement.router,    prefix="/api/v1")
app.include_router(sales.router,             prefix="/api/v1")
app.include_router(dashboard.router,         prefix="/api/v1")
app.include_router(bank_accounts.router,     prefix="/api/v1")
app.include_router(sales_returns.router,     prefix="/api/v1")
app.include_router(supplier_returns.router,  prefix="/api/v1")
app.include_router(stock_opnames.router,     prefix="/api/v1")
app.include_router(damaged_stocks.router,    prefix="/api/v1")
app.include_router(bulk_upload.router,       prefix="/api/v1")
app.include_router(permissions_router.router, prefix="/api/v1")
app.include_router(notifications.router,     prefix="/api/v1")
app.include_router(reports.router,           prefix="/api/v1")
app.include_router(admin.router,             prefix="/api/v1")


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION, "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
