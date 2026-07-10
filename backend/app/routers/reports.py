"""
Phase 4 — Inventory & Sales reports, with Excel (.xlsx) export.

Both endpoints return JSON by default (for the on-screen table) and an
.xlsx file when `format=xlsx` is passed — mirroring the same `format`
query-param pattern already used by bulk_upload.py's template download.
Excel cells get raw numeric values (not pre-formatted currency strings) so
exported files stay usable for further spreadsheet calculation.
"""
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date
from ..database import get_db
from ..models.user import User
from ..models.inventory import Inventory
from ..models.damaged_stock import DamagedStock
from ..models.product import Product
from ..models.category import Category
from ..models.warehouse import Warehouse
from ..models.sales import Sales
from ..models.sales_detail import SalesDetail
from ..models.store import Store
from ..services.permissions import require_permission

router = APIRouter(prefix="/reports", tags=["Reports"])

VAT_RATE = 0.11


def _xlsx_response(headers: list, rows: list, filename: str) -> Response:
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status_code=422, detail="XLSX export requires openpyxl to be installed on the server.")
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Inventory Report ────────────────────────────────────────────────────────

def _compute_inventory_report(
    db: Session,
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None,
    inventory_type: Optional[str] = None,
) -> list:
    """
    Category/Warehouse/Inventory Type filters are all applied at the query
    level (via a join to Product for the category filter on both the
    Inventory and DamagedStock queries) rather than fetching everything and
    filtering in Python — the filtered set is exactly what both branches
    below iterate, so no unfiltered rows are ever built into a report row.
    """
    inv_q = (
        db.query(Inventory)
        .join(Product, Product.product_id == Inventory.product_id)
        .filter(Inventory.deleted_at.is_(None), Product.deleted_at.is_(None))
    )
    if warehouse_id:
        inv_q = inv_q.filter(Inventory.warehouse_id == warehouse_id)
    if category_id:
        inv_q = inv_q.filter(Product.category_id == category_id)
    if inventory_type:
        inv_q = inv_q.filter(Inventory.inventory_type == inventory_type)
    inventories = inv_q.all()

    dmg_q = (
        db.query(
            DamagedStock.product_id, DamagedStock.warehouse_id, DamagedStock.inventory_type,
            func.sum(DamagedStock.quantity).label("qty"),
        )
        .join(Product, Product.product_id == DamagedStock.product_id)
        .filter(DamagedStock.deleted_at.is_(None), Product.deleted_at.is_(None))
    )
    if warehouse_id:
        dmg_q = dmg_q.filter(DamagedStock.warehouse_id == warehouse_id)
    if category_id:
        dmg_q = dmg_q.filter(Product.category_id == category_id)
    if inventory_type:
        dmg_q = dmg_q.filter(DamagedStock.inventory_type == inventory_type)
    dmg_q = dmg_q.group_by(DamagedStock.product_id, DamagedStock.warehouse_id, DamagedStock.inventory_type)
    damaged_by_key = {
        (r.product_id, r.warehouse_id, r.inventory_type or "TKU Product"): r.qty or 0
        for r in dmg_q.all()
    }

    products = {p.product_id: p for p in db.query(Product).filter(Product.deleted_at.is_(None)).all()}
    categories = {c.category_id: c for c in db.query(Category).filter(Category.deleted_at.is_(None)).all()}
    warehouses = {w.warehouse_id: w for w in db.query(Warehouse).filter(Warehouse.deleted_at.is_(None)).all()}

    seen_keys = set()
    rows = []
    for inv in inventories:
        key = (inv.product_id, inv.warehouse_id, inv.inventory_type)
        seen_keys.add(key)
        product = products.get(inv.product_id)
        category = categories.get(product.category_id) if product and product.category_id else None
        warehouse = warehouses.get(inv.warehouse_id)
        damaged_qty = damaged_by_key.get(key, 0)
        # avg_cost defaults to 0 (not NULL) at the schema level for stock that
        # predates the costing feature — a literal "Rp 0 per unit" valuation
        # would be a misleading, not merely absent, figure, so treat 0 the
        # same as unknown here (unlike Sales Report's unit_cost, which is
        # genuinely nullable and where a confirmed 0 means deliberately-free
        # stock the user explicitly acknowledged at receiving time).
        has_cost = bool(inv.avg_cost)
        rows.append({
            "product_id": inv.product_id,
            "product_name": product.product_name if product else f"#{inv.product_id}",
            "category_id": product.category_id if product else None,
            "category_name": category.category_name if category else None,
            "warehouse_id": inv.warehouse_id,
            "warehouse_name": warehouse.warehouse_name if warehouse else None,
            "available_stock": inv.quantity,
            "damaged_stock": damaged_qty,
            "inventory_type": inv.inventory_type,
            "purchase_price": inv.avg_cost if has_cost else None,
            "inventory_value": round((inv.quantity or 0) * inv.avg_cost, 2) if has_cost else None,
        })

    # Buckets with damaged stock but no (or zero) Inventory row still deserve a
    # row — a product can be fully damaged-out with nothing left available.
    # damaged_by_key is already filtered (category/warehouse/type) by the
    # joined query above, so no extra filtering is needed here.
    for (product_id, wh_id, inv_type), damaged_qty in damaged_by_key.items():
        key = (product_id, wh_id, inv_type)
        if key in seen_keys:
            continue
        product = products.get(product_id)
        category = categories.get(product.category_id) if product and product.category_id else None
        warehouse = warehouses.get(wh_id)
        rows.append({
            "product_id": product_id,
            "product_name": product.product_name if product else f"#{product_id}",
            "category_id": product.category_id if product else None,
            "category_name": category.category_name if category else None,
            "warehouse_id": wh_id,
            "warehouse_name": warehouse.warehouse_name if warehouse else None,
            "available_stock": 0,
            "damaged_stock": damaged_qty,
            "inventory_type": inv_type,
            "purchase_price": None,
            "inventory_value": 0,
        })

    rows.sort(key=lambda r: (r["product_name"] or "", r["warehouse_name"] or ""))
    return rows


