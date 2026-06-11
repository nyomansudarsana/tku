import { useState, useEffect, useCallback } from 'react'
import { inventoriesAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatNumber, stockBadge } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

const UNITS = ['PCS', 'Pack', 'Unit', 'Box', 'Set', 'Kg', 'Liter']
const INV_TYPES = ['TKU Product', 'Consignment', 'Titip Jual']
const empty = { product_id: '', warehouse_id: '', inventory_type: 'TKU Product', quantity: '', unit: 'PCS', remark: '' }

export default function Inventory() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
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

  const openCreate = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      product_id: String(item.product_id),
      warehouse_id: String(item.warehouse_id),
      inventory_type: item.inventory_type,
      quantity: item.quantity,
      unit: item.unit,
      remark: item.remark || '',
    })
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setLoading(true)
    try {
      const data = { ...form, product_id: parseInt(form.product_id), warehouse_id: parseInt(form.warehouse_id), quantity: parseFloat(form.quantity) }
      if (editing) await inventoriesAPI.update(editing.inventory_id, data)
      else await inventoriesAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Inventory</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Stock allocation by warehouse and type</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(inv => ({ product: inv.product?.product_name || '', warehouse: inv.warehouse?.warehouse_name || '', type: inv.inventory_type, qty: inv.quantity, unit: inv.unit, remark: inv.remark || '' }))
            exportCsv(rows, ['product','warehouse','type','qty','unit','remark'], { product:'Product', warehouse:'Warehouse', type:'Type', qty:'Quantity', unit:'Unit', remark:'Remark' }, 'inventory-export')
          }}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Inventory</button>
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
              <tr><th>#</th><th>Product</th><th>Warehouse</th><th>Type</th><th>Quantity</th><th>Unit</th><th>Status</th><th>Remark</th><th>Actions</th></tr>
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
                    <td>{item.unit}</td>
                    <td>
                      <span className={`badge ${stockBadge(item.quantity)}`}>
                        {item.quantity <= 0 ? 'Out of Stock' : item.quantity <= 5 ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.remark || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.inventory_id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Form Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setSaveError('') }} title={editing ? 'Edit Inventory' : 'Add Inventory'} size="md">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {saveError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>{saveError}</div>}
          <div>
            <label className="label">Product *</label>
            <AsyncDropdown
              endpoint="/products"
              labelField="product_name"
              valueField="product_id"
              value={form.product_id}
              onChange={v => setForm(f => ({ ...f, product_id: v }))}
              placeholder="Select product..."
              required
              emptyHint="No products found — add products in Master Data first"
            />
          </div>

          <div>
            <label className="label">Warehouse *</label>
            <AsyncDropdown
              endpoint="/warehouses"
              labelField="warehouse_name"
              valueField="warehouse_id"
              value={form.warehouse_id}
              onChange={v => setForm(f => ({ ...f, warehouse_id: v }))}
              placeholder="Select warehouse..."
              required
              emptyHint="No warehouses found — add warehouses in Master Data first"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="label">Inventory Type</label>
              <select className="input" value={form.inventory_type} onChange={e => setForm(f => ({ ...f, inventory_type: e.target.value }))}>
                {INV_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Quantity *</label>
              <input className="input" type="number" required min="0" step="0.01" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Remark</label>
            <textarea className="input" rows={2} value={form.remark}
              onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await inventoriesAPI.delete(deleteId); load() }} />
    </div>
  )
}
