import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supplierReturnsAPI, receivingsAPI } from '../api'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber } from '../utils/format'

const STATUSES = ['Pending', 'Ready To Send', 'Sent To Supplier', 'Completed', 'Cancelled']
const REASONS = [
  'Damaged during delivery',
  'Wrong shipment',
  'Defective product',
  'Quantity mismatch',
  'Expired product',
  'Return to Supplier',
  'Other',
]

const TRANSITIONS = {
  'Pending':          ['Ready To Send', 'Cancelled'],
  'Ready To Send':    ['Sent To Supplier', 'Cancelled'],
  'Sent To Supplier': ['Completed'],
  'Completed':        [],
  'Cancelled':        [],
}

const STATUS_COLORS = {
  'Pending':          ['#fef3c7', '#d97706'],
  'Ready To Send':    ['#eff6ff', '#2563eb'],
  'Sent To Supplier': ['#f0fdf4', '#15803d'],
  'Completed':        ['#dcfce7', '#166534'],
  'Cancelled':        ['#f1f5f9', '#64748b'],
}

const today = () => new Date().toISOString().slice(0, 10)

const emptyForm = {
  return_date:  today(),
  quantity:     '',
  reason:       '',
  status:       'Pending',
  remarks:      '',
  // Auto-filled from receiving:
  supplier_id:  '',
  product_id:   '',
  receiving_id: '',
}

function StatusBadge({ status }) {
  const [bg, color] = STATUS_COLORS[status] || ['#f1f5f9', '#64748b']
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  )
}

function ActionButton({ label, color, bg, border, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: bg, color, border: `1px solid ${border}`, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}

function InfoRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
      <span style={{ fontSize: '0.75rem', color: '#64748b', minWidth: '90px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.8125rem', fontWeight: highlight ? 700 : 500, color: highlight ? '#dc2626' : '#1e293b' }}>{value}</span>
    </div>
  )
}

