import { useState, useEffect, useCallback } from 'react'
import { inventoriesAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Pagination from '../components/Pagination'
import { formatNumber, formatCurrency, stockBadge } from '../utils/format'
import { downloadBlob } from '../utils/downloadFile'

const INV_TYPES = ['TKU Product', 'Consignment', 'Titip Jual']

export default function Inventory() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [exporting, setExporting] = useState(false)
  const [limit, setLimit] = useState(20)

  const buildFilterParams = useCallback(() => {
    const params = {}
    if (warehouseFilter) params.warehouse_id = warehouseFilter
    if (typeFilter) params.inventory_type = typeFilter
    return params
  }, [warehouseFilter, typeFilter])

  const load = useCallback(async () => {
    const res = await inventoriesAPI.list({ page, limit, ...buildFilterParams() })
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, limit, buildFilterParams])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Inventory</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Stock allocation by warehouse and type — system-generated, updated only via Receiving, Sales, Returns, Damaged Stock, Stock Opname, or Stock Movement
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const res = await inventoriesAPI.exportXlsx(buildFilterParams())
              downloadBlob(res.data, 'inventory-export.xlsx')
            } catch {
              alert('Failed to export inventory.')
            } finally {
              setExporting(false)
            }
          }}>{exporting ? 'Exporting...' : 'Export'}</button>
        </div>
      </div>

      <div className="card">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '14rem' }}>
            <AsyncDropdown
              endpoint="/warehouses"
              labelField="warehouse_name"
              valueField="warehouse_id"
              value={warehouseFilter}
              onChange={v => { setWarehouseFilter(v); setPage(1) }}
              placeholder="All Warehouses"
            />
          </div>
          <select className="input" style={{ width: 'auto' }} value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {INV_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Product</th><th>Warehouse</th><th>Type</th><th>Quantity</th><th>Avg Cost</th><th>Unit</th><th>Status</th><th>Remark</th></tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No inventory records</td></tr>
                : items.map((item, i) => (
                  <tr key={item.inventory_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{item.product?.product_name || '—'}</td>
                    <td>🏭 {item.warehouse?.warehouse_name || '—'}</td>
                    <td>
                      <span className={`badge ${item.inventory_type === 'TKU Product' ? 'badge-blue' : item.inventory_type === 'Consignment' ? 'badge-purple' : 'badge-yellow'}`}>
                        {item.inventory_type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '1rem' }}>{formatNumber(item.quantity)}</td>
                    <td>{formatCurrency(item.avg_cost)}</td>
                    <td>{item.unit}</td>
                    <td>
                      <span className={`badge ${stockBadge(item.quantity)}`}>
                        {item.quantity <= 0 ? 'Out of Stock' : item.quantity <= 5 ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.remark || '—'}</td>
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
