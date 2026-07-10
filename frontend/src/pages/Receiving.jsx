import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { receivingsAPI } from '../api'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber, formatCurrency } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

const UNITS = ['PCS', 'Pack', 'Unit', 'Box', 'Set', 'Kg', 'Liter']
const INV_TYPES = ['TKU Product', 'Consignment', 'Titip Jual']

const empty = {
  received_date:     new Date().toISOString().slice(0, 10),
  supplier_id:       '',
  product_id:        '',
  warehouse_id:      '',
  quantity_received: '',
  quantity_rejected: '0',
  unit:              'PCS',
  purchase_price:    '',
  inventory_type:    'TKU Product',
  notes:             '',
}

export default function Receiving() {
  const [searchParams] = useSearchParams()
  const [items,    setItems]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [modal,    setModal]    = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  // Seeded from the notification bell's click-through (?has_rejected=true)
  const [hasRejectedFilter, setHasRejectedFilter] = useState(searchParams.get('has_rejected') === 'true')
  const limit = 15

  const load = useCallback(async () => {
    const params = { page, limit }
    if (hasRejectedFilter) params.has_rejected = true
    const res = await receivingsAPI.list(params)
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, hasRejectedFilter])

  useEffect(() => { load() }, [load])

  // Derived: accepted = received − rejected (shown read-only in form)
  const qtyReceived = parseInt(form.quantity_received) || 0
  const qtyRejected = parseInt(form.quantity_rejected) || 0
  const qtyAccepted = Math.max(0, qtyReceived - qtyRejected)

  const openCreate = () => { setEditing(null); setForm(empty); setError(''); setModal(true) }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      received_date:     item.received_date,
      supplier_id:       item.supplier_id ? String(item.supplier_id) : '',
      product_id:        String(item.product_id),
      warehouse_id:      item.warehouse_id ? String(item.warehouse_id) : '',
      quantity_received: String(item.quantity_received),
      quantity_rejected: String(item.quantity_rejected),
      unit:              item.unit,
      purchase_price:    item.purchase_price != null ? String(item.purchase_price) : '',
      inventory_type:    item.inventory_type || 'TKU Product',
      notes:             item.notes || '',
    })
    setError('')
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')

    const received = parseInt(form.quantity_received)
    const rejected = parseInt(form.quantity_rejected) || 0
    const purchasePrice = form.purchase_price === '' ? null : parseFloat(form.purchase_price)

    if (!received || received <= 0) { setError('Quantity received must be greater than 0'); return }
    if (rejected < 0)               { setError('Quantity rejected cannot be negative'); return }
    if (rejected > received)        { setError('Quantity rejected cannot exceed quantity received'); return }
    if (!form.product_id)           { setError('Please select a product'); return }
    if (!form.warehouse_id)         { setError('Please select a destination warehouse — a receiving cannot update stock without one'); return }
    if (purchasePrice === null || purchasePrice <= 0) {
      setError('Purchase Price From Vendor must be greater than 0')
      return
    }

    setLoading(true)
    try {
      const data = {
        received_date:     form.received_date,
        supplier_id:       form.supplier_id  ? parseInt(form.supplier_id)  : null,
        product_id:        parseInt(form.product_id),
        warehouse_id:      form.warehouse_id ? parseInt(form.warehouse_id) : null,
        quantity_received: received,
        quantity_rejected: rejected,
        // quantity_accepted is computed server-side; sending it doesn't hurt
        unit:              form.unit,
        purchase_price:    purchasePrice,
        inventory_type:    form.inventory_type,
        notes:             form.notes || null,
      }
      if (editing) await receivingsAPI.update(editing.receiving_id, data)
      else         await receivingsAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save record.')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Receiving</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Record goods received from suppliers — rejected items auto-create Supplier Returns
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(r => ({
              date:     r.received_date,
              supplier: r.supplier?.supplier_name || '',
              product:  r.product?.product_name   || '',
              received: r.quantity_received,
              accepted: r.quantity_accepted,
              rejected: r.quantity_rejected,
              unit:     r.unit,
              purchase_price: r.purchase_price,
              inventory_type: r.inventory_type,
              notes:    r.notes || '',
            }))
            exportCsv(rows,
              ['date','supplier','product','received','accepted','rejected','unit','purchase_price','inventory_type','notes'],
              { date:'Date', supplier:'Supplier', product:'Product', received:'Received', accepted:'Accepted', rejected:'Rejected', unit:'Unit', purchase_price:'Purchase Price', inventory_type:'Inventory Type', notes:'Notes' },
              'receiving-export')
          }}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Receiving</button>
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#374151', cursor: 'pointer', width: 'fit-content' }}>
            <input
              type="checkbox"
              checked={hasRejectedFilter}
              onChange={e => { setHasRejectedFilter(e.target.checked); setPage(1) }}
            />
            Show only receivings with rejected items
          </label>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Supplier</th><th>Product</th><th>Warehouse</th>
                <th>Received</th><th>Accepted</th><th>Rejected</th><th>Unit</th>
                <th>Purchase Price</th><th>Inventory Type</th><th>Notes</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={13} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No receiving records</td></tr>
                : items.map((item, i) => (
                  <tr key={item.receiving_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td>{formatDate(item.received_date)}</td>
                    <td>{item.supplier?.supplier_name || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{item.product?.product_name || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>{item.warehouse?.warehouse_name || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatNumber(item.quantity_received)}</td>
                    <td><span className="badge badge-green">{formatNumber(item.quantity_accepted)}</span></td>
                    <td>
                      <span className={`badge ${item.quantity_rejected > 0 ? 'badge-red' : 'badge-gray'}`}>
                        {formatNumber(item.quantity_rejected)}
                      </span>
                    </td>
                    <td>{item.unit}</td>
                    <td>{formatCurrency(item.purchase_price)}</td>
                    <td>
                      <span className={`badge ${item.inventory_type === 'TKU Product' ? 'badge-blue' : item.inventory_type === 'Consignment' ? 'badge-purple' : 'badge-yellow'}`}>
                        {item.inventory_type}
                      </span>
                    </td>
                    <td style={{ maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.receiving_id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* ── Form Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Receiving' : 'New Receiving'} size="lg">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <div>
              <label className="label">Received Date *</label>
              <input
                className="input" type="date" required
                value={form.received_date}
                onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Supplier</label>
              <SearchableSelect
                endpoint="/suppliers"
                labelField="supplier_name"
                valueField="supplier_id"
                value={form.supplier_id}
                onChange={v => setForm(f => ({ ...f, supplier_id: v, product_id: '' }))}
                placeholder="Select supplier (optional)"
                emptyHint="No suppliers found"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Product *</label>
              <SearchableSelect
                key={form.supplier_id || 'no-supplier'}
                endpoint="/products"
                labelField="product_name"
                valueField="product_id"
                params={form.supplier_id ? { supplier_id: form.supplier_id, status: 'Active' } : { status: 'Active' }}
                value={form.product_id}
                onChange={v => setForm(f => ({ ...f, product_id: v }))}
                placeholder={form.supplier_id ? 'Search products from this supplier...' : 'Search product...'}
                required
                emptyHint="No active products found"
              />
              {form.supplier_id && (
                <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Only products assigned to this supplier are shown. If none appear, open <strong>Products</strong>, edit the product, and set its Supplier.
                </p>
              )}
            </div>

            <div>
              <label className="label">Destination Warehouse *</label>
              <SearchableSelect
                endpoint="/warehouses"
                labelField="warehouse_name"
                valueField="warehouse_id"
                value={form.warehouse_id}
                onChange={v => setForm(f => ({ ...f, warehouse_id: v }))}
                placeholder="Select warehouse"
                required
                emptyHint="No warehouses found"
              />
              <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                Accepted qty will update stock in this warehouse
              </p>
            </div>

            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Inventory Type *</label>
              <select className="input" value={form.inventory_type} onChange={e => setForm(f => ({ ...f, inventory_type: e.target.value }))}>
                {INV_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                Who owns this stock — determined at receiving time
              </p>
            </div>

            {/* ── New quantity workflow ── */}
            <div>
              <label className="label">Quantity Received *</label>
              <input
                className="input" type="number" required min="1" step="1"
                placeholder="Total quantity from supplier"
                value={form.quantity_received}
                onChange={e => setForm(f => ({ ...f, quantity_received: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Quantity Rejected</label>
              <input
                className="input" type="number" min="0" step="1"
                placeholder="Items rejected / damaged"
                value={form.quantity_rejected}
                onChange={e => setForm(f => ({ ...f, quantity_rejected: e.target.value }))}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Purchase Price From Vendor (per unit) *</label>
              <input
                className="input" type="number" required min="0.01" step="1"
                placeholder="e.g. 250000"
                value={form.purchase_price}
                onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
              />
              <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                The price entered is the net price excluding input VAT.
              </p>
            </div>

            {/* Auto-calculated accepted */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    Quantity Accepted (auto-calculated)
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#16a34a' }}>
                    {formatNumber(qtyAccepted)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.125rem' }}>
                    = {formatNumber(qtyReceived)} received − {formatNumber(qtyRejected)} rejected
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b' }}>
                  <div>Only accepted qty enters inventory.</div>
                  {qtyRejected > 0 && (
                    <div style={{ color: '#dc2626', fontWeight: 600, marginTop: '0.25rem' }}>
                      {formatNumber(qtyRejected)} rejected → Supplier Return auto-created
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Notes</label>
              <textarea
                className="input" rows={2}
                placeholder="Optional notes or reference..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Receiving'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await receivingsAPI.delete(deleteId); load() }} />
    </div>
  )
}
