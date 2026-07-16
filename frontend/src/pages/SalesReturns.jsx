import { useState, useEffect, useCallback } from 'react'
import { salesReturnsAPI, salesAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber, formatCurrency } from '../utils/format'
import { downloadBlob } from '../utils/downloadFile'

const CONDITIONS = ['Good', 'Defective', 'Damaged', 'Incomplete', 'Pending Inspection']
const STATUSES   = ['Submitted', 'Under Inspection', 'Approved', 'Sent To Supplier', 'Completed', 'Rejected']
// TKU never issues cash refunds — every return resolves as one of these three types.
const REASONS      = ['Broken Parts', 'Wrong Product', 'Defective Product', 'Other']
const RETURN_TYPES = ['Product Replacement', 'Exchange']

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
  sales_id:        '',
  sales_detail_id: '',
  product_id:      '',
  warehouse_id:    '',
  return_date:     new Date().toISOString().slice(0, 10),
  quantity:        '',
  return_reason:   '',
  return_type:     'Product Replacement',
  condition:       'Pending Inspection',
  status:          'Submitted',
  inspection_notes: '',
  remarks:         '',
  // Broken Parts
  part_name:       '',
  part_quantity:   '',
  part_remarks:    '',
  // Exchange
  exchange_product_id: '',
  _exchange_product_name: '',
  _old_price:      0,
  _new_price:      0,
  _sale_label:     '',
  _product_name:   '',
  _sold_qty:       '',
  _already_returned: 0,
  _max_qty:        '',
  _customer:       '',
  _sale_date:      '',
}

