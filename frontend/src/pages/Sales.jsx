import { useState, useEffect, useCallback, useRef } from 'react'
import { salesAPI, productsAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import InvoiceModal from '../components/InvoiceModal'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatCurrency, paymentStatusBadge } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

// ── Constants ────────────────────────────────────────────────────────────────
const VAT_RATE       = 0.11
const UNITS          = ['PCS', 'Pack', 'Unit', 'Box', 'Set', 'Kg', 'Liter']
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'EDC']
const PAYMENT_STATUSES = ['Paid', 'Unpaid']
const DEFAULT_STATUS = { Cash: 'Paid', 'Bank Transfer': 'Unpaid', EDC: 'Unpaid' }

// ── Per-line VAT calculation (mirrors backend _compute_line) ─────────────────
function calcLine(unitPrice, qty, discPct) {
  const price   = parseFloat(unitPrice) || 0
  const q       = parseFloat(qty)       || 0
  const disc    = Math.min(100, Math.max(0, parseFloat(discPct) || 0))
  const basic   = price / (1 + VAT_RATE)
  const basicSub = q * basic
  const discAmt = basicSub * disc / 100
  const discBase = basicSub - discAmt
  const vatAmt  = discBase * VAT_RATE
  const total   = discBase + vatAmt
  return { price, qty: q, disc, basicSub, discAmt, discBase, vatAmt, total }
}

// ── Empty line factory ────────────────────────────────────────────────────────
const emptyLine = () => ({
  _key:        Math.random().toString(36).slice(2),
  product_id:  '',
  product_name:'',
  unit_price:  '',
  quantity:    '1',
  unit:        'PCS',
  discount_pct:'0',
  available:   null,   // loaded from /products/{id}/available-stock
})

// ── Empty form factory ────────────────────────────────────────────────────────
const emptyForm = () => ({
  sales_date:        new Date().toISOString().slice(0, 10),
  store_id:          '',
  warehouse_id:      '',
  customer_name:     '',
  payment_method:    'Cash',
  payment_status:    'Paid',
  remarks:           '',
  bank_account_id:   '',
  transfer_reference:'',
  edc_receipt_number:'',
  edc_special_code:  '',
  lines:             [emptyLine()],
})

