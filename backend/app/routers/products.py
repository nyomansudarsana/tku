from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.supplier_product import SupplierProduct
from ..models.user import User
from ..schemas.product import ProductCreate, ProductUpdate, ProductResponse
from ..services.auth import get_current_user
from ..services.permissions import require_permission

router = APIRouter(prefix="/products", tags=["Products"])


def _load_product(db: Session, product_id: int):
    return (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.supplier))
        .filter(Product.product_id == product_id, Product.deleted_at.is_(None))
        .first()
    )


def _sync_supplier_product(db: Session, product_id: int, supplier_id: Optional[int], old_supplier_id: Optional[int] = None):
    """Keep supplier_products in sync with products.supplier_id.

    Removes the old link (if supplier changed) and creates a new one (if set).
    The Suppliers page's Products management panel reads supplier_products, so
    keeping it in sync ensures both views remain consistent.
    """
    if old_supplier_id and old_supplier_id != supplier_id:
        db.query(SupplierProduct).filter(
            SupplierProduct.supplier_id == old_supplier_id,
            SupplierProduct.product_id == product_id,
        ).delete(synchronize_session=False)

    if supplier_id:
        exists = (
            db.query(SupplierProduct)
            .filter(
                SupplierProduct.supplier_id == supplier_id,
                SupplierProduct.product_id == product_id,
            )
            .first()
        )
        if not exists:
            db.add(SupplierProduct(supplier_id=supplier_id, product_id=product_id))


@router.get("", response_model=dict)
def list_products(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    in_stock_only: Optional[bool] = None,
    warehouse_id: Optional[int] = None,  # when combined with in_stock_only, scopes to this warehouse
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.supplier))
        .filter(Product.deleted_at.is_(None))
    )
    if search:
        q = q.filter(Product.product_name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category_id:
        q = q.filter(Product.category_id == category_id)
    if status:
        q = q.filter(Product.status == status)
    if supplier_id:
        # Filter directly by products.supplier_id — the primary supplier relationship.
        q = q.filter(Product.supplier_id == supplier_id)
    if in_stock_only:
        inv_filter = [Inventory.deleted_at.is_(None)]
        if warehouse_id:
            # Scope to the specific warehouse selected in the sales form
            inv_filter.append(Inventory.warehouse_id == warehouse_id)
        in_stock_subq = (
            db.query(Inventory.product_id)
            .filter(*inv_filter)
            .group_by(Inventory.product_id)
            .having(func.sum(Inventory.quantity) > 0)
            .subquery()
        )
        q = q.filter(Product.product_id.in_(in_stock_subq))

    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    # Populate available_stock on each product when in_stock_only is requested.
    # This avoids N+1: one batch inventory query for all returned products.
    if in_stock_only and items:
        inv_q = (
            db.query(Inventory.product_id, func.sum(Inventory.quantity).label("qty"))
            .filter(
                Inventory.product_id.in_([p.product_id for p in items]),
                Inventory.deleted_at.is_(None),
            )
        )
        if warehouse_id:
            inv_q = inv_q.filter(Inventory.warehouse_id == warehouse_id)
        inv_map = {
            row.product_id: max(0.0, float(row.qty or 0))
            for row in inv_q.group_by(Inventory.product_id).all()
        }
        for p in items:
            p.available_stock = inv_map.get(p.product_id, 0.0)

    return {"total": total, "page": page, "limit": limit, "items": [ProductResponse.from_orm(p) for p in items]}


def _check_sku_unique(db: Session, sku: Optional[str], exclude_product_id: Optional[int] = None):
    if not sku:
        return
    q = db.query(Product).filter(Product.sku == sku, Product.deleted_at.is_(None))
    if exclude_product_id is not None:
        q = q.filter(Product.product_id != exclude_product_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"SKU '{sku}' is already used by another product")


@router.post("", response_model=ProductResponse)
def create_product(data: ProductCreate, current_user: User = Depends(require_permission("master_data.products")), db: Session = Depends(get_db)):
    _check_sku_unique(db, data.sku)
    product = Product(**data.dict(), created_by=current_user.username)
    db.add(product)
    db.flush()  # get product_id before syncing supplier_products
    _sync_supplier_product(db, product.product_id, product.supplier_id)
    db.commit()
    db.refresh(product)
    return _load_product(db, product.product_id)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = _load_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, data: ProductUpdate, current_user: User = Depends(require_permission("master_data.products")), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id, Product.deleted_at.is_(None)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    payload = data.dict(exclude_unset=True)
    if "sku" in payload:
        _check_sku_unique(db, payload["sku"], exclude_product_id=product_id)

    old_supplier_id = product.supplier_id
    for field, value in payload.items():
        setattr(product, field, value)
    product.modified_by = current_user.username
    db.flush()

    if "supplier_id" in payload:
        _sync_supplier_product(db, product_id, product.supplier_id, old_supplier_id)

    db.commit()
    return _load_product(db, product_id)


@router.delete("/{product_id}")
def delete_product(product_id: int, current_user: User = Depends(require_permission("master_data.products")), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id, Product.deleted_at.is_(None)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.deleted_at = datetime.utcnow()
    product.deleted_by = current_user.username
    db.commit()
    return {"message": "Product deleted"}


@router.get("/{product_id}/available-stock")
def get_available_stock(
    product_id:   int,
    warehouse_id: Optional[int] = None,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Return available stock for a product, optionally filtered by warehouse.

    Available stock = sum of Inventory.quantity (the running balance already
    accounts for receiving, sales, opname adjustments, returns, and movements).
    """
    product = _load_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    q = db.query(
        Inventory.warehouse_id,
        func.sum(Inventory.quantity).label("available"),
    ).filter(
        Inventory.product_id == product_id,
        Inventory.deleted_at.is_(None),
    )
    if warehouse_id:
        q = q.filter(Inventory.warehouse_id == warehouse_id)
    q = q.group_by(Inventory.warehouse_id)
    rows = q.all()

    total_available = sum(r.available for r in rows if r.available and r.available > 0)
    by_warehouse = [
        {"warehouse_id": r.warehouse_id, "available": max(0.0, float(r.available or 0))}
        for r in rows
    ]

    return {
        "product_id":        product_id,
        "product_name":      product.product_name,
        "total_available":   max(0.0, float(total_available)),
        "by_warehouse":      by_warehouse,
        "minimum_stock_level": product.minimum_stock_level,
    }
