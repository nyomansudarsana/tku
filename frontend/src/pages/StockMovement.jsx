import { useState, useEffect, useCallback } from 'react'
import { stockMovementsAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

// Stock Movement now only tracks warehouse-to-warehouse transfers — Receiving
// handles incoming stock, Sales handles outgoing stock, Returns handle return
// flows, and Stock Opname handles adjustments. IN/OUT/ADJUSTMENT are retained
// here only so historical records remain visible/filterable.
const HISTORICAL_MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']
const empty = {
  movement_date: new Date().toISOString().slice(0, 10),
  product_id: '',
  movement_type: 'TRANSFER',
  quantity: '',
  from_warehouse_id: '',
  to_warehouse_id: '',
  remark: '',
}

const movementBadge = (type) => {
  const map = { IN: 'badge-green', OUT: 'badge-red', TRANSFER: 'badge-blue', ADJUSTMENT: 'badge-yellow' }
  return map[type] || 'badge-gray'
}

export default function StockMovement() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const limit = 20

  const load = useCallback(async () => {
    const params = { page, limit }
    if (typeFilter) params.movement_type = typeFilter
    const res = await stockMovementsAPI.list(params)
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, typeFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(empty); setError(''); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      movement_date: item.movement_date,
      product_id: String(item.product_id),
      movement_type: item.movement_type,
      quantity: item.quantity,
      from_warehouse_id: item.from_warehouse_id ? String(item.from_warehouse_id) : '',
      to_warehouse_id: item.to_warehouse_id ? String(item.to_warehouse_id) : '',
      remark: item.remark || '',
    })
    setError('')
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.from_warehouse_id || !form.to_warehouse_id) {
      setError('Both From and To warehouse are required for a transfer.')
      return
    }
    if (form.from_warehouse_id === form.to_warehouse_id) {
      setError('From and To warehouse must be different.')
      return
    }
    setLoading(true)
    try {
      const data = {
        ...form,
        movement_type: 'TRANSFER',
        product_id: parseInt(form.product_id),
        quantity: parseInt(form.quantity),
        from_warehouse_id: parseInt(form.from_warehouse_id),
        to_warehouse_id: parseInt(form.to_warehouse_id),
      }
      if (editing) await stockMovementsAPI.update(editing.movement_id, data)
      else await stockMovementsAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Stock Movement</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Warehouse-to-warehouse transfers — Receiving/Sales/Returns/Opname handle every other stock change</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(m => ({ date: m.movement_date, product: m.product?.product_name || '', type: m.movement_type, qty: m.quantity, from: m.from_warehouse?.warehouse_name || '', to: m.to_warehouse?.warehouse_name || '', remark: m.remark || '' }))
            exportCsv(rows, ['date','product','type','qty','from','to','remark'], { date:'Date', product:'Product', type:'Type', qty:'Quantity', from:'From Warehouse', to:'To Warehouse', remark:'Remark' }, 'stock-movements-export')
          }}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Movement</button>
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <select className="input" style={{ width: 'auto' }} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
            <option value="">All Movement Types</option>
            {HISTORICAL_MOVEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Product</th><th>Type</th>
                <th>Qty</th><th>From</th><th>To</th><th>Remark</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No movement records</td></tr>
                : items.map((item, i) => (
                  <tr key={item.movement_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td>{formatDate(item.movement_date)}</td>
                    <td style={{ fontWeight: 500 }}>{item.product?.product_name || '—'}</td>
                    <td><span className={`badge ${movementBadge(item.movement_type)}`}>{item.movement_type}</span></td>
                    <td style={{ fontWeight: 700 }}>{formatNumber(item.quantity)}</td>
                    <td>{item.from_warehouse?.warehouse_name || '—'}</td>
                    <td>{item.to_warehouse?.warehouse_name || '—'}</td>
                    <td style={{ maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.remark || '—'}</td>
                    <td>
                      {item.movement_type === 'TRANSFER' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.movement_id)}>Delete</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>Historical — read only</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Form Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Movement' : 'New Stock Transfer'} size="md">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" required value={form.movement_date}
                onChange={e => setForm(f => ({ ...f, movement_date: e.target.value }))} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
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

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Quantity *</label>
              <input className="input" type="number" required min="1" step="1" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>

            <div>
              <label className="label">From Warehouse *</label>
              <AsyncDropdown
                endpoint="/warehouses"
                labelField="warehouse_name"
                valueField="warehouse_id"
                value={form.from_warehouse_id}
                onChange={v => setForm(f => ({ ...f, from_warehouse_id: v }))}
                placeholder="Select warehouse..."
                required
                emptyHint="No warehouses found"
              />
            </div>

            <div>
              <label className="label">To Warehouse *</label>
              <AsyncDropdown
                endpoint="/warehouses"
                labelField="warehouse_name"
                valueField="warehouse_id"
                value={form.to_warehouse_id}
                onChange={v => setForm(f => ({ ...f, to_warehouse_id: v }))}
                placeholder="Select warehouse..."
                required
                emptyHint="No warehouses found"
              />
            </div>
            {form.from_warehouse_id && form.to_warehouse_id && form.from_warehouse_id === form.to_warehouse_id && (
              <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: '#dc2626' }}>
                From and To warehouse must be different.
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Remark</label>
              <textarea className="input" rows={2} value={form.remark}
                onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await stockMovementsAPI.delete(deleteId); load() }} />
    </div>
  )
}
