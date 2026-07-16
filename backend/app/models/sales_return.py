from sqlalchemy import Column, Integer, String, Text, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class SalesReturn(Base, AuditMixin):
    __tablename__ = "sales_returns"

    return_id    = Column(Integer, primary_key=True, index=True)
    sales_id     = Column(Integer, ForeignKey("sales.sales_id"), nullable=False, index=True)
    # Which specific line of a multi-item sale this return is against. Nullable
    # for backward compat with pre-redesign rows that only ever had sales_id +
    # product_id (single-item sales); new returns always set this.
    sales_detail_id = Column(Integer, ForeignKey("sales_details.detail_id"), nullable=True, index=True)
    product_id   = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    return_date  = Column(Date, nullable=False, index=True)
    quantity     = Column(Integer, nullable=False, default=0)
    return_reason = Column(String(200), nullable=True)
    # Ownership bucket the returned unit was originally sold from (see
    # ../constants.py) — inherited from the matching SalesDetail at creation,
    # so "Good" returns restore to the correct bucket, not always TKU Product.
    inventory_type = Column(String(30), nullable=True)
    # Good / Defective / Damaged / Pending Inspection
    condition    = Column(String(50), nullable=False, default="Good")
    # Product Replacement (today's condition-driven flow) / Broken Parts / Exchange
    return_type  = Column(String(30), nullable=False, default="Product Replacement")
    # Submitted / Under Inspection / Approved / Sent To Supplier / Completed / Rejected
    status       = Column(String(30), nullable=False, default="Submitted")
    # Receiving Area / Inspection Area / Available / Damaged Goods Area / In Transit / Disposed
    current_location = Column(String(50), nullable=True, default="Receiving Area")
    inspection_notes = Column(Text, nullable=True)
    inspected_by     = Column(String(100), nullable=True)
    inspected_at     = Column(DateTime, nullable=True)
    remarks      = Column(Text, nullable=True)

    sale        = relationship("Sales",       foreign_keys=[sales_id])
    sales_detail= relationship("SalesDetail", foreign_keys=[sales_detail_id])
    product     = relationship("Product",     foreign_keys=[product_id])
    warehouse   = relationship("Warehouse",   foreign_keys=[warehouse_id])
    part_replacement = relationship("SalesReturnPartReplacement", uselist=False,
                                     back_populates="sales_return", cascade="all, delete-orphan")
    exchange         = relationship("SalesExchange", uselist=False,
                                     back_populates="sales_return", cascade="all, delete-orphan")


class SalesReturnPartReplacement(Base):
    __tablename__ = "sales_return_part_replacements"

    id              = Column(Integer, primary_key=True, index=True)
    sales_return_id = Column(Integer, ForeignKey("sales_returns.return_id"), nullable=False, index=True)
    # The product whose complete-unit stock gets cannibalized for the spare
    # part — defaults to the same product as the original purchase (see
    # routers/sales_returns.py), stored explicitly for clarity/traceability.
    product_id      = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    part_name       = Column(String(100), nullable=False)   # free text, e.g. "Upper Lid" — no parts catalog needed
    quantity        = Column(Integer, nullable=False)
    remarks         = Column(Text, nullable=True)

    sales_return = relationship("SalesReturn", foreign_keys=[sales_return_id], back_populates="part_replacement")
    product      = relationship("Product", foreign_keys=[product_id])


class SalesExchange(Base):
    __tablename__ = "sales_exchanges"

    exchange_id      = Column(Integer, primary_key=True, index=True)
    sales_return_id  = Column(Integer, ForeignKey("sales_returns.return_id"), nullable=False, index=True)
    old_product_id   = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    new_product_id   = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    # Snapshots taken at creation time — old_price is what the customer
    # actually paid (SalesDetail.unit_price), new_price is the exchange
    # product's sale_price at exchange time. Never recomputed later.
    old_price         = Column(Float, nullable=False)
    new_price         = Column(Float, nullable=False)
    quantity          = Column(Integer, nullable=False)
    # (new_price - old_price) * quantity — always >= 0; TKU does not refund
    # cash, so a cheaper exchange product is rejected at creation time.
    difference_amount = Column(Float, nullable=False)
    payment_status    = Column(String(20), nullable=False, default="Unpaid")
    created_at        = Column(DateTime, nullable=True)

    sales_return = relationship("SalesReturn", foreign_keys=[sales_return_id], back_populates="exchange")
    old_product  = relationship("Product", foreign_keys=[old_product_id])
    new_product  = relationship("Product", foreign_keys=[new_product_id])
