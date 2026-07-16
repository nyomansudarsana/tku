from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_
from typing import Optional
from datetime import date, datetime, timedelta
from ..database import get_db
from ..models.sales import Sales
from ..models.sales_detail import SalesDetail
from ..models.inventory import Inventory
from ..models.product import Product
from ..models.category import Category
from ..models.store import Store
from ..models.warehouse import Warehouse
from ..models.sales_return import SalesReturn
from ..models.supplier_return import SupplierReturn
from ..models.stock_opname import StockOpname
from ..models.damaged_stock import DamagedStock
from ..models.user import User
from ..services.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/sales-summary")
def sales_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    store_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    month_start = today.replace(day=1)

    base_q = db.query(Sales).filter(Sales.deleted_at.is_(None))
    if store_id:
        base_q = base_q.filter(Sales.store_id == store_id)
    if date_from:
        base_q = base_q.filter(Sales.sales_date >= date_from)
    if date_to:
        base_q = base_q.filter(Sales.sales_date <= date_to)

    daily_q = db.query(func.sum(Sales.grand_total)).filter(
        Sales.deleted_at.is_(None), Sales.sales_date == today
    )
    if store_id:
        daily_q = daily_q.filter(Sales.store_id == store_id)
    daily_sales = daily_q.scalar() or 0

    monthly_q = db.query(func.sum(Sales.grand_total)).filter(
        Sales.deleted_at.is_(None), Sales.sales_date >= month_start
    )
    if store_id:
        monthly_q = monthly_q.filter(Sales.store_id == store_id)
    monthly_sales = monthly_q.scalar() or 0

    total_transactions = base_q.count()
    total_revenue = base_q.with_entities(func.sum(Sales.grand_total)).scalar() or 0

    return {
        "daily_sales": daily_sales,
        "monthly_sales": monthly_sales,
        "total_transactions": total_transactions,
        "total_revenue": total_revenue,
    }


