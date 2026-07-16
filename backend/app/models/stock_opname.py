from sqlalchemy import Column, Integer, String, Float, Text, Date, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import AuditMixin


class StockOpname(Base, AuditMixin):
    __tablename__ = "stock_opnames"

    opname_id    = Column(Integer, primary_key=True, index=True)
    opname_date  = Column(Date, nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=True)
    store_id     = Column(Integer, ForeignKey("stores.store_id"), nullable=True)
    status       = Column(String(20), nullable=False, default="Draft")  # Draft / Approved / Rejected
    remarks      = Column(Text, nullable=True)
    performed_by = Column(String(100), nullable=True)  # who performed the physical count
    approved_by  = Column(String(100), nullable=True)  # set automatically on approval

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    store     = relationship("Store",     foreign_keys=[store_id])
    details   = relationship("StockOpnameDetail", back_populates="opname",
                             cascade="all, delete-orphan")


class StockOpnameDetail(Base):
    __tablename__ = "stock_opname_details"

    id              = Column(Integer, primary_key=True, index=True)
    opname_id       = Column(Integer, ForeignKey("stock_opnames.opname_id"), nullable=False)
    product_id      = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    # Ownership bucket being counted (see ../constants.py) — one detail line per
    # (product, inventory_type) bucket present in the warehouse's Inventory.
    inventory_type  = Column(String(30), nullable=True)
    system_qty      = Column(Integer, nullable=False, default=0)
    good_qty        = Column(Integer, nullable=False, default=0)   # sellable units counted
    damaged_qty     = Column(Integer, nullable=False, default=0)   # damaged units found
    # Units that are physically present but no longer sellable as a complete
    # product (e.g. cannibalized for parts) — routed to Damaged Stock on
    # approval just like damaged_qty, with damage_reason = "Incomplete".
    incomplete_qty  = Column(Integer, nullable=False, default=0)
    physical_qty    = Column(Integer, nullable=False, default=0)   # good_qty + damaged_qty + incomplete_qty
    difference_qty  = Column(Integer, nullable=False, default=0)   # good_qty - system_qty  (inventory impact)
    reason          = Column(String(100), nullable=True)
    remarks         = Column(Text, nullable=True)

    product = relationship("Product", foreign_keys=[product_id])
    opname  = relationship("StockOpname", back_populates="details")
    breakdown = relationship("StockOpnameDetailBreakdown", back_populates="detail",
                              cascade="all, delete-orphan")


class StockOpnameDetailBreakdown(Base):
    __tablename__ = "stock_opname_detail_breakdowns"

    breakdown_id     = Column(Integer, primary_key=True, index=True)
    opname_detail_id = Column(Integer, ForeignKey("stock_opname_details.id"), nullable=False)
    # Lost/Missing, Damaged, Expired, Incomplete, Rodent, Other — explains the
    # variance for this line. Purely documentation: does not affect the
    # good_qty/damaged_qty/incomplete_qty inventory-posting logic above.
    category         = Column(String(30), nullable=False)
    quantity         = Column(Integer, nullable=False)
    notes            = Column(Text, nullable=True)

    detail = relationship("StockOpnameDetail", back_populates="breakdown")
