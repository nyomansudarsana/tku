import { useState, useEffect, useCallback } from 'react'
import { inventoriesAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Pagination from '../components/Pagination'
import { formatNumber, formatCurrency, stockBadge } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

const INV_TYPES = ['TKU Product', 'Consignment', 'Titip Jual']

export default function Inventory() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const limit = 20

  const load = useCallback(async () => {
    const params = { page, limit }
    if (warehouseFilter) params.warehouse_id = warehouseFilter
    if (typeFilter) params.inventory_type = typeFilter
    const res = await inventoriesAPI.list(params)
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, warehouseFilter, typeFilter])

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
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(inv => ({ product: inv.product?.product_name || '', warehouse: inv.warehouse?.warehouse_name || '', type: inv.inventory_type, qty: inv.quantity, avg_cost: inv.avg_cost, unit: inv.unit, remark: inv.remark || '' }))
            exportCsv(rows, ['product','warehouse','type','qty','avg_cost','unit','remark'], { product:'Product', warehouse:'Warehouse', type:'Type', qty:'Quantity', avg_cost:'Avg Cost', unit:'Unit', remark:'Remark' }, 'inventory-export')
          }}>Export CSV</button>
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
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>
    </div>
  )
}
