from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.supplier import Supplier
from ..models.product import Product
from ..models.supplier_product import SupplierProduct
from ..models.user import User
from ..schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from ..services.auth import get_current_user

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", response_model=dict)
def list_suppliers(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Supplier).filter(Supplier.deleted_at.is_(None))
    if search:
        q = q.filter(Supplier.supplier_name.ilike(f"%{search}%"))
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [SupplierResponse.from_orm(s) for s in items]}


@router.post("", response_model=SupplierResponse)
def create_supplier(data: SupplierCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    supplier = Supplier(**data.dict(), created_by=current_user.username)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id, Supplier.deleted_at.is_(None)).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: int, data: SupplierUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id, Supplier.deleted_at.is_(None)).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(supplier, field, value)
    supplier.modified_by = current_user.username
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id, Supplier.deleted_at.is_(None)).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    supplier.deleted_at = datetime.utcnow()
    supplier.deleted_by = current_user.username
    db.commit()
    return {"message": "Supplier deleted"}


# ── Supplier-Product Links ────────────────────────────────────────────────────

@router.get("/{supplier_id}/products")
def list_supplier_products(
    supplier_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return all products linked to this supplier."""
    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id, Supplier.deleted_at.is_(None)).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    links = (
        db.query(SupplierProduct)
        .options(joinedload(SupplierProduct.product))
        .filter(SupplierProduct.supplier_id == supplier_id)
        .all()
    )
    return [
        {
            "id": lnk.id,
            "product_id": lnk.product_id,
            "product_name": lnk.product.product_name if lnk.product else None,
            "sku": lnk.product.sku if lnk.product else None,
            "cost_price": lnk.cost_price,
        }
        for lnk in links
        if lnk.product and not lnk.product.deleted_at
    ]


@router.post("/{supplier_id}/products")
def link_product_to_supplier(
    supplier_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link a product to a supplier (creates a SupplierProduct record)."""
    product_id = data.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id, Supplier.deleted_at.is_(None)).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    product = db.query(Product).filter(Product.product_id == product_id, Product.deleted_at.is_(None)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = db.query(SupplierProduct).filter(
        SupplierProduct.supplier_id == supplier_id,
        SupplierProduct.product_id == product_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Product already linked to this supplier")

    link = SupplierProduct(
        supplier_id=supplier_id,
        product_id=product_id,
        cost_price=data.get("cost_price", 0) or 0,
    )
    db.add(link)
    # Also set products.supplier_id if the product has no primary supplier yet
    if not product.supplier_id:
        product.supplier_id = supplier_id
    db.commit()
    db.refresh(link)
    return {"id": link.id, "supplier_id": supplier_id, "product_id": product_id, "product_name": product.product_name}


@router.delete("/{supplier_id}/products/{product_id}")
def unlink_product_from_supplier(
    supplier_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a product-supplier link."""
    link = db.query(SupplierProduct).filter(
        SupplierProduct.supplier_id == supplier_id,
        SupplierProduct.product_id == product_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    # Clear products.supplier_id if it points to this supplier
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if product and product.supplier_id == supplier_id:
        product.supplier_id = None
    db.commit()
    return {"message": "Product unlinked"}
