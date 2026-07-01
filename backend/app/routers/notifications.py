from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models.user import User
from ..models.stock_opname import StockOpname
from ..models.supplier_return import SupplierReturn
from ..models.receiving import Receiving
from ..services.auth import get_current_user
from ..services.permissions import has_permission
from .dashboard import compute_low_stock

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/summary")
def notifications_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Computed on-the-fly from live table state — no persisted Notification
    table. Each category is only populated if the caller holds the matching
    permission, so a Staff user without stock_opname.approve doesn't see an
    actionable-looking badge for something they can't act on.
    """
    result = {
        "pending_approval": {"stock_opname_count": 0, "supplier_return_count": 0, "total": 0},
        "low_stock": {"count": 0},
        "urgent": {"rejected_awaiting_return_count": 0},
        "total_badge_count": 0,
    }

    if has_permission(current_user, db, "stock_opname.approve"):
        result["pending_approval"]["stock_opname_count"] = db.query(
            func.count(StockOpname.opname_id)
        ).filter(
            StockOpname.deleted_at.is_(None),
            StockOpname.status == "Draft",
        ).scalar() or 0

    if has_permission(current_user, db, "supplier_returns.view"):
        result["pending_approval"]["supplier_return_count"] = db.query(
            func.count(SupplierReturn.return_id)
        ).filter(
            SupplierReturn.deleted_at.is_(None),
            SupplierReturn.status.in_(["Pending", "Ready To Send"]),
        ).scalar() or 0

        # Receivings with rejected qty that never got a Supplier Return —
        # catches receivings whose rejected qty was raised via PUT after
        # creation (only POST auto-creates one) or whose auto-created return
        # was later soft-deleted.
        linked_receiving_ids = db.query(SupplierReturn.receiving_id).filter(
            SupplierReturn.receiving_id.isnot(None),
            SupplierReturn.deleted_at.is_(None),
        )
        result["urgent"]["rejected_awaiting_return_count"] = db.query(
            func.count(Receiving.receiving_id)
        ).filter(
            Receiving.deleted_at.is_(None),
            Receiving.quantity_rejected > 0,
            ~Receiving.receiving_id.in_(linked_receiving_ids),
        ).scalar() or 0

    if has_permission(current_user, db, "inventory.view"):
        result["low_stock"]["count"] = len(compute_low_stock(db))

    result["pending_approval"]["total"] = (
        result["pending_approval"]["stock_opname_count"]
        + result["pending_approval"]["supplier_return_count"]
    )
    result["total_badge_count"] = (
        result["pending_approval"]["total"]
        + result["low_stock"]["count"]
        + result["urgent"]["rejected_awaiting_return_count"]
    )
    return result
