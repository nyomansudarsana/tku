import { useState, useEffect, useCallback } from 'react'
import { salesReturnsAPI, salesAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber } from '../utils/format'

const CONDITIONS = ['Good', 'Defective', 'Damaged', 'Incomplete', 'Pending Inspection']
const STATUSES   = ['Submitted', 'Under Inspection', 'Approved', 'Sent To Supplier', 'Completed', 'Rejected']
const REASONS    = ['Defective product', 'Wrong item', 'Damaged in transit', 'Customer changed mind', 'Warranty claim', 'Other']

// Valid status transitions — mirrors backend STATUS_TRANSITIONS
const TRANSITIONS = {
  'Submitted':        ['Under Inspection', 'Rejected'],
  'Under Inspection': ['Approved', 'Rejected'],
  'Approved':         ['Sent To Supplier', 'Completed'],
  'Sent To Supplier': ['Completed'],
  'Completed':        [],
  'Rejected':         [],
}

const STATUS_COLORS = {
  'Submitted':        ['#fef3c7', '#d97706'],
  'Under Inspection': ['#eff6ff', '#2563eb'],
  'Approved':         ['#dcfce7', '#16a34a'],
  'Sent To Supplier': ['#f0fdf4', '#15803d'],
  'Completed':        ['#d1fae5', '#065f46'],
  'Rejected':         ['#fee2e2', '#dc2626'],
}

const CONDITION_COLORS = {
  'Good':               ['#dcfce7', '#16a34a'],
  'Defective':          ['#fee2e2', '#dc2626'],
  'Damaged':            ['#fef3c7', '#d97706'],
  'Incomplete':         ['#f3e8ff', '#7e22ce'],
  'Pending Inspection': ['#eff6ff', '#2563eb'],
}


const empty = {
  sales_id:     '',
  product_id:   '',
  warehouse_id: '',
  return_date:  new Date().toISOString().slice(0, 10),
  quantity:     '',
  return_reason: '',
  condition:    'Pending Inspection',
  status:       'Submitted',
  inspection_notes: '',
  remarks:      '',
  _sale_label:  '',
  _product_name: '',
  _max_qty:     '',
  _customer:    '',
  _sale_date:   '',
}

function StatusBadge({ status }) {
  const [bg, color] = STATUS_COLORS[status] || ['#f1f5f9', '#64748b']
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  )
}

function ConditionBadge({ condition }) {
  const [bg, color] = CONDITION_COLORS[condition] || ['#f1f5f9', '#64748b']
  return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: bg, color }}>{condition}</span>
}


const today = () => new Date().toISOString().slice(0, 10)

