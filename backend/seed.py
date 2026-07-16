"""Seed initial data into the TKU database."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models import *
from app.models.bank_account import BankAccount
from app.models.supplier_product import SupplierProduct
from app.utils.security import get_password_hash
from datetime import date, datetime

Base.metadata.create_all(bind=engine)

db = SessionLocal()

VAT_RATE = 0.11


def compute_sale(qty, price, discount_pct=0):
    subtotal = round(qty * price, 2)
    discount_amount = round(subtotal * discount_pct / 100, 2)
    grand_total = round(subtotal - discount_amount, 2)
    vat_amount = round(grand_total * VAT_RATE / (1 + VAT_RATE), 2)
    return subtotal, discount_amount, grand_total, vat_amount


def seed():
    print("Seeding database...")

    # Users
    if not db.query(User).filter_by(username="admin").first():
        db.add(User(
            username="admin", full_name="Administrator",
            email="admin@tku.id", password_hash=get_password_hash("admin"),
            role="Admin", status="Active", created_by="system"
        ))
        db.add(User(
            username="manager", full_name="Store Manager",
            email="manager@tku.id", password_hash=get_password_hash("manager123"),
            role="Manager", status="Active", created_by="system"
        ))
        db.add(User(
            username="staff1", full_name="Staff One",
            email="staff1@tku.id", password_hash=get_password_hash("staff123"),
            role="Staff", status="Active", created_by="system"
        ))
        db.commit()
        print("  Users created")

    # Bank Accounts
    if not db.query(BankAccount).first():
        db.add(BankAccount(
            bank_name="Bank Mandiri",
            account_number="1234567890123",
            beneficiary_name="PT Kopernik",
            is_active=True,
            created_by="system"
        ))
        db.add(BankAccount(
            bank_name="Bank BCA",
            account_number="0987654321",
            beneficiary_name="PT Kopernik",
            is_active=True,
            created_by="system"
        ))
        db.add(BankAccount(
            bank_name="Bank BNI (Inactive)",
            account_number="1122334455",
            beneficiary_name="PT Kopernik",
            is_active=False,
            created_by="system"
        ))
        db.commit()
        print("  Bank Accounts created")

    # Categories
    categories_data = [
        ("Water Filter", "Water filtration products"),
        ("Solar Light", "Solar-powered lighting products"),
        ("Food", "Food and beverages"),
        ("Clothing", "Clothing and apparel"),
        ("Others", "Miscellaneous products"),
    ]
    if not db.query(Category).first():
        for name, desc in categories_data:
            db.add(Category(category_name=name, description=desc, created_by="system"))
        db.commit()
        print("  Categories created")

    # Suppliers
    if not db.query(Supplier).first():
        db.add(Supplier(supplier_name="Nazava", supplier_contact="+62811234567", supplier_email="info@nazava.com", supplier_address="Jakarta, Indonesia", created_by="system"))
        db.add(Supplier(supplier_name="D-Light", supplier_contact="+62822345678", supplier_email="sales@dlight.com", supplier_address="Bali, Indonesia", created_by="system"))
        db.add(Supplier(supplier_name="Local Supplier", supplier_contact="+62833456789", supplier_email="local@supplier.com", supplier_address="Ubud, Bali", created_by="system"))
        db.commit()
        print("  Suppliers created")

    # Warehouses
    if not db.query(Warehouse).first():
        db.add(Warehouse(warehouse_name="Ubud Warehouse", location="Ubud, Bali", description="Main storage warehouse", created_by="system"))
        db.add(Warehouse(warehouse_name="TKU Display", location="TKU Store, Ubud", description="Display area at TKU", created_by="system"))
        db.add(Warehouse(warehouse_name="Mana Ubud", location="Mana Ubud, Bali", description="Mana Ubud storage", created_by="system"))
        db.commit()
        print("  Warehouses created")

    # Stores
    if not db.query(Store).first():
        db.add(Store(store_name="TKU", location="Ubud, Bali", description="Tech Kiosk Ubud main store", created_by="system"))
        db.add(Store(store_name="Mana Ubud", location="Mana Ubud, Bali", description="Mana Ubud partner store", created_by="system"))
        db.commit()
        print("  Stores created")

    # Products  (sale_price is VAT-inclusive)
    if not db.query(Product).first():
        cat = {c.category_name: c.category_id for c in db.query(Category).all()}
        sup = {s.supplier_name: s.supplier_id for s in db.query(Supplier).all()}
        products_data = [
            # (name, category, sale_price, description, unit, supplier_name)
            ("Nazava Tulip Water Filter",      cat.get("Water Filter"), 450000, "Gravity-fed ceramic water filter", "PCS",  "Nazava"),
            ("Nazava Ario Water Filter",        cat.get("Water Filter"), 350000, "Portable water filter",           "PCS",  "Nazava"),
            ("D-Light SQ16 Solar Light",        cat.get("Solar Light"),  280000, "Solar lantern 16 LED",            "PCS",  "D-Light"),
            ("D-Light SQ20 Solar Light",        cat.get("Solar Light"),  380000, "Solar lantern 20 LED",            "PCS",  "D-Light"),
            ("Organic Coffee Beans",            cat.get("Food"),          85000, "Local Balinese organic coffee",   "Pack", "Local Supplier"),
            ("Luwak Coffee",                    cat.get("Food"),         150000, "Premium Luwak coffee",            "Pack", "Local Supplier"),
            ("TKU T-Shirt",                     cat.get("Clothing"),     120000, "Tech Kiosk Ubud branded T-shirt", "PCS",  "Local Supplier"),
            ("Water Filter Candle Replacement", cat.get("Water Filter"),  95000, "Ceramic candle replacement",      "PCS",  "Nazava"),
        ]
        for p in products_data:
            db.add(Product(
                product_name=p[0], category_id=p[1], sale_price=p[2],
                product_description=p[3], unit=p[4],
                supplier_id=sup.get(p[5]),
                status="Active", created_by="system",
            ))
        db.commit()
        print("  Products created")

    # Supplier ↔ Product links
    if not db.query(SupplierProduct).first():
        sup = {s.supplier_name: s.supplier_id for s in db.query(Supplier).all()}
        prd = {p.product_name: p.product_id for p in db.query(Product).all()}
        links = [
            ("Nazava",          "Nazava Tulip Water Filter",       200000),
            ("Nazava",          "Nazava Ario Water Filter",        160000),
            ("Nazava",          "Water Filter Candle Replacement",  45000),
            ("D-Light",         "D-Light SQ16 Solar Light",        130000),
            ("D-Light",         "D-Light SQ20 Solar Light",        190000),
            ("Local Supplier",  "Organic Coffee Beans",             40000),
            ("Local Supplier",  "Luwak Coffee",                     80000),
            ("Local Supplier",  "TKU T-Shirt",                      60000),
        ]
        for sname, pname, cost in links:
            sid = sup.get(sname)
            pid = prd.get(pname)
            if sid and pid:
                db.add(SupplierProduct(supplier_id=sid, product_id=pid, cost_price=cost))
        db.commit()
        print("  Supplier-product links created")

    # Sample Receivings
    if not db.query(Receiving).first():
        supplier = db.query(Supplier).first()
        products = db.query(Product).all()
        if supplier and products:
            db.add(Receiving(
                received_date=date(2024, 1, 15), supplier_id=supplier.supplier_id,
                product_id=products[0].product_id, quantity_received=50,
                quantity_accepted=48, quantity_rejected=2, unit="PCS",
                notes="First batch from Nazava", created_by="admin"
            ))
            db.add(Receiving(
                received_date=date(2024, 1, 20), supplier_id=db.query(Supplier).filter_by(supplier_name="D-Light").first().supplier_id,
                product_id=products[2].product_id, quantity_received=30,
                quantity_accepted=30, quantity_rejected=0, unit="PCS",
                notes="D-Light initial stock", created_by="admin"
            ))
            db.commit()
            print("  Receivings created")

    # Sample Inventory
    if not db.query(Inventory).first():
        wh = {w.warehouse_name: w.warehouse_id for w in db.query(Warehouse).all()}
        products = db.query(Product).all()
        inventory_data = [
            (products[0].product_id, wh.get("TKU Display"),    "TKU Product", 20),
            (products[0].product_id, wh.get("Ubud Warehouse"), "TKU Product", 28),
            (products[1].product_id, wh.get("TKU Display"),    "TKU Product", 15),
            (products[2].product_id, wh.get("TKU Display"),    "Consignment", 10),
            (products[2].product_id, wh.get("Mana Ubud"),      "Titip Jual",  20),
            (products[3].product_id, wh.get("TKU Display"),    "TKU Product",  8),
            (products[4].product_id, wh.get("TKU Display"),    "TKU Product", 25),
            (products[5].product_id, wh.get("TKU Display"),    "Consignment", 12),
            (products[6].product_id, wh.get("TKU Display"),    "TKU Product", 30),
        ]
        for product_id, warehouse_id, inv_type, qty in inventory_data:
            if warehouse_id:
                db.add(Inventory(product_id=product_id, warehouse_id=warehouse_id, inventory_type=inv_type, quantity=qty, unit="PCS", created_by="admin"))
        db.commit()
        print("  Inventory created")

    # Sample Sales (sale_price is VAT-inclusive; no tax_amount added)
    if not db.query(Sales).first():
        store = db.query(Store).first()
        wh = db.query(Warehouse).filter_by(warehouse_name="TKU Display").first()
        products = db.query(Product).all()
        bank_mandiri = db.query(BankAccount).filter_by(bank_name="Bank Mandiri").first()

        sales_data = [
            # (date, product_idx, qty, price_incl_vat, discount_pct, method, status)
            (date(2024, 1, 10),  0, 2, 450000, 0,  "Cash",          "Paid"),
            (date(2024, 1, 12),  2, 1, 280000, 0,  "Bank Transfer", "Paid"),
            (date(2024, 1, 15),  4, 3,  85000, 5,  "Cash",          "Paid"),
            (date(2024, 1, 18),  1, 1, 350000, 0,  "EDC",           "Paid"),
            (date(2024, 1, 20),  3, 2, 380000, 10, "Cash",          "Unpaid"),
            (date(2024, 2, 5),   0, 1, 450000, 0,  "Cash",          "Paid"),
            (date(2024, 2, 8),   6, 5, 120000, 0,  "Bank Transfer", "Paid"),
            (date(2024, 2, 10),  5, 2, 150000, 15, "Cash",          "Partial"),
        ]

        for s_date, p_idx, qty, price, disc_pct, method, status in sales_data:
            subtotal, disc_amt, grand_total, vat_amount = compute_sale(qty, price, disc_pct)
            bank_id = bank_mandiri.bank_id if method == "Bank Transfer" and bank_mandiri else None
            db.add(Sales(
                sales_date=s_date,
                store_id=store.store_id if store else None,
                warehouse_id=wh.warehouse_id if wh else None,
                product_id=products[p_idx].product_id,
                quantity=qty, unit="PCS",
                sale_price=price,
                discount_pct=disc_pct,
                discount_amount=disc_amt,
                vat_amount=vat_amount,
                subtotal=subtotal,
                grand_total=grand_total,
                payment_method=method,
                payment_status=status,
                bank_account_id=bank_id,
                created_by="admin"
            ))
        db.commit()
        print("  Sales created")

    print("\nSeeding completed successfully!")
    db.close()


if __name__ == "__main__":
    seed()
