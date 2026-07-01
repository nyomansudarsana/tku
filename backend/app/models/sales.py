from sqlalchemy import Column, Integer, String, Text, Float, Date, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class Sales(Base, AuditMixin):
    __tablename__ = "sales"

    sales_id = Column(Integer, primary_key=True, index=True)
    sales_date = Column(Date, nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("stores.store_id"), nullable=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    customer_name = Column(String(100), nullable=True)

    # ── Legacy per-item columns (NULL for new multi-item sales; populated for
    #    old single-item records and maintained by migration) ──────────────────
    product_id    = Column(Integer, ForeignKey("products.product_id"), nullable=True)
    quantity      = Column(Integer, default=0, nullable=True)
    unit          = Column(String(20), default="PCS", nullable=True)
    sale_price    = Column(Float, default=0, nullable=True)    # VAT-inclusive unit price
    discount_pct  = Column(Float, default=0, nullable=True)    # 0–100

    # ── Header-level computed totals (sum of all line items) ─────────────────
    discount_amount = Column(Float, default=0, nullable=False)
    vat_amount      = Column(Float, default=0, nullable=False)
    subtotal        = Column(Float, default=0, nullable=False)
    grand_total     = Column(Float, default=0, nullable=False)

    payment_method  = Column(String(30), default="Cash", nullable=False)
    payment_status  = Column(String(20), default="Paid", nullable=False)
    remarks         = Column(Text, nullable=True)

    # Bank Transfer
    bank_account_id    = Column(Integer, ForeignKey("bank_accounts.bank_id"), nullable=True)
    transfer_reference = Column(String(100), nullable=True)

    # EDC
    edc_receipt_number = Column(String(50), nullable=True)
    edc_special_code   = Column(String(50), nullable=True)

    # Legacy column — kept for DB backward compat; always equal to vat_amount
    tax_amount = Column(Float, default=0, nullable=False)

    store       = relationship("Store",       foreign_keys=[store_id])
    warehouse   = relationship("Warehouse",   foreign_keys=[warehouse_id])
    product     = relationship("Product",     foreign_keys=[product_id])   # legacy
    bank_account = relationship("BankAccount", foreign_keys=[bank_account_id])
    details     = relationship("SalesDetail", back_populates="sale",
                               foreign_keys="SalesDetail.sales_id",
                               cascade="all, delete-orphan")
