import { useState, useEffect, useCallback } from 'react'
import { salesAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import InvoiceModal from '../components/InvoiceModal'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatCurrency, paymentStatusBadge } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

// ── Constants ────────────────────────────────────────────────────────────────
const VAT_RATE = 0.11
const UNITS = ['PCS', 'Pack', 'Unit', 'Box', 'Set', 'Kg', 'Liter']
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'EDC']
const PAYMENT_STATUSES = ['Paid', 'Unpaid']

const DEFAULT_STATUS = { Cash: 'Paid', 'Bank Transfer': 'Unpaid', EDC: 'Unpaid' }

const emptyForm = {
  sales_date: new Date().toISOString().slice(0, 10),
  store_id: '', warehouse_id: '', customer_name: '',
  product_id: '', quantity: '1', unit: 'PCS',
  sale_price: '',
  discount_pct: '0',
  payment_method: 'Cash', payment_status: 'Paid', remarks: '',
  bank_account_id: '', transfer_reference: '',
  edc_receipt_number: '', edc_special_code: '',
}

// ── Calculation helpers ──────────────────────────────────────────────────────
// Correct VAT calculation per Indonesian invoicing:
//   1. Strip VAT from unit price → basic price (excl. VAT)
//   2. Apply discount on the basic price subtotal
//   3. Re-apply 11% VAT on discounted basic subtotal → grand total
const calc = (form) => {
  const qty = parseFloat(form.quantity) || 0
  const price = parseFloat(form.sale_price) || 0
  const discPct = Math.min(100, Math.max(0, parseFloat(form.discount_pct) || 0))

  const basicUnitPrice = price / (1 + VAT_RATE)          // unit price excl. VAT
  const subtotal = qty * price                             // VAT-incl, no discount (display)
  const subtotalBasic = qty * basicUnitPrice               // VAT-excl, no discount
  const discountAmount = subtotalBasic * discPct / 100    // discount on basic price
  const discountedBase = subtotalBasic - discountAmount    // basic price after discount
  const vatAmount = discountedBase * VAT_RATE             // 11% VAT on discounted base
  const grandTotal = discountedBase + vatAmount            // final amount

  return { qty, price, discPct, basicUnitPrice, subtotal, subtotalBasic, discountAmount, discountedBase, vatAmount, grandTotal }
}

