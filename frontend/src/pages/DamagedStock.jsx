import { useState, useEffect, useCallback } from 'react'
import { damagedStocksAPI } from '../api'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber, formatCurrency } from '../utils/format'
import { downloadBlob } from '../utils/downloadFile'

const DAMAGE_REASONS = [
  'Broken',
  'Defective',
  'Expired',
  'Packaging Damaged',
  'Water Damage',
  'Customer Return - Defective',
  'Customer Return - Damaged',
  'Opname Variance - Damaged',
  'Other',
]

const SOURCES = ['Manual', 'Customer Return', 'Stock Opname']

const emptyForm = {
  product_id:       '',
  warehouse_id:     '',
  quantity:         '',
  damage_reason:    'Broken',
  damage_date:      new Date().toISOString().slice(0, 10),
  source:           'Manual',
  source_reference: '',
  remarks:          '',
}

export default function DamagedStock() {
  const [items,    setItems]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [modal,    setModal]    = useState(false)
  const [viewing,  setViewing]  = useState(null)
  const [form,     setForm]     = useState(emptyForm)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [filters,  setFilters]  = useState({ source: '' })
  const [exporting, setExporting] = useState(false)
  const [limit, setLimit] = useState(20)

  const buildFilterParams = useCallback(() => {
    const params = {}
    if (filters.source) params.source = filters.source
    return params
  }, [filters])

  const load = useCallback(async () => {
    const res = await damagedStocksAPI.list({ page, limit, ...buildFilterParams() })
    setItems(res.data.items || [])
    setTotal(res.data.total || 0)
  }, [page, limit, buildFilterParams])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setViewing(null); setForm(emptyForm); setError(''); setModal(true) }

  const openView = (item) => {
    setViewing(item)
    setForm({
      product_id:       String(item.product_id),
      warehouse_id:     item.warehouse_id ? String(item.warehouse_id) : '',
      quantity:         String(item.quantity),
      damage_reason:    item.damage_reason,
      damage_date:      item.damage_date,
      source:           item.source || 'Manual',
      source_reference: item.source_reference || '',
      remarks:          item.remarks || '',
    })
    setError('')
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (viewing) return
    setError('')
    const qty = parseInt(form.quantity)
    if (!qty || qty <= 0) { setError('Quantity must be greater than 0'); return }
    if (!form.product_id) { setError('Please select a product'); return }
    setLoading(true)
    try {
      const data = {
        product_id:       parseInt(form.product_id),
        warehouse_id:     form.warehouse_id ? parseInt(form.warehouse_id) : null,
        quantity:         qty,
        damage_reason:    form.damage_reason,
        damage_date:      form.damage_date,
        source:           form.source,
        source_reference: form.source_reference || null,
        remarks:          form.remarks || null,
      }
      await damagedStocksAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save.')
    } finally { setLoading(false) }
  }

  const sourceColor = (src) => {
    const map = {
      'Manual':          ['#f1f5f9', '#475569'],
      'Customer Return': ['#fef3c7', '#d97706'],
      'Stock Opname':    ['#eff6ff', '#2563eb'],
    }
    return map[src] || ['#f1f5f9', '#64748b']
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Damaged Stock</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Track defective, broken, expired, and non-sellable items — excluded from available inventory
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const res = await damagedStocksAPI.exportXlsx(buildFilterParams())
              downloadBlob(res.data, 'damaged-stock-export.xlsx')
            } catch {
              alert('Failed to export damaged stock.')
            } finally {
              setExporting(false)
            }
          }}>{exporting ? 'Exporting...' : 'Export'}</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Record Damaged Stock</button>
        </div>
      </div>

      {/* Summary banner */}
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Records</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#c2410c' }}>{total}</div>
        </div>
        <div style={{ borderLeft: '1px solid #fed7aa', paddingLeft: '2rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note</div>
          <div style={{ fontSize: '0.8125rem', color: '#7c2d12', marginTop: '0.25rem' }}>
            Items here are <strong>NOT</strong> counted in available inventory or dashboard stock totals
          </div>
        </div>
      </div>

      <div className="card">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select
            className="input" style={{ width: 'auto' }}
            value={filters.source}
            onChange={e => { setFilters(f => ({ ...f, source: e.target.value })); setPage(1) }}
          >
            <option value="">All Sources</option>
            {SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Damage Date</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Qty</th>
                <th>Loss Amount</th>
                <th>Reason</th>
                <th>Source</th>
                <th>Reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                    No damaged stock records
                  </td>
                </tr>
              ) : items.map((item, i) => {
                const [bg, color] = sourceColor(item.source)
                return (
                  <tr key={item.damaged_stock_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td>{formatDate(item.damage_date)}</td>
                    <td style={{ fontWeight: 500 }}>{item.product?.product_name || `#${item.product_id}`}</td>
                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>{item.warehouse?.warehouse_name || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#dc2626' }}>{formatNumber(item.quantity)}</td>
                    <td style={{ fontWeight: 600, color: '#dc2626' }}>{item.loss_amount != null ? formatCurrency(item.loss_amount) : '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{item.damage_reason}</td>
                    <td>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: bg, color }}>
                        {item.source || 'Manual'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.source_reference || '—'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openView(item)}>View</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage}
          pageSizeOptions={[15, 25, 50, 100]} onLimitChange={v => { setLimit(v); setPage(1) }} />
      </div>

      {/* Form Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={viewing ? 'View Damaged Stock Record' : 'Record Damaged Stock'} size="lg">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {!viewing && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.8125rem', color: '#92400e' }}>
              These items will be recorded as <strong>non-sellable</strong> and will <strong>not</strong> affect available inventory balance.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Product *</label>
              <SearchableSelect
                endpoint="/products"
                labelField="product_name"
                valueField="product_id"
                value={form.product_id}
                onChange={v => setForm(f => ({ ...f, product_id: v }))}
                placeholder="Search product..."
                required
                disabled={!!viewing}
              />
            </div>

            <div>
              <label className="label">Warehouse</label>
              <SearchableSelect
                endpoint="/warehouses"
                labelField="warehouse_name"
                valueField="warehouse_id"
                value={form.warehouse_id}
                onChange={v => setForm(f => ({ ...f, warehouse_id: v }))}
                placeholder="Select warehouse (optional)"
                disabled={!!viewing}
              />
            </div>

            <div>
              <label className="label">Damage Date *</label>
              <input className="input" type="date" required disabled={!!viewing} value={form.damage_date}
                onChange={e => setForm(f => ({ ...f, damage_date: e.target.value }))} />
            </div>

            <div>
              <label className="label">Quantity *</label>
              <input className="input" type="number" required min="1" step="1" disabled={!!viewing}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>

            <div>
              <label className="label">Damage Reason *</label>
              <select className="input" disabled={!!viewing} value={form.damage_reason}
                onChange={e => setForm(f => ({ ...f, damage_reason: e.target.value }))}>
                {DAMAGE_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Source</label>
              <select className="input" disabled={!!viewing} value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Source Reference</label>
              <input className="input" placeholder="e.g. RTN-12, OPNAME-5, etc." disabled={!!viewing}
                value={form.source_reference}
                onChange={e => setForm(f => ({ ...f, source_reference: e.target.value }))} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Remarks</label>
              <textarea className="input" rows={2} disabled={!!viewing} value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>{viewing ? 'Close' : 'Cancel'}</button>
            {!viewing && (
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Record'}</button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}
