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
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    quantity = Column(Float, default=1, nullable=False)
    unit = Column(String(20), default="PCS", nullable=False)
    sale_price = Column(Float, default=0, nullable=False)     # VAT-inclusive unit price
    discount_pct = Column(Float, default=0, nullable=False)   # 0–100 percent
    discount_amount = Column(Float, default=0, nullable=False) # subtotal × discount_pct/100
    vat_amount = Column(Float, default=0, nullable=False)     # extracted VAT from grand_total
    subtotal = Column(Float, default=0, nullable=False)       # qty × sale_price
    grand_total = Column(Float, default=0, nullable=False)    # subtotal - discount_amount
    payment_method = Column(String(30), default="Cash", nullable=False)
    payment_status = Column(String(20), default="Paid", nullable=False)
    remarks = Column(Text, nullable=True)
    # Bank Transfer
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.bank_id"), nullable=True)
    transfer_reference = Column(String(100), nullable=True)
    # EDC
    edc_receipt_number = Column(String(50), nullable=True)
    edc_special_code = Column(String(50), nullable=True)
    # Legacy column — kept for DB backward compat; always set equal to vat_amount
    tax_amount = Column(Float, default=0, nullable=False)

    store = relationship("Store", foreign_keys=[store_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    product = relationship("Product", foreign_keys=[product_id])
    bank_account = relationship("BankAccount", foreign_keys=[bank_account_id])