@router.get("/inventory")
def inventory_report(
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None,
    inventory_type: Optional[str] = None,
    format: str = Query("json", pattern="^(json|xlsx)$"),
    current_user: User = Depends(require_permission("inventory.view")),
    db: Session = Depends(get_db),
):
    rows = _compute_inventory_report(db, warehouse_id, category_id, inventory_type)
    if format == "xlsx":
        headers = [
            "Product", "Category", "Warehouse", "Available Stock", "Damaged Stock",
            "Inventory Type", "Purchase Price", "Inventory Value",
        ]
        na = lambda v: v if v is not None else "N/A"
        xlsx_rows = [
            [r["product_name"], r["category_name"], r["warehouse_name"], r["available_stock"],
             r["damaged_stock"], r["inventory_type"], na(r["purchase_price"]), na(r["inventory_value"])]
            for r in rows
        ]
        return _xlsx_response(headers, xlsx_rows, "inventory-report.xlsx")
    return {"items": rows, "total": len(rows)}


# ── Sales Report ─────────────────────────────────────────────────────────────

def _compute_sales_report(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    store_id: Optional[int] = None,
) -> list:
    q = (
        db.query(SalesDetail, Sales)
        .join(Sales, Sales.sales_id == SalesDetail.sales_id)
        .filter(Sales.deleted_at.is_(None))
    )
    if date_from:
        q = q.filter(Sales.sales_date >= date_from)
    if date_to:
        q = q.filter(Sales.sales_date <= date_to)
    if store_id:
        q = q.filter(Sales.store_id == store_id)
    q = q.order_by(Sales.sales_date.desc(), Sales.sales_id.desc())

    products = {p.product_id: p for p in db.query(Product).filter(Product.deleted_at.is_(None)).all()}
    stores = {s.store_id: s for s in db.query(Store).filter(Store.deleted_at.is_(None)).all()}

    rows = []
    for detail, sale in q.all():
        product = products.get(detail.product_id)
        store = stores.get(sale.store_id) if sale.store_id else None
        qty = detail.quantity or 0

        # Line-level figures back out of the already-computed, already-
        # discounted line_total/vat_amount so they match the exact figures on
        # the invoice rather than re-deriving with potential rounding drift.
        line_excl_vat = round((detail.line_total or 0) - (detail.vat_amount or 0), 2)
        line_vat      = detail.vat_amount
        line_incl_vat = detail.line_total

        # Per-unit figures for the report's display columns — dividing the
        # (already discount-adjusted) line totals by quantity so they reflect
        # the actual realized per-unit price, not the pre-discount list price.
        excl_vat_per_unit = round(line_excl_vat / qty, 2) if qty else None
        vat_per_unit      = round(line_vat / qty, 2) if qty and line_vat is not None else None
        incl_vat_per_unit = round(line_incl_vat / qty, 2) if qty and line_incl_vat is not None else None

        # Discount: pct applies uniformly across the line (not a per-unit
        # figure), but the amount is shown per-unit for consistency with the
        # other price columns above.
        discount_pct = detail.discount_pct
        line_discount_amount = detail.discount_amount
        discount_amount_per_unit = round(line_discount_amount / qty, 2) if qty and line_discount_amount is not None else None

        # Purchase Price is already per-unit (Inventory.avg_cost snapshotted
        # at sale time — see services/inventory_service.py). Margin formula
        # per spec: Margin = Sales Price Excl VAT − Purchase Price (per unit);
        # Margin % = Margin ÷ Purchase Price × 100 (a markup-on-cost %, not a
        # margin-on-revenue %) — both explicitly requested by the business.
        unit_cost = detail.unit_cost
        margin = None
        margin_pct = None
        line_margin = None
        if unit_cost is not None and excl_vat_per_unit is not None:
            margin = round(excl_vat_per_unit - unit_cost, 2)
            margin_pct = round(margin / unit_cost * 100, 2) if unit_cost else None
            line_margin = round(line_excl_vat - (unit_cost * qty), 2)

        rows.append({
            "sales_id": sale.sales_id,
            "sales_date": str(sale.sales_date),
            "store_name": store.store_name if store else None,
            "customer_name": sale.customer_name,
            "product_name": product.product_name if product else f"#{detail.product_id}",
            "quantity": qty,
            "purchase_price": unit_cost,
            "discount_pct": discount_pct,
            "discount_amount": discount_amount_per_unit,
            "sales_price_excl_vat": excl_vat_per_unit,
            "vat_amount": vat_per_unit,
            "sales_price_incl_vat": incl_vat_per_unit,
            "margin": margin,
            "margin_pct": margin_pct,
            # Line-level (quantity-weighted) totals — for aggregate footer/
            # summary figures only. Leading underscore marks them as
            # aggregation helpers, not report display columns (same
            # convention BulkUpload's preview table uses to hide internal
            # fields), so they're intentionally omitted from the Excel export.
            "_line_discount_amount": line_discount_amount,
            "_line_sales_price_excl_vat": line_excl_vat,
            "_line_vat_amount": line_vat,
            "_line_sales_price_incl_vat": line_incl_vat,
            "_line_margin": line_margin,
        })
    return rows