export default function SalesReturns() {
  const [items,         setItems]         = useState([])
  const [total,         setTotal]         = useState(0)
  const [page,          setPage]          = useState(1)
  const [filters,       setFilters]       = useState({ status: '', condition: '' })
  const [modal,         setModal]         = useState(false)
  const [editing,       setEditing]       = useState(null)
  const [form,          setForm]          = useState(empty)
  const [deleteId,      setDeleteId]      = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [actionError,   setActionError]   = useState('')
  const [purchaseDate,  setPurchaseDate]  = useState(today())
  const [salesOptions,  setSalesOptions]  = useState([])
  const [salesLoading,  setSalesLoading]  = useState(false)
  const [saleSearch,    setSaleSearch]    = useState('')
  const [inspectModal,  setInspectModal]  = useState(null)
  const [inspectNotes,  setInspectNotes]  = useState('')
  const limit = 15

  const load = useCallback(async () => {
    const params = { page, limit }
    if (filters.status)    params.status    = filters.status
    if (filters.condition) params.condition = filters.condition
    const res = await salesReturnsAPI.list(params)
    setItems(res.data.items || [])
    setTotal(res.data.total || 0)
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const loadSalesForDate = async (date) => {
    if (!date) { setSalesOptions([]); return }
    setSalesLoading(true)
    try {
      const res = await salesAPI.list({ date_from: date, date_to: date, limit: 500 })
      setSalesOptions((res.data.items || []).map(s => ({
        ...s,
        _label: `#${s.sales_id} — ${s.product?.product_name || 'Product'} (${s.customer_name || 'Walk-in'})`,
      })))
    } catch { setSalesOptions([]) }
    finally { setSalesLoading(false) }
  }

  const handleSaleSelect = (sale) => {
    setForm(f => ({
      ...f,
      sales_id:      String(sale.sales_id),
      product_id:    String(sale.product_id || ''),
      _sale_label:   `#${sale.sales_id} — ${sale.product?.product_name || ''} (${formatDate(sale.sales_date)})`,
      _product_name: sale.product?.product_name || '',
      _max_qty:      String(sale.quantity || ''),
      _customer:     sale.customer_name || 'Walk-in Customer',
      _sale_date:    sale.sales_date || '',
      quantity:      String(sale.quantity || ''),
    }))
    setSaleSearch('')
  }

  // Filter the date's sales by sales number, product name, or customer name so
  // staff can quickly find the right transaction on a busy sales day.
  const filteredSalesOptions = salesOptions.filter(s => {
    if (!saleSearch.trim()) return true
    const q = saleSearch.trim().toLowerCase()
    return (
      String(s.sales_id).includes(q) ||
      (s.product?.product_name || '').toLowerCase().includes(q) ||
      (s.customer_name || '').toLowerCase().includes(q)
    )
  })

  const openCreate = async () => {
    setEditing(null); setForm(empty); setError(''); setSaleSearch('')
    const d = today(); setPurchaseDate(d)
    await loadSalesForDate(d)
    setModal(true)
  }

  const openEdit = async (item) => {
    setEditing(item)
    setForm({
      sales_id:     String(item.sales_id),
      product_id:   String(item.product_id),
      warehouse_id: item.warehouse_id ? String(item.warehouse_id) : '',
      return_date:  item.return_date,
      quantity:     String(item.quantity),
      return_reason: item.return_reason || '',
      condition:    item.condition,
      status:       item.status,
      inspection_notes: item.inspection_notes || '',
      remarks:      item.remarks || '',
      _sale_label:  `#${item.sales_id}`,
      _product_name: item.product?.product_name || '',
      _max_qty:     '',
      _customer:    '',
      _sale_date:   '',
    })
    setError('')
    setSaleSearch('')
    const saleDate = item.sales_date ? item.sales_date.slice(0, 10) : today()
    setPurchaseDate(saleDate)
    await loadSalesForDate(saleDate)
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError('')
    const qty = parseInt(form.quantity)
    if (!qty || qty <= 0) { setError('Quantity must be greater than 0'); return }
    if (!form.sales_id)   { setError('Please select a sale'); return }
    setLoading(true)
    try {
      const data = {
        sales_id:     parseInt(form.sales_id),
        product_id:   parseInt(form.product_id),
        warehouse_id: form.warehouse_id ? parseInt(form.warehouse_id) : null,
        return_date:  form.return_date,
        quantity:     qty,
        return_reason: form.return_reason || null,
        condition:    form.condition,
        status:       editing ? form.status : 'Submitted',
        inspection_notes: form.inspection_notes || null,
        remarks:      form.remarks || null,
      }
      if (editing) await salesReturnsAPI.update(editing.return_id, data)
      else         await salesReturnsAPI.create(data)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save return record.')
    } finally { setLoading(false) }
  }

  const transition = async (item, newStatus, extra = {}) => {
    setActionError('')
    try {
      await salesReturnsAPI.update(item.return_id, { status: newStatus, ...extra })
      load()
    } catch (err) {
      setActionError(err.response?.data?.detail || `Failed to move to ${newStatus}.`)
      setTimeout(() => setActionError(''), 6000)
    }
  }

  const handleInspect = async () => {
    if (!inspectModal) return
    await transition(inspectModal, 'Under Inspection', { inspection_notes: inspectNotes || null })
    setInspectModal(null); setInspectNotes('')
  }

  const getActions = (item) => {
    const nexts = TRANSITIONS[item.status] || []
    const btns = []
    if (nexts.includes('Under Inspection'))
      btns.push(
        <button key="ins" onClick={() => { setInspectModal(item); setInspectNotes('') }}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Start Inspection
        </button>
      )
    if (nexts.includes('Approved'))
      btns.push(
        <button key="app" onClick={() => transition(item, 'Approved')}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Approve
        </button>
      )
    if (nexts.includes('Rejected'))
      btns.push(
        <button key="rej" onClick={() => transition(item, 'Rejected')}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Reject
        </button>
      )
    if (nexts.includes('Sent To Supplier'))
      btns.push(
        <button key="sup" onClick={() => transition(item, 'Sent To Supplier')}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Send to Supplier
        </button>
      )
    if (nexts.includes('Completed'))
      btns.push(
        <button key="com" onClick={() => transition(item, 'Completed')}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Complete
        </button>
      )
    return btns
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Sales Returns</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Manage customer returns through inspection and resolution workflow</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Return</button>
      </div>

      {/* Workflow legend */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Workflow:</span>
        {['Submitted', '→', 'Under Inspection', '→', 'Approved', '→', 'Completed'].map((s, i) => (
          s === '→'
            ? <span key={i} style={{ color: '#94a3b8', fontSize: '0.75rem' }}>→</span>
            : <StatusBadge key={s} status={s} />
        ))}
        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>|</span>
        <StatusBadge status="Sent To Supplier" />
        <StatusBadge status="Rejected" />
      </div>

      {/* Inventory rule info */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '0.625rem 1rem', fontSize: '0.8rem', color: '#1e40af', marginBottom: '1rem' }}>
        <strong>Inventory Rule:</strong> Stock impact occurs only when status moves to <strong>Approved</strong> — Good → Available Stock; Defective/Damaged → Damaged Goods only.
      </div>

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {actionError}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 'auto' }} value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={filters.condition} onChange={e => { setFilters(f => ({ ...f, condition: e.target.value })); setPage(1) }}>
            <option value="">All Conditions</option>
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Return Date</th><th>Sale</th><th>Product</th>
                <th>Qty</th><th>Condition</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No return records found</td></tr>
                : items.map((item, i) => (
                  <tr key={item.return_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td>{formatDate(item.return_date)}</td>
                    <td>
                      <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        #{item.sales_id}
                      </code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{item.product?.product_name || `#${item.product_id}`}</div>
                      {item.inspection_notes && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '1px', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.inspection_notes}>
                          🔍 {item.inspection_notes}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatNumber(item.quantity)}</td>
                    <td><ConditionBadge condition={item.condition} /></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {getActions(item)}
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.return_id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Start Inspection mini-modal */}
      <Modal open={!!inspectModal} onClose={() => setInspectModal(null)} title="Start Inspection" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#475569' }}>
            Move <strong>#{inspectModal?.return_id}</strong> to <strong>Under Inspection</strong>.
            Optionally record initial inspection notes.
          </p>
          <div>
            <label className="label">Inspection Notes (optional)</label>
            <textarea className="input" rows={3} value={inspectNotes}
              placeholder="e.g., Product received from customer, initiating physical check..."
              onChange={e => setInspectNotes(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setInspectModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleInspect}>Start Inspection</button>
          </div>
        </div>
      </Modal>

      {/* Create / Edit modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Return' : 'New Sales Return'} size="lg">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>{error}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* Date filter */}
            <div style={{ gridColumn: '1 / -1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
              <label className="label" style={{ marginBottom: '0.375rem', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>
                Step 1 — Date of Purchase
              </label>
              <input className="input" type="date" value={purchaseDate}
                onChange={async e => {
                  const d = e.target.value; setPurchaseDate(d)
                  setForm(f => ({ ...f, sales_id: '', product_id: '', _sale_label: '', _product_name: '', _max_qty: '', _customer: '', _sale_date: '', quantity: '' }))
                  await loadSalesForDate(d)
                }}
                style={{ maxWidth: '14rem' }} />
              {purchaseDate && !salesLoading && (
                <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', color: salesOptions.length === 0 ? '#dc2626' : '#16a34a', fontWeight: 500 }}>
                  {salesOptions.length === 0 ? 'No sales found for this date' : `${salesOptions.length} sale${salesOptions.length !== 1 ? 's' : ''} found`}
                </span>
              )}
            </div>

            {/* Sale selector — searchable by sales number, product, or customer */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Step 2 — Select Sale *</label>
              {salesOptions.length > 0 && (
                <input
                  className="input"
                  style={{ marginBottom: '0.375rem' }}
                  placeholder="Search by sales number, product, or customer..."
                  value={saleSearch}
                  onChange={e => setSaleSearch(e.target.value)}
                />
              )}
              <select className="input" required value={form.sales_id} disabled={salesOptions.length === 0}
                onChange={e => {
                  const sale = salesOptions.find(s => String(s.sales_id) === e.target.value)
                  if (sale) handleSaleSelect(sale)
                  else setForm(f => ({ ...f, sales_id: e.target.value }))
                }}>
                <option value="">
                  {salesOptions.length === 0 ? 'No sales on this date' : filteredSalesOptions.length === 0 ? 'No matches' : 'Select a sale...'}
                </option>
                {filteredSalesOptions.map(s => <option key={s.sales_id} value={s.sales_id}>{s._label}</option>)}
              </select>
            </div>

            {/* Auto-populated sale info */}
            {form.sales_id && (
              <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Sale Details (auto-filled)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', fontSize: '0.8125rem' }}>
                  {[['Sales Number', `#${form.sales_id}`], ['Product', form._product_name], ['Customer', form._customer], ['Sale Date', formatDate(form._sale_date)], ['Qty Sold', form._max_qty]].map(([l, v]) => v ? (
                    <div key={l} style={{ display: 'flex', gap: '0.5rem' }}>
                      <span style={{ color: '#64748b', minWidth: '75px' }}>{l}</span>
                      <span style={{ fontWeight: 600, color: '#166534' }}>{v}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            <div>
              <label className="label">Return Date *</label>
              <input className="input" type="date" required value={form.return_date}
                onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Return Quantity *</label>
              <input className="input" type="number" required min="1" step="1"
                value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              {form._max_qty && <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>Original qty sold: {form._max_qty}</p>}
            </div>
            <div>
              <label className="label">Condition *</label>
              <select className="input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Return to Warehouse</label>
              <AsyncDropdown
                endpoint="/warehouses"
                labelField="warehouse_name"
                valueField="warehouse_id"
                value={form.warehouse_id}
                onChange={v => setForm(f => ({ ...f, warehouse_id: v }))}
                placeholder="Select warehouse (optional)"
                emptyHint="No warehouses found"
              />
              <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>Required for stock restoration when Approved</p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Return Reason</label>
              <select className="input" value={form.return_reason} onChange={e => setForm(f => ({ ...f, return_reason: e.target.value }))}>
                <option value="">Select reason...</option>
                {REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            {editing && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Inspection Notes</label>
                <textarea className="input" rows={2} value={form.inspection_notes}
                  onChange={e => setForm(f => ({ ...f, inspection_notes: e.target.value }))} />
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Remarks</label>
              <textarea className="input" rows={2} placeholder="Additional notes..."
                value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await salesReturnsAPI.delete(deleteId); load() }} />
    </div>
  )
}