// ── Cart line row ─────────────────────────────────────────────────────────────
function CartLine({ line, idx, warehouseId, onUpdate, onRemove, canRemove }) {
  const c = calcLine(line.unit_price, line.quantity, line.discount_pct)
  const hasProduct = !!line.product_id
  const stockOk = line.available === null || c.qty <= line.available

  const setField = (f, v) => onUpdate(idx, { [f]: v })

  const handleProductSelect = async (opt) => {
    const updates = {
      product_id:   String(opt.product_id),
      product_name: opt.product_name || '',
      unit_price:   String(opt.sale_price || ''),
      unit:         opt.unit || 'PCS',
      // Use available_stock from the product list response as an immediate hint
      available:    opt.available_stock != null ? opt.available_stock : null,
    }
    onUpdate(idx, updates)

    // Fetch fresh available stock for accuracy (stock may have changed since dropdown loaded)
    if (opt.product_id && warehouseId) {
      try {
        const res = await productsAPI.getAvailableStock(opt.product_id, { warehouse_id: warehouseId })
        const byWh = res.data.by_warehouse || []
        const wh   = byWh.find(w => String(w.warehouse_id) === String(warehouseId))
        onUpdate(idx, { available: wh ? wh.available : res.data.total_available })
      } catch {
        // ignore — backend stock check is the authoritative gate
      }
    }
  }

  return (
    <tr style={{ verticalAlign: 'top' }}>
      {/* Product */}
      <td style={{ padding: '0.5rem 0.5rem 0.5rem 0', minWidth: '200px' }}>
        <AsyncDropdown
          endpoint="/products"
          labelField="product_name"
          valueField="product_id"
          params={{
            status: 'Active',
            in_stock_only: true,
            ...(warehouseId ? { warehouse_id: warehouseId } : {}),
          }}
          formatLabel={opt =>
            opt.available_stock != null
              ? `${opt.product_name} (${opt.available_stock} available)`
              : opt.product_name
          }
          value={line.product_id}
          onChange={v => setField('product_id', v)}
          onSelect={handleProductSelect}
          placeholder="Select product…"
          emptyHint={warehouseId ? 'No products with available stock in this warehouse' : 'No products with available stock'}
          required
        />
        {line.available !== null && (
          <div style={{ fontSize: '0.7rem', marginTop: '0.2rem', color: stockOk ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {stockOk
              ? `Available: ${line.available} pcs`
              : `⚠ Only ${line.available} available`}
          </div>
        )}
      </td>

      {/* Qty */}
      <td style={{ padding: '0.5rem 0.375rem', width: '90px' }}>
        <input
          className="input"
          type="number"
          min="0.01"
          step="0.01"
          value={line.quantity}
          onChange={e => setField('quantity', e.target.value)}
          style={{ textAlign: 'right', borderColor: (!stockOk && hasProduct) ? '#ef4444' : undefined }}
          required
        />
        {hasProduct && line.available !== null && !stockOk && (
          <div style={{ fontSize: '0.68rem', color: '#dc2626', marginTop: '0.15rem', textAlign: 'right' }}>
            Max: {line.available}
          </div>
        )}
      </td>

      {/* Unit */}
      <td style={{ padding: '0.5rem 0.375rem', width: '80px' }}>
        <select className="input" value={line.unit} onChange={e => setField('unit', e.target.value)}>
          {UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
      </td>

      {/* Unit Price */}
      <td style={{ padding: '0.5rem 0.375rem', width: '130px' }}>
        <input
          className="input"
          type="number"
          min="0"
          step="100"
          value={line.unit_price}
          onChange={e => setField('unit_price', e.target.value)}
          style={{ textAlign: 'right' }}
          required
        />
        {hasProduct && c.price > 0 && (
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem', textAlign: 'right' }}>
            Incl. VAT 11%
          </div>
        )}
      </td>

      {/* Disc% */}
      <td style={{ padding: '0.5rem 0.375rem', width: '75px' }}>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={line.discount_pct}
            onChange={e => setField('discount_pct', e.target.value)}
            style={{ textAlign: 'right', paddingRight: '1.5rem' }}
          />
          <span style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#94a3b8', pointerEvents: 'none' }}>%</span>
        </div>
      </td>

      {/* Line Total */}
      <td style={{ padding: '0.5rem 0.375rem', textAlign: 'right', width: '120px', fontWeight: 700, color: '#1e3a5f', whiteSpace: 'nowrap' }}>
        {hasProduct && c.total > 0 ? formatCurrency(c.total) : '—'}
        {hasProduct && c.discAmt > 0 && (
          <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 400 }}>
            disc −{formatCurrency(c.discAmt)}
          </div>
        )}
      </td>

      {/* Remove */}
      <td style={{ padding: '0.5rem 0 0.5rem 0.375rem', width: '36px', textAlign: 'center' }}>
        {canRemove && (
          <button
            type="button"
            title="Remove line"
            onClick={() => onRemove(idx)}
            style={{ background: '#fee2e2', border: 'none', color: '#dc2626', borderRadius: '4px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}
          >×</button>
        )}
      </td>
    </tr>
  )
}

// ── Order summary panel ───────────────────────────────────────────────────────
function OrderSummary({ lines }) {
  const totals = lines.reduce(
    (acc, line) => {
      const c = calcLine(line.unit_price, line.quantity, line.discount_pct)
      if (!line.product_id || !c.price) return acc
      acc.subtotal  += c.price * c.qty
      acc.discAmt   += c.discAmt
      acc.vatAmt    += c.vatAmt
      acc.grandTotal+= c.total
      return acc
    },
    { subtotal: 0, discAmt: 0, vatAmt: 0, grandTotal: 0 },
  )

  const Row = ({ label, value, bold, color, small }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', color: color || '#374151' }}>
      <span style={{ fontSize: small ? '0.72rem' : '0.8125rem' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, fontSize: small ? '0.72rem' : '0.8125rem' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order Summary</div>
        <Row label="Subtotal (Incl. VAT)" value={formatCurrency(totals.subtotal)} />
        {totals.discAmt > 0 && (
          <Row label="Total Discount" value={`− ${formatCurrency(totals.discAmt)}`} color="#dc2626" />
        )}
        <Row label="VAT 11% (extracted)" value={formatCurrency(totals.vatAmt)} color="#059669" small />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.875rem 1rem', background: '#1e3a5f', color: 'white' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Grand Total</span>
        <span style={{ fontWeight: 800, fontSize: '1.125rem' }}>{formatCurrency(totals.grandTotal)}</span>
      </div>
      {totals.grandTotal > 0 && (
        <div style={{ padding: '0.4rem 1rem', fontSize: '0.68rem', color: '#1e40af', background: '#eff6ff', borderTop: '1px solid #bfdbfe' }}>
          VAT 11% included in price — Grand Total = Discounted Base + VAT
        </div>
      )}
    </div>
  )
}

// ── Bank account info display ─────────────────────────────────────────────────
function BankInfo({ bankAccount }) {
  if (!bankAccount) return null
  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803d', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Transfer Payment Instructions</div>
      {[['Bank Name', bankAccount.bank_name], ['Account Number', bankAccount.account_number], ['Beneficiary', bankAccount.beneficiary_name]].map(([l, v]) => (
        <div key={l} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8125rem', marginBottom: '0.2rem' }}>
          <span style={{ color: '#64748b', minWidth: '120px' }}>{l}</span>
          <span style={{ fontWeight: 600, color: '#166534' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Sales() {
  const [items, setItems]               = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [storeFilter, setStoreFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [modal, setModal]               = useState(false)
  const [editing, setEditing]           = useState(null)
  const [form, setForm]                 = useState(emptyForm())
  const [deleteId, setDeleteId]         = useState(null)
  const [saveLoading, setSaveLoading]   = useState(false)
  const [error, setError]               = useState('')
  const [selectedBank, setSelectedBank] = useState(null)
  const [previewSale, setPreviewSale]   = useState(null)
  const limit = 20

  const load = useCallback(async () => {
    const params = { page, limit }
    if (storeFilter)  params.store_id       = storeFilter
    if (statusFilter) params.payment_status = statusFilter
    if (methodFilter) params.payment_method = methodFilter
    const res = await salesAPI.list(params)
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, storeFilter, statusFilter, methodFilter])

  useEffect(() => { load() }, [load])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const setHeader = (f, v) => setForm(prev => ({ ...prev, [f]: v }))

  // When warehouse changes, stale available-stock values on lines become wrong.
  // Clear them so the dropdown (which will refetch) and the stock indicator reset.
  const handleWarehouseChange = (v) => setForm(prev => ({
    ...prev,
    warehouse_id: v,
    lines: prev.lines.map(l => ({ ...l, available: null })),
  }))

  const setLine = (idx, updates) =>
    setForm(prev => {
      const lines = [...prev.lines]
      lines[idx] = { ...lines[idx], ...updates }
      return { ...prev, lines }
    })

  const addLine = () =>
    setForm(prev => ({ ...prev, lines: [...prev.lines, emptyLine()] }))

  const removeLine = (idx) =>
    setForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }))

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setSelectedBank(null)
    setError('')
    setModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    // Build lines from details (new) or legacy single-item (old)
    let lines
    if (item.details && item.details.length > 0) {
      lines = item.details.map(d => ({
        _key:        Math.random().toString(36).slice(2),
        product_id:  String(d.product_id),
        product_name: d.product?.product_name || '',
        unit_price:  String(d.unit_price),
        quantity:    String(d.quantity),
        unit:        d.unit,
        discount_pct:String(d.discount_pct),
        available:   null,
      }))
    } else if (item.product_id) {
      lines = [{
        _key:        Math.random().toString(36).slice(2),
        product_id:  String(item.product_id),
        product_name:item.product?.product_name || '',
        unit_price:  String(item.sale_price || 0),
        quantity:    String(item.quantity || 1),
        unit:        item.unit || 'PCS',
        discount_pct:String(item.discount_pct || 0),
        available:   null,
      }]
    } else {
      lines = [emptyLine()]
    }
    setForm({
      sales_date:         item.sales_date,
      store_id:           String(item.store_id || ''),
      warehouse_id:       String(item.warehouse_id || ''),
      customer_name:      item.customer_name || '',
      payment_method:     item.payment_method,
      payment_status:     item.payment_status,
      remarks:            item.remarks || '',
      bank_account_id:    item.bank_account_id ? String(item.bank_account_id) : '',
      transfer_reference: item.transfer_reference || '',
      edc_receipt_number: item.edc_receipt_number || '',
      edc_special_code:   item.edc_special_code || '',
      lines,
    })
    setSelectedBank(item.bank_account || null)
    setError('')
    setModal(true)
  }

  const openInvoice = async (saleId) => {
    const res = await salesAPI.get(saleId)
    setPreviewSale(res.data)
  }

  // ── Validate and submit ────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    setError('')

    // Validate lines
    const validLines = form.lines.filter(l => l.product_id && parseFloat(l.unit_price) > 0)
    if (validLines.length === 0) {
      setError('Add at least one product with a price before saving.')
      return
    }
    // Duplicate product check
    const productIds = validLines.map(l => l.product_id)
    if (new Set(productIds).size !== productIds.length) {
      setError('Duplicate product found. Merge quantities into one line.')
      return
    }
    // Stock check (frontend soft-validation; backend is authoritative)
    const stockViolation = validLines.find(l => l.available !== null && parseFloat(l.quantity) > l.available)
    if (stockViolation) {
      setError(`Insufficient stock for "${stockViolation.product_name}". Available: ${stockViolation.available} pcs.`)
      return
    }

    const details = validLines.map(l => ({
      product_id:  parseInt(l.product_id),
      quantity:    parseFloat(l.quantity),
      unit:        l.unit,
      unit_price:  parseFloat(l.unit_price),
      discount_pct: parseFloat(l.discount_pct) || 0,
    }))

    const payload = {
      sales_date:         form.sales_date,
      store_id:           form.store_id           ? parseInt(form.store_id)           : null,
      warehouse_id:       form.warehouse_id        ? parseInt(form.warehouse_id)       : null,
      customer_name:      form.customer_name       || null,
      payment_method:     form.payment_method,
      payment_status:     form.payment_status,
      remarks:            form.remarks             || null,
      bank_account_id:    form.payment_method === 'Bank Transfer' && form.bank_account_id
                            ? parseInt(form.bank_account_id) : null,
      transfer_reference: form.transfer_reference  || null,
      edc_receipt_number: form.payment_method === 'EDC' ? (form.edc_receipt_number || null) : null,
      edc_special_code:   form.payment_method === 'EDC' ? (form.edc_special_code   || null) : null,
      details,
    }

    setSaveLoading(true)
    try {
      if (editing) await salesAPI.update(editing.sales_id, payload)
      else         await salesAPI.create(payload)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save sale. Please try again.')
    } finally {
      setSaveLoading(false)
    }
  }

  // ── Grand total for the table list view ───────────────────────────────────
  const saleGrandTotal = (item) => {
    if (item.grand_total) return item.grand_total
    if (item.details && item.details.length > 0)
      return item.details.reduce((s, d) => s + (d.line_total || 0), 0)
    return 0
  }

  const saleProducts = (item) => {
    if (item.details && item.details.length > 0)
      return item.details.map(d => d.product?.product_name || `#${d.product_id}`).join(', ')
    return item.product?.product_name || '—'
  }

  const isBankTransfer = form.payment_method === 'Bank Transfer'
  const isEDC          = form.payment_method === 'EDC'

  // Reactive stock violation flag — disables Save button immediately when any line exceeds available stock
  const hasStockViolation = form.lines.some(
    l => l.product_id && l.available !== null && parseFloat(l.quantity) > l.available
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Sales</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Multi-item sales · VAT 11% included in all prices</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(s => ({
              date:     s.sales_date,
              store:    s.store?.store_name || '',
              customer: s.customer_name || '',
              products: saleProducts(s),
              grand_total: saleGrandTotal(s),
              method:   s.payment_method,
              status:   s.payment_status,
              remarks:  s.remarks || '',
            }))
            exportCsv(rows, ['date','store','customer','products','grand_total','method','status','remarks'],
              { date:'Date', store:'Store', customer:'Customer', products:'Products', grand_total:'Grand Total', method:'Method', status:'Status', remarks:'Remarks' },
              'sales-export')
          }}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Sale</button>
        </div>
      </div>

      {/* List table */}
      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '12rem' }}>
            <AsyncDropdown endpoint="/stores" labelField="store_name" valueField="store_id"
              value={storeFilter} onChange={v => { setStoreFilter(v); setPage(1) }} placeholder="All Stores" />
          </div>
          <select className="input" style={{ width: 'auto' }} value={methodFilter} onChange={e => { setMethodFilter(e.target.value); setPage(1) }}>
            <option value="">All Payment Methods</option>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Store</th><th>Customer</th>
                <th>Products</th><th>Grand Total</th>
                <th>Method</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No sales records</td></tr>
                : items.map((item, i) => (
                  <tr key={item.sales_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td>{formatDate(item.sales_date)}</td>
                    <td>{item.store?.store_name || '—'}</td>
                    <td>{item.customer_name || <span style={{ color: '#94a3b8' }}>Walk-in</span>}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {saleProducts(item)}
                      {item.details?.length > 1 && <span className="badge badge-blue" style={{ marginLeft: '0.375rem' }}>{item.details.length} items</span>}
                    </td>
                    <td style={{ fontWeight: 700, color: '#16a34a' }}>{formatCurrency(saleGrandTotal(item))}</td>
                    <td><span className="badge badge-blue">{item.payment_method}</span></td>
                    <td>
                      <button
                        onClick={async () => {
                          const next = item.payment_status === 'Paid' ? 'Unpaid' : 'Paid'
                          if (!window.confirm(`Change payment status to ${next.toUpperCase()}?`)) return
                          try { await salesAPI.togglePaymentStatus(item.sales_id); load() }
                          catch { alert('Failed to update payment status.') }
                        }}
                        style={{
                          padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.72rem',
                          fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: item.payment_status === 'Paid' ? '#dcfce7' : '#fef3c7',
                          color:      item.payment_status === 'Paid' ? '#16a34a' : '#d97706',
                        }}
                      >{item.payment_status}</button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openInvoice(item.sales_id)}>PDF</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.sales_id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* ── New / Edit Sale Modal ───────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Sale' : 'New Sale'} size="xl">
        <form onSubmit={handleSave}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {/* ── Header fields ───────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label className="label">Sales Date *</label>
              <input className="input" type="date" required value={form.sales_date} onChange={e => setHeader('sales_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Store</label>
              <AsyncDropdown endpoint="/stores" labelField="store_name" valueField="store_id"
                value={form.store_id} onChange={v => setHeader('store_id', v)} placeholder="Select store" />
            </div>
            <div>
              <label className="label">Warehouse (for stock deduction)</label>
              <AsyncDropdown endpoint="/warehouses" labelField="warehouse_name" valueField="warehouse_id"
                value={form.warehouse_id} onChange={handleWarehouseChange} placeholder="Select warehouse" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Customer Name</label>
              <input className="input" placeholder="Walk-in Customer" value={form.customer_name} onChange={e => setHeader('customer_name', e.target.value)} />
            </div>
          </div>

          {/* ── Cart line items ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#374151', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Products</span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>
                {form.lines.filter(l => l.product_id).length} item(s) in cart
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '0.5rem 0.5rem 0.5rem 0', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>Product</th>
                    <th style={{ padding: '0.5rem 0.375rem', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>Qty</th>
                    <th style={{ padding: '0.5rem 0.375rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>Unit</th>
                    <th style={{ padding: '0.5rem 0.375rem', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>Unit Price</th>
                    <th style={{ padding: '0.5rem 0.375rem', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>Disc%</th>
                    <th style={{ padding: '0.5rem 0.375rem', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>Line Total</th>
                    <th style={{ width: '36px' }} />
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, idx) => (
                    <CartLine
                      key={line._key}
                      line={line}
                      idx={idx}
                      warehouseId={form.warehouse_id}
                      onUpdate={setLine}
                      onRemove={removeLine}
                      canRemove={form.lines.length > 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-secondary" style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }} onClick={addLine}>
              + Add Product
            </button>
          </div>

          {/* ── Order summary ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1rem' }}>
            <OrderSummary lines={form.lines} />
          </div>

          {/* ── Payment ─────────────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="label">Payment Method *</label>
              <select className="input" value={form.payment_method} onChange={e => {
                const m = e.target.value
                setForm(f => ({ ...f, payment_method: m, payment_status: DEFAULT_STATUS[m] || 'Unpaid', bank_account_id: '', transfer_reference: '' }))
                setSelectedBank(null)
              }}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Payment Status</label>
              <select className="input" value={form.payment_status} onChange={e => setHeader('payment_status', e.target.value)}>
                {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {isBankTransfer && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Bank Account *</label>
                <AsyncDropdown endpoint="/bank-accounts" labelField="bank_name" valueField="bank_id"
                  params={{ active_only: true }}
                  value={form.bank_account_id}
                  onChange={v => setHeader('bank_account_id', v)}
                  onSelect={opt => setSelectedBank(opt)}
                  placeholder="Select bank account…" />
                <BankInfo bankAccount={selectedBank} />
                <div style={{ marginTop: '0.5rem' }}>
                  <label className="label">Transfer Reference (optional)</label>
                  <input className="input" placeholder="e.g. TRF-20240101-001" value={form.transfer_reference} onChange={e => setHeader('transfer_reference', e.target.value)} />
                </div>
              </div>
            )}

            {isEDC && (
              <>
                <div>
                  <label className="label">EDC Receipt Number</label>
                  <input className="input" value={form.edc_receipt_number} onChange={e => setHeader('edc_receipt_number', e.target.value)} />
                </div>
                <div>
                  <label className="label">EDC Special Code</label>
                  <input className="input" value={form.edc_special_code} onChange={e => setHeader('edc_special_code', e.target.value)} />
                </div>
              </>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Remarks</label>
              <textarea className="input" rows={2} value={form.remarks} onChange={e => setHeader('remarks', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saveLoading || hasStockViolation}
              title={hasStockViolation ? 'Fix stock violations before saving' : undefined}
            >
              {saveLoading ? 'Saving…' : editing ? 'Update Sale' : 'Save Sale'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Invoice Preview */}
      <InvoiceModal open={!!previewSale} onClose={() => setPreviewSale(null)} sale={previewSale} />

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await salesAPI.delete(deleteId); load() }} />
    </div>
  )
}