@router.get("/sales")
def sales_report(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    store_id: Optional[int] = None,
    format: str = Query("json", pattern="^(json|xlsx)$"),
    current_user: User = Depends(require_permission("sales.view")),
    db: Session = Depends(get_db),
):
    rows = _compute_sales_report(db, date_from, date_to, store_id)
    if format == "xlsx":
        headers = [
            "Sales Date", "Sales Number", "Store", "Customer", "Product", "Qty Sold",
            "Purchase Price", "Discount (%)", "Discount Amount",
            "Sales Price Ex VAT", "VAT", "Sales Price Inc VAT",
            "Margin", "Margin %",
        ]
        # Purchase Price / Margin / Margin % show "N/A" rather than a blank
        # cell when the underlying cost is unknown (pre-dates the costing
        # feature) — never a silently-wrong 0 or an empty-looking cell.
        na = lambda v: v if v is not None else "N/A"
        xlsx_rows = [
            [r["sales_date"], r["sales_id"], r["store_name"], r["customer_name"], r["product_name"],
             r["quantity"], na(r["purchase_price"]), r["discount_pct"], r["discount_amount"],
             r["sales_price_excl_vat"], r["vat_amount"],
             r["sales_price_incl_vat"], na(r["margin"]), na(r["margin_pct"])]
            for r in rows
        ]
        return _xlsx_response(headers, xlsx_rows, "sales-report.xlsx")
    return {"items": rows, "total": len(rows)}
