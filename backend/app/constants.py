"""Shared fixed-value enumerations used across models/schemas/routers."""

# Ownership/ "who does this stock belong to" bucket, set at Receiving time and
# carried through Inventory, InventoryLedger, SupplierReturn, DamagedStock and
# StockOpnameDetail so every downstream record is attributable to the correct
# bucket. Free-text would let a typo ("consignment" vs "Consignment") silently
# fragment a bucket, so callers should validate against this list.
INVENTORY_TYPES = ["TKU Product", "Consignment", "Titip Jual"]
DEFAULT_INVENTORY_TYPE = "TKU Product"