// Multi-item sales expose their real product lines via `sale.details`; a
// legacy (pre-multi-item-redesign) sale has none, so it's represented here
// as a single synthetic "line" built from the sale's own legacy columns —
// keeps the picker UI identical for both cases.
function saleLines(sale) {
  if (!sale) return []
  if (sale.details && sale.details.length > 0) return sale.details
  if (sale.product_id) {
    return [{
      detail_id: null,
      product_id: sale.product_id,
      product: sale.product,
      quantity: sale.quantity,
      unit_price: sale.sale_price,
    }]
  }
  return []
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
  const [selectedSale,  setSelectedSale]  = useState(null)
  const [lineRemaining, setLineRemaining] = useState({})   // key -> { returned, remaining, sold }
  const [inspectModal,  setInspectModal]  = useState(null)
  const [inspectNotes,  setInspectNotes]  = useState('')
  const [exporting,     setExporting]     = useState(false)
  const [limit, setLimit] = useState(15)

  const buildFilterParams = useCallback(() => {
    const params = {}
    if (filters.status)    params.status    = filters.status
    if (filters.condition) params.condition = filters.condition
    return params
  }, [filters])

  const load = useCallback(async () => {
    const res = await salesReturnsAPI.list({ page, limit, ...buildFilterParams() })
    setItems(res.data.items || [])
    setTotal(res.data.total || 0)
  }, [page, limit, buildFilterParams])

  useEffect(() => { load() }, [load])

  const loadSalesForDate = async (date) => {
    if (!date) { setSalesOptions([]); return }
    setSalesLoading(true)
    try {
      const res = await salesAPI.list({ date_from: date, date_to: date, limit: 500 })
      setSalesOptions((res.data.items || []).map(s => {
        const lines = saleLines(s)
        const productsLabel = lines.length > 1
          ? `${lines.length} products`
          : (lines[0]?.product?.product_name || 'Product')
        return { ...s, _label: `#${s.sales_id} — ${productsLabel} (${s.customer_name || 'Walk-in'})` }
      }))
    } catch { setSalesOptions([]) }
    finally { setSalesLoading(false) }
  }

  const lineKey = (line) => line.detail_id != null ? `d${line.detail_id}` : `p${line.product_id}`

  // Sum every non-Rejected return already filed against each line of this
  // sale, so the picker can show/cap "remaining returnable" per product
  // before the user even picks one.
  const loadRemainingForSale = async (sale) => {
    const lines = saleLines(sale)
    let priorReturns = []
    try {
      const res = await salesReturnsAPI.list({ sales_id: sale.sales_id, limit: 200 })
      priorReturns = (res.data.items || []).filter(r => r.status !== 'Rejected')
    } catch { priorReturns = [] }

    const map = {}
    for (const line of lines) {
      const returned = priorReturns
        .filter(r => line.detail_id != null
          ? r.sales_detail_id === line.detail_id
          : (r.sales_detail_id == null && r.product_id === line.product_id))
        .reduce((s, r) => s + (r.quantity || 0), 0)
      map[lineKey(line)] = { sold: line.quantity || 0, returned, remaining: Math.max(0, (line.quantity || 0) - returned) }
    }
    setLineRemaining(map)
    return map
  }

  const handleSaleSelect = async (sale) => {
    setSelectedSale(sale)
    setForm(f => ({
      ...empty,
      return_date: f.return_date,
      sales_id:    String(sale.sales_id),
      _sale_label: `#${sale.sales_id} (${formatDate(sale.sales_date)})`,
      _customer:   sale.customer_name || 'Walk-in Customer',
      _sale_date:  sale.sales_date || '',
    }))
    setSaleSearch('')
    const map = await loadRemainingForSale(sale)
    // Only one line to choose from (single-product sale, legacy or not) — auto-select it.
    const lines = saleLines(sale)
    if (lines.length === 1) handleDetailSelect(lines[0], map)
  }

  const handleDetailSelect = (line, remainingMap = lineRemaining) => {
    const info = remainingMap[lineKey(line)] || { sold: line.quantity || 0, returned: 0, remaining: line.quantity || 0 }
    setForm(f => ({
      ...f,
      sales_detail_id: line.detail_id != null ? String(line.detail_id) : '',
      product_id:      String(line.product_id),
      _product_name:   line.product?.product_name || '',
      _sold_qty:        String(info.sold),
      _already_returned: info.returned,
      _max_qty:         String(info.remaining),
      quantity:         info.remaining > 0 ? String(info.remaining) : '',
      _old_price:       line.unit_price || 0,
    }))
  }

  // Filter the date's sales by sales number, product name, or customer name so
  // staff can quickly find the right transaction on a busy sales day.
  const filteredSalesOptions = salesOptions.filter(s => {
    if (!saleSearch.trim()) return true
    const q = saleSearch.trim().toLowerCase()
    return (
      String(s.sales_id).includes(q) ||
      saleLines(s).some(l => (l.product?.product_name || '').toLowerCase().includes(q)) ||
      (s.customer_name || '').toLowerCase().includes(q)
    )
  })

  const openCreate = async () => {
    setEditing(null); setForm(empty); setError(''); setSaleSearch(''); setSelectedSale(null); setLineRemaining({})
    const d = today(); setPurchaseDate(d)
    await loadSalesForDate(d)
    setModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setSelectedSale(null); setLineRemaining({})
    setForm({
      ...empty,
      sales_id:        String(item.sales_id),
      sales_detail_id: item.sales_detail_id != null ? String(item.sales_detail_id) : '',
      product_id:      String(item.product_id),
      warehouse_id:    item.warehouse_id ? String(item.warehouse_id) : '',
      return_date:     item.return_date,
      quantity:        String(item.quantity),
      return_reason:   item.return_reason || '',
      return_type:     item.return_type || 'Product Replacement',
      condition:       item.condition,
      status:          item.status,
      inspection_notes: item.inspection_notes || '',
      remarks:         item.remarks || '',
      part_name:       item.part_replacement?.part_name || '',
      part_quantity:   item.part_replacement ? String(item.part_replacement.quantity) : '',
      part_remarks:    item.part_replacement?.remarks || '',
      _exchange_product_name: item.exchange?.new_product?.product_name || '',
      _old_price:      item.exchange?.old_price || 0,
      _new_price:      item.exchange?.new_price || 0,
      _sale_label:     `#${item.sales_id}`,
      _product_name:   item.product?.product_name || '',
      _customer:       item.sale?.customer_name || '',
      _sale_date:      item.sale?.sales_date || '',
    })
    setError('')
    setSaleSearch('')
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError('')
    const qty = parseInt(form.quantity)
    if (!qty || qty <= 0) { setError('Quantity must be greater than 0'); return }
    if (!form.sales_id)   { setError('Please select a sale'); return }
    if (!form.product_id) { setError('Please select a product'); return }
    if (!editing && form._max_qty !== '' && qty > parseInt(form._max_qty)) {
      setError(`Only ${form._max_qty} unit(s) remain returnable for this line.`)
      return
    }
    if (!editing && form.return_type === 'Broken Parts' && !form.part_name.trim()) {
      setError('Please enter the replacement part name.'); return
    }
    if (!editing && form.return_type === 'Exchange') {
      if (!form.exchange_product_id) { setError('Please select the exchange product.'); return }
      if (form._new_price < form._old_price) {
        setError('TKU does not offer cash refunds for exchanges — please choose a product priced at or above the original.')
        return
      }
    }
    setLoading(true)
    try {
      const data = {
        sales_id:        parseInt(form.sales_id),
        sales_detail_id: form.sales_detail_id ? parseInt(form.sales_detail_id) : null,
        product_id:      parseInt(form.product_id),
        warehouse_id: form.warehouse_id ? parseInt(form.warehouse_id) : null,
        return_date:  form.return_date,
        quantity:     qty,
        return_reason: form.return_reason || null,
        return_type:  form.return_type,
        condition:    form.condition,
        status:       editing ? form.status : 'Submitted',
        inspection_notes: form.inspection_notes || null,
        remarks:      form.remarks || null,
      }
      if (!editing && form.return_type === 'Broken Parts') {
        data.part_replacement = {
          part_name: form.part_name.trim(),
          quantity: parseInt(form.part_quantity) || qty,
          remarks: form.part_remarks || null,
        }
      }
      if (!editing && form.return_type === 'Exchange') {
        data.exchange = { new_product_id: parseInt(form.exchange_product_id), quantity: qty }
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const res = await salesReturnsAPI.exportXlsx(buildFilterParams())
              downloadBlob(res.data, 'sales-returns-export.xlsx')
            } catch {
              alert('Failed to export sales returns.')
            } finally {
              setExporting(false)
            }
          }}>{exporting ? 'Exporting...' : 'Export'}</button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Return</button>
        </div>
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
        <strong>Inventory Rule:</strong> Stock impact occurs only when status moves to <strong>Approved</strong> — Product Replacement: Good → Available Stock, Defective/Damaged/Incomplete → Damaged Goods only.
        Broken Parts: Available −qty / Incomplete +qty on a cannibalized unit. Exchange: old product +1 Available, new product −1 Available.
        TKU does not issue cash refunds.
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
                <th>#</th><th>Return Date</th><th>Sale</th><th>Product</th><th>Type</th>
                <th>Qty</th><th>Condition</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No return records found</td></tr>
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
                      {item.return_type === 'Exchange' && item.exchange?.new_product && (
                        <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '1px' }}>→ {item.exchange.new_product.product_name}</div>
                      )}
                      {item.return_type === 'Broken Parts' && item.part_replacement && (
                        <div style={{ fontSize: '0.7rem', color: '#d97706', marginTop: '1px' }}>Part: {item.part_replacement.part_name}</div>
                      )}
                      {item.inspection_notes && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '1px', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.inspection_notes}>
                          🔍 {item.inspection_notes}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.return_type}</td>
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
        <Pagination page={page} total={total} limit={limit} onChange={setPage}
          pageSizeOptions={[15, 25, 50, 100]} onLimitChange={v => { setLimit(v); setPage(1) }} />
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

            {editing ? (
              /* Editing an existing return — sale/product are fixed; show a read-only summary */
              <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Sale / Product</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', fontSize: '0.8125rem' }}>
                  {[['Sales Number', `#${form.sales_id}`], ['Product', form._product_name], ['Customer', form._customer], ['Sale Date', form._sale_date ? formatDate(form._sale_date) : '']].map(([l, v]) => v ? (
                    <div key={l} style={{ display: 'flex', gap: '0.5rem' }}>
                      <span style={{ color: '#64748b', minWidth: '75px' }}>{l}</span>
                      <span style={{ fontWeight: 600, color: '#166534' }}>{v}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            ) : (
              <>
                {/* Date filter */}
                <div style={{ gridColumn: '1 / -1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                  <label className="label" style={{ marginBottom: '0.375rem', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>
                    Step 1 — Date of Purchase
                  </label>
                  <input className="input" type="date" value={purchaseDate}
                    onChange={async e => {
                      const d = e.target.value; setPurchaseDate(d)
                      setForm(f => ({ ...empty, return_date: f.return_date }))
                      setSelectedSale(null); setLineRemaining({})
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

                {/* Sale-level info once a sale is picked */}
                {selectedSale && (
                  <div style={{ gridColumn: '1 / -1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem' }}>
                      <div><span style={{ color: '#64748b' }}>Customer: </span><strong>{form._customer}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Sale Date: </span><strong>{formatDate(form._sale_date)}</strong></div>
                    </div>
                  </div>
                )}

                {/* Step 3 — pick which product line to return (only when there's a real choice) */}
                {selectedSale && saleLines(selectedSale).length > 1 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="label">Step 3 — Select Product to Return *</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {saleLines(selectedSale).map(line => {
                        const info = lineRemaining[lineKey(line)] || { sold: line.quantity, returned: 0, remaining: line.quantity }
                        const isSelected = form.sales_detail_id
                          ? String(line.detail_id) === form.sales_detail_id
                          : (line.detail_id == null && String(line.product_id) === form.product_id)
                        return (
                          <button
                            type="button"
                            key={lineKey(line)}
                            onClick={() => handleDetailSelect(line)}
                            disabled={info.remaining <= 0}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '0.625rem 0.875rem', borderRadius: '0.5rem', textAlign: 'left',
                              cursor: info.remaining <= 0 ? 'not-allowed' : 'pointer',
                              background: isSelected ? '#f0fdf4' : '#fff',
                              border: `1px solid ${isSelected ? '#86efac' : '#e2e8f0'}`,
                              opacity: info.remaining <= 0 ? 0.5 : 1,
                            }}
                          >
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{line.product?.product_name || `#${line.product_id}`}</span>
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                              Sold {info.sold} · Returned {info.returned} · Remaining <strong style={{ color: info.remaining > 0 ? '#16a34a' : '#dc2626' }}>{info.remaining}</strong>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Chosen line's detail once picked */}
                {form.product_id && (
                  <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Selected Line</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', fontSize: '0.8125rem' }}>
                      {[['Product', form._product_name], ['Qty Sold', form._sold_qty], ['Already Returned', String(form._already_returned)], ['Remaining Returnable', form._max_qty]].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', gap: '0.5rem' }}>
                          <span style={{ color: '#64748b', minWidth: '110px' }}>{l}</span>
                          <span style={{ fontWeight: 600, color: '#166534' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="label">Return Date *</label>
              <input className="input" type="date" required value={form.return_date}
                onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Return Quantity *</label>
              <input className="input" type="number" required min="1" step="1"
                max={!editing && form._max_qty !== '' ? form._max_qty : undefined}
                value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              {!editing && form._max_qty !== '' && (
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  Already returned: {form._already_returned} · Remaining returnable: {form._max_qty}
                </p>
              )}
            </div>
            {(editing || form.return_type !== 'Broken Parts') && (
              <div>
                <label className="label">Condition *</label>
                <select className="input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                  {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Return to Warehouse {form.return_type !== 'Product Replacement' ? '*' : ''}</label>
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
              <select className="input" value={form.return_reason}
                onChange={e => {
                  const reason = e.target.value
                  setForm(f => ({
                    ...f,
                    return_reason: reason,
                    return_type: reason === 'Broken Parts' ? 'Broken Parts' : (f.return_type === 'Broken Parts' ? 'Product Replacement' : f.return_type),
                  }))
                }}>
                <option value="">Select reason...</option>
                {REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            {!editing && form.return_reason !== 'Broken Parts' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Resolution *</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {RETURN_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, return_type: t }))}
                      style={{
                        flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem',
                        background: form.return_type === t ? '#eff6ff' : '#fff',
                        border: `1px solid ${form.return_type === t ? '#93c5fd' : '#e2e8f0'}`,
                        color: form.return_type === t ? '#1d4ed8' : '#64748b',
                      }}>{t === 'Product Replacement' ? 'Product Replacement (same product)' : 'Exchange to Another Product'}</button>
                  ))}
                </div>
              </div>
            )}

            {!editing && form.return_type === 'Broken Parts' && (
              <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '0.875rem 1rem', display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1', fontSize: '0.7rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Broken Parts Replacement — takes 1 spare unit's part from stock (Available −qty, Incomplete +qty)
                </div>
                <div>
                  <label className="label">Replacement Part *</label>
                  <input className="input" placeholder="e.g. Upper Lid" value={form.part_name}
                    onChange={e => setForm(f => ({ ...f, part_name: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Quantity *</label>
                  <input className="input" type="number" min="1" step="1" value={form.part_quantity}
                    onChange={e => setForm(f => ({ ...f, part_quantity: e.target.value }))} required />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="label">Remarks</label>
                  <textarea className="input" rows={2} value={form.part_remarks}
                    onChange={e => setForm(f => ({ ...f, part_remarks: e.target.value }))} />
                </div>
              </div>
            )}

            {!editing && form.return_type === 'Exchange' && (
              <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Exchange To
                </div>
                <SearchableSelect
                  endpoint="/products"
                  labelField="product_name"
                  valueField="product_id"
                  params={form.warehouse_id ? { status: 'Active', in_stock_only: true, warehouse_id: form.warehouse_id } : { status: 'Active' }}
                  value={form.exchange_product_id}
                  onChange={(v, opt) => setForm(f => ({
                    ...f,
                    exchange_product_id: v,
                    _exchange_product_name: opt?.product_name || '',
                    _new_price: opt?.sale_price || 0,
                  }))}
                  placeholder={form.warehouse_id ? 'Select exchange product...' : 'Select Return to Warehouse first'}
                  disabled={!form.warehouse_id}
                  emptyHint="No products with available stock in this warehouse"
                />
                {form.exchange_product_id && (
                  <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <div><div style={{ color: '#64748b', fontSize: '0.7rem' }}>Original Product Value</div><strong>{formatCurrency(form._old_price)}</strong></div>
                    <div><div style={{ color: '#64748b', fontSize: '0.7rem' }}>New Product Value</div><strong>{formatCurrency(form._new_price)}</strong></div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Amount Due</div>
                      <strong style={{ color: form._new_price < form._old_price ? '#dc2626' : '#166534' }}>
                        {formatCurrency(Math.max(0, form._new_price - form._old_price))}
                      </strong>
                    </div>
                  </div>
                )}
                {form.exchange_product_id && form._new_price < form._old_price && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                    TKU does not offer cash refunds — please choose a product priced at or above the original ({formatCurrency(form._old_price)}).
                  </div>
                )}
              </div>
            )}

            {editing && (editing.return_type === 'Broken Parts' || editing.return_type === 'Exchange') && (
              <div style={{ gridColumn: '1 / -1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  {editing.return_type} Details
                </div>
                {editing.return_type === 'Broken Parts' && (
                  <div style={{ fontSize: '0.8125rem' }}>
                    Replacement Part: <strong>{form.part_name}</strong> · Quantity: <strong>{form.part_quantity}</strong>
                  </div>
                )}
                {editing.return_type === 'Exchange' && (
                  <>
                    <div style={{ fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      Exchanged to <strong>{form._exchange_product_name}</strong> — Original {formatCurrency(form._old_price)} → New {formatCurrency(form._new_price)}
                      {' · Amount Due '}<strong>{formatCurrency(Math.max(0, form._new_price - form._old_price))}</strong>
                    </div>
                    <label className="label">Payment Status</label>
                    <select className="input" style={{ maxWidth: '10rem' }}
                      value={editing.exchange?.payment_status || 'Unpaid'}
                      onChange={async e => {
                        try {
                          await salesReturnsAPI.update(editing.return_id, { exchange_payment_status: e.target.value })
                          load()
                        } catch (err) {
                          setError(err.response?.data?.detail || 'Failed to update payment status.')
                        }
                      }}>
                      <option value="Unpaid">Unpaid</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </>
                )}
              </div>
            )}

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