@router.get("/top-products")
def top_products(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    store_id: Optional[int] = None,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Aggregate by product across both multi-item sales (via SalesDetail) and
    legacy single-item sales (via Sales.product_id).
    """
    # Multi-item sales: join SalesDetail → Product
    q_detail = db.query(
        Product.product_id,
        Product.product_name,
        func.sum(SalesDetail.quantity).label("total_qty"),
        func.sum(SalesDetail.line_total).label("total_revenue"),
    ).join(SalesDetail, SalesDetail.product_id == Product.product_id
    ).join(Sales, and_(Sales.sales_id == SalesDetail.sales_id, Sales.deleted_at.is_(None))
    ).filter(Product.deleted_at.is_(None))
    if store_id:
        q_detail = q_detail.filter(Sales.store_id == store_id)
    if date_from:
        q_detail = q_detail.filter(Sales.sales_date >= date_from)
    if date_to:
        q_detail = q_detail.filter(Sales.sales_date <= date_to)
    q_detail = q_detail.group_by(Product.product_id, Product.product_name)
    detail_results = {r[0]: {"product_id": r[0], "product_name": r[1], "total_qty": float(r[2] or 0), "total_revenue": float(r[3] or 0)} for r in q_detail.all()}

    # Legacy single-item sales (product_id on header, no details)
    q_legacy = db.query(
        Product.product_id,
        Product.product_name,
        func.sum(Sales.quantity).label("total_qty"),
        func.sum(Sales.grand_total).label("total_revenue"),
    ).join(Sales, Sales.product_id == Product.product_id
    ).filter(
        Sales.deleted_at.is_(None),
        Product.deleted_at.is_(None),
        Sales.product_id.isnot(None),
        ~Sales.sales_id.in_(db.query(SalesDetail.sales_id).subquery()),
    )
    if store_id:
        q_legacy = q_legacy.filter(Sales.store_id == store_id)
    if date_from:
        q_legacy = q_legacy.filter(Sales.sales_date >= date_from)
    if date_to:
        q_legacy = q_legacy.filter(Sales.sales_date <= date_to)
    q_legacy = q_legacy.group_by(Product.product_id, Product.product_name)
    for r in q_legacy.all():
        if r[0] in detail_results:
            detail_results[r[0]]["total_qty"] += float(r[2] or 0)
            detail_results[r[0]]["total_revenue"] += float(r[3] or 0)
        else:
            detail_results[r[0]] = {"product_id": r[0], "product_name": r[1], "total_qty": float(r[2] or 0), "total_revenue": float(r[3] or 0)}

    results = sorted(detail_results.values(), key=lambda x: x["total_revenue"], reverse=True)
    return results[:limit]


@router.get("/sales-by-category")
def sales_by_category(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    store_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Aggregate revenue by category across multi-item and legacy single-item sales."""
    # Multi-item path (via SalesDetail)
    q_detail = db.query(
        Category.category_name,
        func.sum(SalesDetail.line_total).label("total"),
    ).join(Product, Product.category_id == Category.category_id
    ).join(SalesDetail, SalesDetail.product_id == Product.product_id
    ).join(Sales, and_(Sales.sales_id == SalesDetail.sales_id, Sales.deleted_at.is_(None))
    ).filter(Product.deleted_at.is_(None))
    if store_id:
        q_detail = q_detail.filter(Sales.store_id == store_id)
    if date_from:
        q_detail = q_detail.filter(Sales.sales_date >= date_from)
    if date_to:
        q_detail = q_detail.filter(Sales.sales_date <= date_to)
    q_detail = q_detail.group_by(Category.category_name)
    totals = {r[0]: float(r[1] or 0) for r in q_detail.all()}

    # Legacy single-item path
    detail_sales_subq = db.query(SalesDetail.sales_id).subquery()
    q_legacy = db.query(
        Category.category_name,
        func.sum(Sales.grand_total).label("total"),
    ).join(Product, Product.category_id == Category.category_id
    ).join(Sales, Sales.product_id == Product.product_id
    ).filter(
        Sales.deleted_at.is_(None),
        Product.deleted_at.is_(None),
        Sales.product_id.isnot(None),
        ~Sales.sales_id.in_(detail_sales_subq),
    )
    if store_id:
        q_legacy = q_legacy.filter(Sales.store_id == store_id)
    if date_from:
        q_legacy = q_legacy.filter(Sales.sales_date >= date_from)
    if date_to:
        q_legacy = q_legacy.filter(Sales.sales_date <= date_to)
    q_legacy = q_legacy.group_by(Category.category_name)
    for r in q_legacy.all():
        totals[r[0]] = totals.get(r[0], 0) + float(r[1] or 0)

    return [{"category": cat, "total": total} for cat, total in totals.items()]


@router.get("/sales-by-store")
def sales_by_store(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(
        Store.store_name,
        func.sum(Sales.grand_total).label("total"),
        func.count(Sales.sales_id).label("count")
    ).join(Sales, Sales.store_id == Store.store_id).filter(
        Sales.deleted_at.is_(None), Store.deleted_at.is_(None)
    )
    if date_from:
        q = q.filter(Sales.sales_date >= date_from)
    if date_to:
        q = q.filter(Sales.sales_date <= date_to)
    results = q.group_by(Store.store_name).all()
    return [{"store": r[0], "total": float(r[1] or 0), "count": r[2]} for r in results]


@router.get("/sales-trend")
def sales_trend(
    days: int = 30,
    store_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start_date = date.today() - timedelta(days=days)
    q = db.query(
        Sales.sales_date,
        func.sum(Sales.grand_total).label("total")
    ).filter(Sales.deleted_at.is_(None), Sales.sales_date >= start_date)
    if store_id:
        q = q.filter(Sales.store_id == store_id)
    results = q.group_by(Sales.sales_date).order_by(Sales.sales_date).all()
    return [{"date": str(r[0]), "total": float(r[1] or 0)} for r in results]


@router.get("/stock-summary")
def stock_summary(
    warehouse_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns overall stock counts using per-product minimum_stock_level.
    low_stock = items where 0 < quantity <= minimum_stock_level (or <= 5 if unset).
    """
    q = db.query(Inventory, Product).join(
        Product, Inventory.product_id == Product.product_id
    ).filter(
        Inventory.deleted_at.is_(None),
        Product.deleted_at.is_(None)
    )
    if warehouse_id:
        q = q.filter(Inventory.warehouse_id == warehouse_id)
    rows = q.all()

    total_items = len(rows)
    low_stock = 0
    out_of_stock = 0
    in_stock = 0

    for inv, prod in rows:
        threshold = prod.minimum_stock_level if prod.minimum_stock_level > 0 else 5
        if inv.quantity <= 0:
            out_of_stock += 1
        elif inv.quantity <= threshold:
            low_stock += 1
        else:
            in_stock += 1

    return {
        "total_items": total_items,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "in_stock": in_stock,
    }


def compute_low_stock(db: Session, warehouse_id: Optional[int] = None) -> list:
    """
    Shared by GET /dashboard/low-stock and GET /notifications/summary so both
    stay in sync on the same threshold logic. Products with
    minimum_stock_level = 0 use a fallback threshold of 5.
    """
    q = db.query(
        Product.product_id,
        Product.product_name,
        Product.unit,
        Product.minimum_stock_level,
        func.coalesce(func.sum(Inventory.quantity), 0).label("current_stock"),
        Warehouse.warehouse_id,
        Warehouse.warehouse_name,
    ).outerjoin(
        Inventory, and_(
            Inventory.product_id == Product.product_id,
            Inventory.deleted_at.is_(None),
        )
    ).outerjoin(
        Warehouse, Warehouse.warehouse_id == Inventory.warehouse_id
    ).filter(
        Product.deleted_at.is_(None),
        Product.status == "Active",
    )
    if warehouse_id:
        q = q.filter(Inventory.warehouse_id == warehouse_id)

    q = q.group_by(
        Product.product_id, Product.product_name, Product.unit,
        Product.minimum_stock_level, Warehouse.warehouse_id, Warehouse.warehouse_name
    )

    results = q.all()
    low = []
    for r in results:
        threshold = r.minimum_stock_level if r.minimum_stock_level > 0 else 5
        if r.current_stock <= threshold:
            status = "Out of Stock" if r.current_stock <= 0 else "Low Stock"
            low.append({
                "product_id": r.product_id,
                "product_name": r.product_name,
                "unit": r.unit,
                "minimum_stock_level": r.minimum_stock_level,
                "current_stock": float(r.current_stock),
                "warehouse_id": r.warehouse_id,
                "warehouse_name": r.warehouse_name,
                "status": status,
            })
    low.sort(key=lambda x: x["current_stock"])
    return low


@router.get("/low-stock")
def low_stock_list(
    warehouse_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    rows = compute_low_stock(db, warehouse_id)
    total = len(rows)
    start = (page - 1) * limit
    return {"items": rows[start:start + limit], "total": total, "page": page, "limit": limit}


@router.get("/sales-by-payment-method")
def sales_by_payment(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(
        Sales.payment_method,
        func.sum(Sales.grand_total).label("total"),
        func.count(Sales.sales_id).label("count")
    ).filter(Sales.deleted_at.is_(None))
    if date_from:
        q = q.filter(Sales.sales_date >= date_from)
    if date_to:
        q = q.filter(Sales.sales_date <= date_to)
    results = q.group_by(Sales.payment_method).all()
    return [{"method": r[0], "total": float(r[1] or 0), "count": r[2]} for r in results]


@router.get("/stock-by-location")
def stock_by_location(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns current stock grouped by warehouse / store location,
    each with a list of products and their quantities.
    """
    rows = db.query(
        Warehouse.warehouse_id,
        Warehouse.warehouse_name,
        Product.product_id,
        Product.product_name,
        Product.unit,
        Product.minimum_stock_level,
        func.coalesce(func.sum(Inventory.quantity), 0).label("quantity"),
    ).outerjoin(
        Inventory, and_(
            Inventory.warehouse_id == Warehouse.warehouse_id,
            Inventory.deleted_at.is_(None),
        )
    ).outerjoin(
        Product, and_(
            Product.product_id == Inventory.product_id,
            Product.deleted_at.is_(None),
        )
    ).filter(
        Warehouse.deleted_at.is_(None),
    ).group_by(
        Warehouse.warehouse_id, Warehouse.warehouse_name,
        Product.product_id, Product.product_name, Product.unit, Product.minimum_stock_level,
    ).order_by(
        Warehouse.warehouse_name, Product.product_name
    ).all()

    # Group by warehouse
    by_warehouse: dict = {}
    for r in rows:
        wid = r.warehouse_id
        if wid not in by_warehouse:
            by_warehouse[wid] = {
                "warehouse_id": wid,
                "warehouse_name": r.warehouse_name,
                "total_items": 0,
                "low_stock_count": 0,
                "products": [],
            }
        if r.product_id is None:
            continue
        qty = float(r.quantity or 0)
        threshold = r.minimum_stock_level if r.minimum_stock_level and r.minimum_stock_level > 0 else 5
        status = "Out of Stock" if qty <= 0 else ("Low Stock" if qty <= threshold else "OK")
        by_warehouse[wid]["products"].append({
            "product_id": r.product_id,
            "product_name": r.product_name,
            "unit": r.unit,
            "quantity": qty,
            "minimum_stock_level": r.minimum_stock_level or 0,
            "status": status,
        })
        by_warehouse[wid]["total_items"] += 1
        if status in ("Out of Stock", "Low Stock"):
            by_warehouse[wid]["low_stock_count"] += 1

    return list(by_warehouse.values())


@router.get("/outstanding-sales")
def outstanding_sales(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sales = db.query(Sales).filter(
        Sales.deleted_at.is_(None),
        Sales.payment_status.in_(["Unpaid", "Partial"])
    ).order_by(Sales.sales_date.desc()).limit(50).all()
    from ..schemas.sales import SalesResponse
    return [SalesResponse.from_orm(s) for s in sales]


@router.get("/pending-customer-returns")
def pending_customer_returns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns active (unresolved) customer returns for the dashboard widget."""
    rows = db.query(SalesReturn).options(
        joinedload(SalesReturn.product),
    ).filter(
        SalesReturn.deleted_at.is_(None),
        SalesReturn.status.in_(["Submitted", "Under Inspection"]),
    ).order_by(SalesReturn.return_date.desc()).limit(20).all()
    return [
        {
            "return_id":    r.return_id,
            "sales_id":     r.sales_id,
            "return_date":  str(r.return_date),
            "product_name": r.product.product_name if r.product else f"#{r.product_id}",
            "quantity":     r.quantity,
            "condition":    r.condition,
            "status":       r.status,
        }
        for r in rows
    ]


@router.get("/pending-supplier-returns")
def pending_supplier_returns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns pending / awaiting-shipment supplier returns for the dashboard widget."""
    rows = db.query(SupplierReturn).options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.product),
    ).filter(
        SupplierReturn.deleted_at.is_(None),
        SupplierReturn.status.in_(["Pending", "Ready To Send"]),
    ).order_by(SupplierReturn.return_date.desc()).limit(20).all()
    return [
        {
            "return_id":     r.return_id,
            "return_date":   str(r.return_date),
            "supplier_name": r.supplier.supplier_name if r.supplier else f"#{r.supplier_id}",
            "product_name":  r.product.product_name  if r.product  else f"#{r.product_id}",
            "quantity":      r.quantity,
            "reason":        r.reason,
            "status":        r.status,
        }
        for r in rows
    ]


@router.get("/supplier-returns-in-transit")
def supplier_returns_in_transit(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns supplier returns that are currently shipped (in transit)."""
    rows = db.query(SupplierReturn).options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.product),
    ).filter(
        SupplierReturn.deleted_at.is_(None),
        SupplierReturn.status == "Sent To Supplier",
    ).order_by(SupplierReturn.return_date.desc()).limit(20).all()
    return [
        {
            "return_id":     r.return_id,
            "return_date":   str(r.return_date),
            "supplier_name": r.supplier.supplier_name if r.supplier else f"#{r.supplier_id}",
            "product_name":  r.product.product_name  if r.product  else f"#{r.product_id}",
            "quantity":      r.quantity,
            "status":        r.status,
        }
        for r in rows
    ]


@router.get("/stock-opname-summary")
def stock_opname_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns last opname date and counts by status."""
    last = db.query(StockOpname).filter(
        StockOpname.deleted_at.is_(None),
        StockOpname.status == "Approved",
    ).order_by(StockOpname.opname_date.desc()).first()

    total        = db.query(func.count(StockOpname.opname_id)).filter(StockOpname.deleted_at.is_(None)).scalar() or 0
    draft_count  = db.query(func.count(StockOpname.opname_id)).filter(StockOpname.deleted_at.is_(None), StockOpname.status == "Draft").scalar() or 0
    approved_cnt = db.query(func.count(StockOpname.opname_id)).filter(StockOpname.deleted_at.is_(None), StockOpname.status == "Approved").scalar() or 0

    rejected_cnt = db.query(func.count(StockOpname.opname_id)).filter(StockOpname.deleted_at.is_(None), StockOpname.status == "Rejected").scalar() or 0
    return {
        "last_approved_date": str(last.opname_date) if last else None,
        "total_opnames":      total,
        "draft_count":        draft_count,
        "approved_count":     approved_cnt,
        "rejected_count":     rejected_cnt,
    }


@router.get("/damaged-stock-summary")
def damaged_stock_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Total damaged stock qty, product count, and recent records."""
    total_qty = db.query(func.sum(DamagedStock.quantity)).filter(
        DamagedStock.deleted_at.is_(None)
    ).scalar() or 0

    product_count = db.query(func.count(func.distinct(DamagedStock.product_id))).filter(
        DamagedStock.deleted_at.is_(None)
    ).scalar() or 0

    recent = db.query(DamagedStock).options(
        joinedload(DamagedStock.product),
        joinedload(DamagedStock.warehouse),
    ).filter(
        DamagedStock.deleted_at.is_(None)
    ).order_by(DamagedStock.damage_date.desc()).limit(10).all()

    return {
        "total_damaged_qty":  round(total_qty, 2),
        "affected_products":  product_count,
        "recent": [
            {
                "damaged_stock_id": r.damaged_stock_id,
                "damage_date":      str(r.damage_date),
                "product_name":     r.product.product_name if r.product else f"#{r.product_id}",
                "warehouse_name":   r.warehouse.warehouse_name if r.warehouse else "—",
                "quantity":         r.quantity,
                "damage_reason":    r.damage_reason,
                "source":           r.source,
            }
            for r in recent
        ],
    }