// ── Calculation Panel ────────────────────────────────────────────────────────
function CalcPanel({ form }) {
  const { qty, price, discPct, basicUnitPrice, subtotal, subtotalBasic, discountAmount, discountedBase, vatAmount, grandTotal } = calc(form)
  const hasProduct = price > 0

  const Row = ({ label, value, bold, color, small }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', color: color || '#374151' }}>
      <span style={{ fontSize: small ? '0.75rem' : '0.8125rem' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, fontSize: small ? '0.75rem' : '0.8125rem' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', overflow: 'hidden', fontSize: '0.8125rem' }}>

      {/* Unit price breakdown */}
      {hasProduct && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#eff6ff' }}>
          <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Unit Price Breakdown
          </div>
          <Row label="Selling Price (Incl. VAT 11%)" value={formatCurrency(price)} bold />
          <Row label="Basic Price (Excl. VAT)" value={formatCurrency(basicUnitPrice)} color="#64748b" small />
          <Row label={`VAT Component (11%)`} value={formatCurrency(price - basicUnitPrice)} color="#64748b" small />
        </div>
      )}

      {/* Transaction calculation */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Transaction Summary
        </div>
        <Row label={`Qty × Basic Price (${qty} × ${formatCurrency(basicUnitPrice)})`} value={formatCurrency(subtotalBasic)} />
        {discPct > 0 && (
          <Row label={`Discount (${discPct}%)`} value={`− ${formatCurrency(discountAmount)}`} color="#dc2626" />
        )}
        {discPct > 0 && (
          <Row label="Discounted Price" value={formatCurrency(discountedBase)} bold />
        )}
        <Row label="VAT 11%" value={`+ ${formatCurrency(vatAmount)}`} color="#059669" />
      </div>

      {/* Grand total bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.875rem 1rem', background: '#1e3a5f', color: 'white' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Grand Total</span>
        <span style={{ fontWeight: 800, fontSize: '1.125rem' }}>{formatCurrency(grandTotal)}</span>
      </div>

      {grandTotal > 0 && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.72rem', color: '#1e40af', background: '#eff6ff', borderTop: '1px solid #bfdbfe' }}>
          Grand Total = Discounted Basic Price + VAT 11%
        </div>
      )}
    </div>
  )
}

// ── Bank Account Info display ────────────────────────────────────────────────
function BankInfo({ bankAccount }) {
  if (!bankAccount) return null
  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.875rem 1rem', marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transfer Payment Instructions</div>
      {[
        ['Bank Name', bankAccount.bank_name],
        ['Account Number', bankAccount.account_number],
        ['Beneficiary Name', bankAccount.beneficiary_name],
      ].map(([l, v]) => (
        <div key={l} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
          <span style={{ color: '#64748b', minWidth: '140px' }}>{l}</span>
          <span style={{ fontWeight: 600, color: '#166534' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Sales page ──────────────────────────────────────────────────────────
export default function Sales() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [storeFilter, setStoreFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState('')
  // For bank account display in form
  const [selectedBank, setSelectedBank] = useState(null)
  // Invoice preview
  const [previewSale, setPreviewSale] = useState(null)
  const limit = 20

  const load = useCallback(async () => {
    const params = { page, limit }
    if (storeFilter) params.store_id = storeFilter
    if (paymentStatusFilter) params.payment_status = paymentStatusFilter
    if (paymentMethodFilter) params.payment_method = paymentMethodFilter
    const res = await salesAPI.list(params)
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, storeFilter, paymentStatusFilter, paymentMethodFilter])

  useEffect(() => { load() }, [load])

  // Fetch full sale record for invoice preview
  const openInvoice = async (saleId) => {
    const res = await salesAPI.get(saleId)
    setPreviewSale(res.data)
  }

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSelectedBank(null)
    setError('')
    setModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      sales_date: item.sales_date,
      store_id: String(item.store_id || ''),
      warehouse_id: String(item.warehouse_id || ''),
      customer_name: item.customer_name || '',
      product_id: String(item.product_id),
      quantity: String(item.quantity),
      unit: item.unit,
      sale_price: String(item.sale_price),
      discount_pct: String(item.discount_pct || 0),
      payment_method: item.payment_method,
      payment_status: item.payment_status,
      remarks: item.remarks || '',
      bank_account_id: item.bank_account_id ? String(item.bank_account_id) : '',
      transfer_reference: item.transfer_reference || '',
      edc_receipt_number: item.edc_receipt_number || '',
      edc_special_code: item.edc_special_code || '',
    })
    setSelectedBank(item.bank_account || null)
    setError('')
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    const discPct = parseFloat(form.discount_pct) || 0
    if (discPct < 0 || discPct > 100) { setError('Discount must be between 0 and 100%'); return }

    const { subtotal, discountAmount, grandTotal, vatAmount } = calc(form)
    // Backend will recompute these — sending them lets server validate consistency

    setSaveLoading(true)
    try {
      const data = {
        sales_date: form.sales_date,
        store_id: form.store_id ? parseInt(form.store_id) : null,
        warehouse_id: form.warehouse_id ? parseInt(form.warehouse_id) : null,
        customer_name: form.customer_name || null,
        product_id: parseInt(form.product_id),
        quantity: parseFloat(form.quantity),
        unit: form.unit,
        sale_price: parseFloat(form.sale_price),
        discount_pct: discPct,
        discount_amount: discountAmount,
        vat_amount: vatAmount,
        subtotal,
        grand_total: grandTotal,
        payment_method: form.payment_method,
        payment_status: form.payment_status,
        remarks: form.remarks || null,
        bank_account_id: form.payment_method === 'Bank Transfer' && form.bank_account_id ? parseInt(form.bank_account_id) : null,
        transfer_reference: form.transfer_reference || null,
        edc_receipt_number: form.payment_method === 'EDC' ? (form.edc_receipt_number || null) : null,
        edc_special_code: form.payment_method === 'EDC' ? (form.edc_special_code || null) : null,
      }
      if (editing) await salesAPI.update(editing.sales_id, data)
      else await salesAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally { setSaveLoading(false) }
  }

  const isBankTransfer = form.payment_method === 'Bank Transfer'
  const isEDC = form.payment_method === 'EDC'
  const { discPct: dp } = calc(form)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Sales</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>VAT 11% already included in all product prices</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(s => ({
              date: s.sales_date, store: s.store?.store_name || '', customer: s.customer_name || '',
              product: s.product?.product_name || '', qty: s.quantity, unit: s.unit,
              price: s.sale_price, disc_pct: s.discount_pct, grand_total: s.grand_total,
              vat: s.vat_amount, method: s.payment_method, status: s.payment_status, remarks: s.remarks || ''
            }))
            exportCsv(rows, ['date','store','customer','product','qty','unit','price','disc_pct','grand_total','vat','method','status','remarks'], { date:'Date', store:'Store', customer:'Customer', product:'Product', qty:'Qty', unit:'Unit', price:'Price', disc_pct:'Disc%', grand_total:'Grand Total', vat:'VAT', method:'Method', status:'Status', remarks:'Remarks' }, 'sales-export')
          }}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Sale</button>
        </div>
      </div>

      <div className="card">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: '12rem' }}>
            <AsyncDropdown endpoint="/stores" labelField="store_name" valueField="store_id"
              value={storeFilter} onChange={v => { setStoreFilter(v); setPage(1) }} placeholder="All Stores" />
          </div>
          <select className="input" style={{ width: 'auto' }} value={paymentMethodFilter} onChange={e => { setPaymentMethodFilter(e.target.value); setPage(1) }}>
            <option value="">All Payment Methods</option>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={paymentStatusFilter} onChange={e => { setPaymentStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Store</th><th>Product</th>
                <th>Qty</th><th>Price</th><th>Disc%</th><th>Grand Total</th>
                <th>Method</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No sales records</td></tr>
                : items.map((item, i) => (
                  <tr key={item.sales_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td>{formatDate(item.sales_date)}</td>
                    <td>{item.store?.store_name || '-'}</td>
                    <td style={{ fontWeight: 500 }}>{item.product?.product_name || '-'}</td>
                    <td>{item.quantity} {item.unit}</td>
                    <td>{formatCurrency(item.sale_price)}</td>
                    <td>{item.discount_pct > 0 ? <span className="badge badge-yellow">{item.discount_pct}%</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td style={{ fontWeight: 700, color: '#16a34a' }}>{formatCurrency(item.grand_total)}</td>
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
                          color: item.payment_status === 'Paid' ? '#16a34a' : '#d97706',
                        }}
                        title={`Click to mark as ${item.payment_status === 'Paid' ? 'Unpaid' : 'Paid'}`}
                      >
                        {item.payment_status}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openInvoice(item.sales_id)} title="Preview Invoice">PDF</button>
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

      {/* ── Sale Form Modal ────────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Sale' : 'New Sale'} size="xl">
        <form onSubmit={handleSave}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* Left column — inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Sales Date *</label>
                  <input className="input" type="date" required value={form.sales_date} onChange={e => setField('sales_date', e.target.value)} />
                </div>
                <div>
                  <label className="label">Store</label>
                  <AsyncDropdown endpoint="/stores" labelField="store_name" valueField="store_id"
                    value={form.store_id} onChange={v => setField('store_id', v)}
                    placeholder="Select store" emptyHint="No stores found" />
                </div>
              </div>

              <div>
                <label className="label">Customer Name</label>
                <input className="input" placeholder="Walk-in Customer" value={form.customer_name} onChange={e => setField('customer_name', e.target.value)} />
              </div>

              <div>
                <label className="label">Product *</label>
                <AsyncDropdown endpoint="/products" labelField="product_name" valueField="product_id"
                  params={{ status: 'Active', in_stock_only: true }}
                  value={form.product_id}
                  onChange={v => setField('product_id', v)}
                  onSelect={opt => setForm(f => ({ ...f, product_id: String(opt.product_id), sale_price: String(opt.sale_price || ''), unit: opt.unit || 'PCS' }))}
                  placeholder="Select product..."
                  required
                  emptyHint="No products with available stock — check inventory" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Sale Price (Incl. VAT 11%) *</label>
                  <input className="input" type="number" required min="0" step="100"
                    value={form.sale_price} onChange={e => setField('sale_price', e.target.value)} />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <select className="input" value={form.unit} onChange={e => setField('unit', e.target.value)}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Quantity *</label>
                  <input className="input" type="number" required min="0.01" step="0.01"
                    value={form.quantity} onChange={e => setField('quantity', e.target.value)} />
                </div>
                <div>
                  <label className="label">Discount (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type="number" min="0" max="100" step="0.5"
                      value={form.discount_pct} onChange={e => setField('discount_pct', e.target.value)}
                      style={{ paddingRight: '2rem' }} />
                    <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Warehouse</label>
                <AsyncDropdown endpoint="/warehouses" labelField="warehouse_name" valueField="warehouse_id"
                  value={form.warehouse_id} onChange={v => setField('warehouse_id', v)}
                  placeholder="Select warehouse" emptyHint="No warehouses found" />
              </div>

              {/* Payment section */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.875rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="label">Payment Method *</label>
                    <select className="input" value={form.payment_method}
                      onChange={e => {
                        const m = e.target.value
                        setForm(f => ({ ...f, payment_method: m, payment_status: DEFAULT_STATUS[m] || 'Unpaid', bank_account_id: '', transfer_reference: '' }))
                        setSelectedBank(null)
                      }}>
                      {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Payment Status</label>
                    <select className="input" value={form.payment_status} onChange={e => setField('payment_status', e.target.value)}>
                      {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Bank Transfer */}
                {isBankTransfer && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label className="label">Bank Account *</label>
                    <AsyncDropdown
                      endpoint="/bank-accounts"
                      labelField="bank_name"
                      valueField="bank_id"
                      params={{ active_only: true }}
                      value={form.bank_account_id}
                      onChange={v => setField('bank_account_id', v)}
                      onSelect={opt => setSelectedBank(opt)}
                      placeholder="Select bank account..."
                      emptyHint="No active bank accounts — add in Master Data > Bank Accounts"
                    />
                    <BankInfo bankAccount={selectedBank} />
                    <div style={{ marginTop: '0.75rem' }}>
                      <label className="label">Transfer Reference (optional)</label>
                      <input className="input" placeholder="e.g. TRF-20240101-001" value={form.transfer_reference} onChange={e => setField('transfer_reference', e.target.value)} />
                    </div>
                  </div>
                )}

                {/* EDC */}
                {isEDC && (
                  <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label className="label">EDC Receipt Number</label>
                      <input className="input" value={form.edc_receipt_number} onChange={e => setField('edc_receipt_number', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">EDC Special Code</label>
                      <input className="input" value={form.edc_special_code} onChange={e => setField('edc_special_code', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Remarks</label>
                <textarea className="input" rows={2} value={form.remarks} onChange={e => setField('remarks', e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saveLoading}>{saveLoading ? 'Saving...' : 'Save Sale'}</button>
              </div>
            </div>

            {/* Right column — real-time calculation panel */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Calculation Summary
              </div>
              <CalcPanel form={form} />
              <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: '#94a3b8', lineHeight: '1.6' }}>
                Grand Total = Subtotal − Discount Amount<br />
                VAT 11% is already included in product price.<br />
                No additional tax is charged.
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Invoice Preview Modal */}
      <InvoiceModal open={!!previewSale} onClose={() => setPreviewSale(null)} sale={previewSale} />

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await salesAPI.delete(deleteId); load() }} />
    </div>
  )
}