export default function SupplierReturns() {
  const [searchParams] = useSearchParams()
  const [items,       setItems]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  // Seeded from the notification bell's click-through (e.g. ?status=Pending)
  const [filters,     setFilters]     = useState({ status: searchParams.get('status') || '' })
  const [modal,       setModal]       = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [form,        setForm]        = useState(emptyForm)
  const [deleteId,    setDeleteId]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [actionError, setActionError] = useState('')

  // Receiving-first create flow
  const [rcvDate,     setRcvDate]     = useState(today())
  const [rcvOptions,  setRcvOptions]  = useState([])
  const [rcvLoading,  setRcvLoading]  = useState(false)
  const [rcvSelected, setRcvSelected] = useState(null)
  const [standalone,  setStandalone]  = useState(false)  // manual mode toggle

  // Edit-only: supplier/product text for display
  const [editSupplierName, setEditSupplierName] = useState('')
  const [editProductName,  setEditProductName]  = useState('')

  const limit = 15

  const load = useCallback(async () => {
    const params = { page, limit }
    if (filters.status) params.status = filters.status
    try {
      const res = await supplierReturnsAPI.list(params)
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch { /* handled globally */ }
  }, [page, filters])

  useEffect(() => { load() }, [load])

  // Load receivings for selected date (only those with rejected qty > 0)
  const loadRcvForDate = useCallback(async (d) => {
    if (!d) { setRcvOptions([]); return }
    setRcvLoading(true)
    try {
      const res = await receivingsAPI.list({ date_from: d, date_to: d, has_rejected: true, limit: 200 })
      setRcvOptions(res.data.items || [])
    } catch { setRcvOptions([]) }
    finally { setRcvLoading(false) }
  }, [])

  // Open create modal
  const openCreate = async () => {
    setEditing(null)
    setRcvSelected(null)
    setStandalone(false)
    setForm(emptyForm)
    setError('')
    const d = today()
    setRcvDate(d)
    await loadRcvForDate(d)
    setModal(true)
  }

  // Open edit modal
  const openEdit = (item) => {
    setEditing(item)
    setEditSupplierName(item.supplier?.supplier_name || `#${item.supplier_id}`)
    setEditProductName(item.product?.product_name   || `#${item.product_id}`)
    setForm({
      supplier_id:  String(item.supplier_id),
      product_id:   String(item.product_id),
      return_date:  item.return_date,
      quantity:     String(item.quantity),
      reason:       item.reason || '',
      status:       item.status,
      remarks:      item.remarks || '',
      receiving_id: item.receiving_id ? String(item.receiving_id) : '',
    })
    setError('')
    setModal(true)
  }

  // When user selects a receiving in the create flow
  const handleRcvSelect = (rcv) => {
    setRcvSelected(rcv)
    setForm(f => ({
      ...f,
      supplier_id:  String(rcv.supplier_id || ''),
      product_id:   String(rcv.product_id),
      receiving_id: String(rcv.receiving_id),
      quantity:     String(rcv.quantity_rejected),  // default = full rejected qty
    }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    const qty = parseInt(form.quantity)
    if (!qty || qty <= 0) { setError('Quantity must be greater than 0'); return }

    // Extra client-side guard in create-from-receiving mode
    if (!editing && rcvSelected && qty > rcvSelected.quantity_rejected + 0.001) {
      setError(`Return quantity cannot exceed rejected quantity (${rcvSelected.quantity_rejected})`)
      return
    }

    if (!form.supplier_id && !standalone) { setError('Please select a receiving record'); return }
    if (!form.product_id)                  { setError('Product is required'); return }

    setLoading(true)
    try {
      const data = {
        supplier_id:  parseInt(form.supplier_id),
        product_id:   parseInt(form.product_id),
        return_date:  form.return_date,
        quantity:     qty,
        reason:       form.reason || null,
        status:       editing ? form.status : 'Pending',
        remarks:      form.remarks || null,
        receiving_id: form.receiving_id ? parseInt(form.receiving_id) : null,
      }
      if (editing) await supplierReturnsAPI.update(editing.return_id, data)
      else         await supplierReturnsAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save.')
    } finally { setLoading(false) }
  }

  const transition = async (item, newStatus) => {
    setActionError('')
    try {
      await supplierReturnsAPI.update(item.return_id, { status: newStatus })
      load()
    } catch (err) {
      setActionError(err.response?.data?.detail || `Failed to move to ${newStatus}.`)
      setTimeout(() => setActionError(''), 5000)
    }
  }

  const getActions = (item) => {
    const nexts = TRANSITIONS[item.status] || []
    const btns = []
    if (nexts.includes('Ready To Send'))
      btns.push(<ActionButton key="rts" label="Ready to Send" color="#2563eb" bg="#eff6ff" border="#bfdbfe" onClick={() => transition(item, 'Ready To Send')} />)
    if (nexts.includes('Sent To Supplier'))
      btns.push(<ActionButton key="sts" label="Mark Sent" color="#15803d" bg="#f0fdf4" border="#bbf7d0" onClick={() => transition(item, 'Sent To Supplier')} />)
    if (nexts.includes('Completed'))
      btns.push(<ActionButton key="co" label="Complete" color="#166534" bg="#dcfce7" border="#86efac" onClick={() => transition(item, 'Completed')} />)
    if (nexts.includes('Cancelled'))
      btns.push(<ActionButton key="ca" label="Cancel" color="#64748b" bg="#f1f5f9" border="#e2e8f0" onClick={() => transition(item, 'Cancelled')} />)
    return btns
  }

  // ── Standalone (manual) create form ────────────────────────────────────────
  const StandaloneForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div>
        <label className="label">Supplier *</label>
        <SearchableSelect
          endpoint="/suppliers"
          labelField="supplier_name"
          valueField="supplier_id"
          value={form.supplier_id}
          onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
          placeholder="Search supplier..."
          required
          emptyHint="No suppliers found"
        />
      </div>
      <div>
        <label className="label">Product *</label>
        <SearchableSelect
          endpoint="/products"
          labelField="product_name"
          valueField="product_id"
          value={form.product_id}
          onChange={v => setForm(f => ({ ...f, product_id: v }))}
          placeholder="Search product..."
          required
          emptyHint="No products found"
        />
      </div>
      <div>
        <label className="label">Return Date *</label>
        <input className="input" type="date" required value={form.return_date}
          onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
      </div>
      <div>
        <label className="label">Return Quantity *</label>
        <input className="input" type="number" required min="1" step="1"
          value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
      </div>
      <div>
        <label className="label">Reason</label>
        <select className="input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
          <option value="">Select reason...</option>
          {REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Receiving Reference (optional)</label>
        <input className="input" type="number" value={form.receiving_id}
          onChange={e => setForm(f => ({ ...f, receiving_id: e.target.value }))}
          placeholder="RCV-ID if applicable" />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label className="label">Remarks</label>
        <textarea className="input" rows={2} value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
      </div>
    </div>
  )

  // ── Receiving-first create form ─────────────────────────────────────────────
  const maxQty = rcvSelected?.quantity_rejected || 0
  const currentQty = parseFloat(form.quantity) || 0
  const qtyOk = rcvSelected ? currentQty > 0 && currentQty <= maxQty + 0.001 : currentQty > 0

  const ReceivingFirstForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Step 1: Date */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          Step 1 — Receiving Date
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            className="input" type="date" value={rcvDate}
            style={{ maxWidth: '13rem' }}
            onChange={async e => {
              const d = e.target.value
              setRcvDate(d)
              setRcvSelected(null)
              setForm(f => ({ ...f, supplier_id: '', product_id: '', receiving_id: '', quantity: '' }))
              await loadRcvForDate(d)
            }}
          />
          {rcvLoading && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Loading…</span>}
          {!rcvLoading && rcvDate && (
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: rcvOptions.length === 0 ? '#dc2626' : '#16a34a' }}>
              {rcvOptions.length === 0
                ? 'No receivings with rejected items on this date'
                : `${rcvOptions.length} receiving${rcvOptions.length !== 1 ? 's' : ''} with rejected items`}
            </span>
          )}
        </div>
      </div>

      {/* Step 2: Select Receiving */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          Step 2 — Select Receiving
        </div>
        <select
          className="input"
          value={form.receiving_id}
          disabled={rcvOptions.length === 0}
          onChange={e => {
            const rcv = rcvOptions.find(r => String(r.receiving_id) === e.target.value)
            if (rcv) handleRcvSelect(rcv)
            else { setRcvSelected(null); setForm(f => ({ ...f, receiving_id: e.target.value, supplier_id: '', product_id: '', quantity: '' })) }
          }}
        >
          <option value="">{rcvOptions.length === 0 ? 'No receivings available' : 'Select receiving…'}</option>
          {rcvOptions.map(r => (
            <option key={r.receiving_id} value={r.receiving_id}>
              RCV-{r.receiving_id} — {r.supplier?.supplier_name || '?'} | {r.product?.product_name || '?'} (Rejected: {formatNumber(r.quantity_rejected)})
            </option>
          ))}
        </select>
      </div>

      {/* Step 3: Auto-filled info */}
      {rcvSelected && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.625rem' }}>
            Step 3 — Auto-filled from Receiving #{rcvSelected.receiving_id}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem 1.5rem' }}>
            <InfoRow label="Supplier"      value={rcvSelected.supplier?.supplier_name || '—'} />
            <InfoRow label="Product"       value={rcvSelected.product?.product_name   || '—'} />
            <InfoRow label="Qty Received"  value={formatNumber(rcvSelected.quantity_received)} />
            <InfoRow label="Qty Accepted"  value={formatNumber(rcvSelected.quantity_accepted)} />
            <InfoRow label="Qty Rejected"  value={`${formatNumber(rcvSelected.quantity_rejected)} (max returnable)`} highlight />
            <InfoRow label="Receiving Date" value={formatDate(rcvSelected.received_date)} />
          </div>
        </div>
      )}

      {/* Step 4: Return details */}
      {rcvSelected && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', gridColumn: '1 / -1', marginBottom: '-0.5rem' }}>
            Step 4 — Return Details
          </div>
          <div>
            <label className="label">Return Date *</label>
            <input className="input" type="date" required value={form.return_date}
              onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Return Quantity * <span style={{ color: '#94a3b8', fontWeight: 400 }}>(max: {formatNumber(maxQty)})</span></label>
            <input
              className="input" type="number" required min="1" step="1" max={maxQty}
              value={form.quantity}
              style={{ borderColor: form.quantity && !qtyOk ? '#f87171' : undefined }}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            />
            {form.quantity && !qtyOk && (
              <p style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem' }}>
                Must be between 0 and {formatNumber(maxQty)}
              </p>
            )}
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
              <option value="">Select reason…</option>
              {REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      )}
    </div>
  )

  // ── Edit form ───────────────────────────────────────────────────────────────
  const EditForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      {/* Locked fields */}
      <div>
        <label className="label">Supplier</label>
        <div className="input" style={{ background: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}>{editSupplierName}</div>
      </div>
      <div>
        <label className="label">Product</label>
        <div className="input" style={{ background: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}>{editProductName}</div>
      </div>
      {form.receiving_id && (
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="label">Linked Receiving</label>
          <div className="input" style={{ background: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}>RCV-{form.receiving_id}</div>
        </div>
      )}
      <div>
        <label className="label">Return Date *</label>
        <input className="input" type="date" required value={form.return_date}
          onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
      </div>
      <div>
        <label className="label">Quantity *</label>
        <input className="input" type="number" required min="1" step="1"
          value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
      </div>
      <div>
        <label className="label">Reason</label>
        <select className="input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
          <option value="">Select reason…</option>
          {REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>Use workflow buttons in the table to advance status.</p>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label className="label">Remarks</label>
        <textarea className="input" rows={2} value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
      </div>
    </div>
  )

  const canSave = editing
    ? true
    : standalone
      ? (!!form.supplier_id && !!form.product_id && !!form.quantity)
      : (!!rcvSelected && qtyOk)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Supplier Returns</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Track returns to suppliers — fully traceable to originating receiving records
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Return</button>
      </div>

      {/* Workflow legend */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginRight: '0.25rem' }}>Workflow:</span>
        {['Pending', '→', 'Ready To Send', '→', 'Sent To Supplier', '→', 'Completed'].map((s, i) => (
          s === '→'
            ? <span key={i} style={{ color: '#94a3b8', fontSize: '0.75rem' }}>→</span>
            : <StatusBadge key={s} status={s} />
        ))}
        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>|</span>
        <StatusBadge status="Cancelled" />
      </div>

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 'auto' }}
            value={filters.status}
            onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Return Date</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Reason / Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No supplier returns found</td></tr>
              ) : items.map((item, i) => (
                <tr key={item.return_id}>
                  <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                  <td>{formatDate(item.return_date)}</td>
                  <td style={{ fontWeight: 500 }}>{item.supplier?.supplier_name || `#${item.supplier_id}`}</td>
                  <td>{item.product?.product_name || `#${item.product_id}`}</td>
                  <td style={{ fontWeight: 600 }}>{formatNumber(item.quantity)}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.reason || '—'}
                    {item.receiving_id && (
                      <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '1px', fontWeight: 500 }}>
                        ↳ RCV-{item.receiving_id}
                      </div>
                    )}
                  </td>
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

      {/* Create / Edit Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? `Edit Return #${editing.return_id}` : 'New Supplier Return'}
        size="lg"
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {/* Create mode: toggle between receiving-first and standalone */}
          {!editing && (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', background: '#f1f5f9', borderRadius: '0.5rem' }}>
              <button
                type="button"
                onClick={() => { setStandalone(false); setRcvSelected(null); setForm(emptyForm) }}
                style={{
                  flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.8rem',
                  background: !standalone ? '#ffffff' : 'transparent',
                  color: !standalone ? '#1e293b' : '#64748b',
                  boxShadow: !standalone ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                From Receiving (Recommended)
              </button>
              <button
                type="button"
                onClick={() => { setStandalone(true); setRcvSelected(null); setForm(emptyForm) }}
                style={{
                  flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.8rem',
                  background: standalone ? '#ffffff' : 'transparent',
                  color: standalone ? '#1e293b' : '#64748b',
                  boxShadow: standalone ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Manual Entry
              </button>
            </div>
          )}

          {/* Render correct form */}
          {editing
            ? <EditForm />
            : standalone
              ? <StandaloneForm />
              : <ReceivingFirstForm />
          }

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !canSave}>
              {loading ? 'Saving…' : 'Save Return'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => { await supplierReturnsAPI.delete(deleteId); load() }}
      />
    </div>
  )
}
