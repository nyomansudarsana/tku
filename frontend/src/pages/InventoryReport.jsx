import { useState, useEffect, useCallback } from 'react'
import { reportsAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Pagination from '../components/Pagination'
import { downloadBlob } from '../utils/downloadFile'
import { formatNumber, formatCurrency } from '../utils/format'

const INV_TYPES = ['TKU Product', 'Consignment', 'Titip Jual']

export default function InventoryReport() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  // Computed by the backend over the FULL filtered set (not just the current
  // page), so these always match the table's true totals.
  const [totals, setTotals] = useState({ total_products: 0, total_quantity: 0, total_value: 0 })

  const buildParams = () => {
    const params = {}
    if (warehouseFilter) params.warehouse_id = warehouseFilter
    if (categoryFilter) params.category_id = categoryFilter
    if (typeFilter) params.inventory_type = typeFilter
    return params
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await reportsAPI.inventory({ page, limit, ...buildParams() })
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotals(res.data.totals || { total_products: 0, total_quantity: 0, total_value: 0 })
    } catch {
      setError('Failed to load inventory report.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, warehouseFilter, categoryFilter, typeFilter])

  useEffect(() => { load() }, [load])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await reportsAPI.inventoryXlsx(buildParams())
      downloadBlob(res.data, 'inventory-report.xlsx')
    } catch {
      setError('Failed to export report.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Inventory Report</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Available stock, damaged stock, and valuation by product, warehouse, and ownership type
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting || loading}>
          {exporting ? 'Exporting...' : 'Export to Excel'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Filters — combinable, all default to "All" (empty = no restriction) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '13rem' }}>
            <label className="label" style={{ fontSize: '0.72rem' }}>Category</label>
            <AsyncDropdown
              endpoint="/categories"
              labelField="category_name"
              valueField="category_id"
              value={categoryFilter}
              onChange={v => { setCategoryFilter(v); setPage(1) }}
              placeholder="All Categories"
            />
          </div>
          <div style={{ minWidth: '13rem' }}>
            <label className="label" style={{ fontSize: '0.72rem' }}>Warehouse</label>
            <AsyncDropdown
              endpoint="/warehouses"
              labelField="warehouse_name"
              valueField="warehouse_id"
              value={warehouseFilter}
              onChange={v => { setWarehouseFilter(v); setPage(1) }}
              placeholder="All Warehouses"
            />
          </div>
          <div style={{ minWidth: '11rem' }}>
            <label className="label" style={{ fontSize: '0.72rem' }}>Inventory Type</label>
            <select className="input" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
              <option value="">All Types</option>
              {INV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {(warehouseFilter || categoryFilter || typeFilter) && (
            <button
              className="btn btn-secondary"
              onClick={() => { setWarehouseFilter(''); setCategoryFilter(''); setTypeFilter(''); setPage(1) }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Totals — recomputed from the filtered result set only */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '0.875rem 1.125rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total Products</div>
          <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#1e293b' }}>{formatNumber(totals.total_products)}</div>
        </div>
        <div className="card" style={{ padding: '0.875rem 1.125rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total Quantity</div>
          <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#1e293b' }}>{formatNumber(totals.total_quantity)}</div>
        </div>
        <div className="card" style={{ padding: '0.875rem 1.125rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total Inventory Value</div>
          <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(totals.total_value)}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th><th>Category</th><th>Warehouse</th>
                <th>Available Stock</th><th>Damaged Stock</th><th>Inventory Type</th>
                <th>Purchase Price</th><th>Inventory Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No inventory records match these filters</td></tr>
              ) : items.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{r.category_name || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{r.warehouse_name || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{formatNumber(r.available_stock)}</td>
                  <td style={{ color: r.damaged_stock > 0 ? '#dc2626' : '#94a3b8', fontWeight: r.damaged_stock > 0 ? 600 : 400 }}>
                    {r.damaged_stock > 0 ? formatNumber(r.damaged_stock) : '—'}
                  </td>
                  <td>
                    <span className={`badge ${r.inventory_type === 'TKU Product' ? 'badge-blue' : r.inventory_type === 'Consignment' ? 'badge-purple' : 'badge-yellow'}`}>
                      {r.inventory_type}
                    </span>
                  </td>
                  <td style={{ color: r.purchase_price == null ? '#94a3b8' : undefined, fontStyle: r.purchase_price == null ? 'italic' : undefined }}>
                    {r.purchase_price != null ? formatCurrency(r.purchase_price) : 'N/A'}
                  </td>
                  <td style={{ fontWeight: 600, color: r.inventory_value != null ? '#16a34a' : '#94a3b8', fontStyle: r.inventory_value == null ? 'italic' : undefined }}>
                    {r.inventory_value != null ? formatCurrency(r.inventory_value) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage}
          pageSizeOptions={[15, 25, 50, 100]} onLimitChange={v => { setLimit(v); setPage(1) }} />
      </div>
    </div>
  )
}
