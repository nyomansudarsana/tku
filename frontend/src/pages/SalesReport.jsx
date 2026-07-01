import { useState, useEffect, useCallback } from 'react'
import { reportsAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import { formatNumber, formatCurrency, formatDate } from '../utils/format'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function SalesReport() {
  const [items, setItems] = useState([])
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [storeFilter, setStoreFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const buildParams = () => {
    const params = {}
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (storeFilter) params.store_id = storeFilter
    return params
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await reportsAPI.sales(buildParams())
      setItems(res.data.items || [])
    } catch {
      setError('Failed to load sales report.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, storeFilter])

  useEffect(() => { load() }, [load])

  // Per-row cells show per-unit figures (per the required Margin formula),
  // so the footer sums the line-level (quantity-weighted) totals the backend
  // provides alongside them — summing the per-unit column directly would
  // produce a meaningless blended number across lines of different quantity.
  const totals = items.reduce((acc, r) => {
    acc.exclVat += r._line_sales_price_excl_vat || 0
    acc.vat += r._line_vat_amount || 0
    acc.inclVat += r._line_sales_price_incl_vat || 0
    acc.margin += r._line_margin || 0
    return acc
  }, { exclVat: 0, vat: 0, inclVat: 0, margin: 0 })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await reportsAPI.salesXlsx(buildParams())
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sales-report.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export report.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Sales Report</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Per-line pricing, VAT breakdown, and margin against vendor purchase cost
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting || loading}>
          {exporting ? 'Exporting...' : 'Export to Excel'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" type="date" style={{ width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>to</span>
          <input className="input" type="date" style={{ width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <div style={{ minWidth: '12rem' }}>
            <AsyncDropdown endpoint="/stores" labelField="store_name" valueField="store_id"
              value={storeFilter} onChange={setStoreFilter} placeholder="All Stores" />
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Sales #</th><th>Store</th><th>Customer</th><th>Product</th>
                <th>Qty Sold</th><th>Purchase Price</th><th>Sales Price Ex VAT</th><th>VAT</th>
                <th>Sales Price Inc VAT</th><th>Margin</th><th>Margin %</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No sales in this range</td></tr>
              ) : items.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.8rem' }}>{formatDate(r.sales_date)}</td>
                  <td><code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>#{r.sales_id}</code></td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{r.store_name || '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{r.customer_name || 'Walk-in'}</td>
                  <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                  <td>{formatNumber(r.quantity)}</td>
                  <td style={{ color: r.purchase_price == null ? '#94a3b8' : undefined, fontStyle: r.purchase_price == null ? 'italic' : undefined }}>
                    {r.purchase_price != null ? formatCurrency(r.purchase_price) : 'N/A'}
                  </td>
                  <td>{formatCurrency(r.sales_price_excl_vat)}</td>
                  <td style={{ color: '#059669' }}>{formatCurrency(r.vat_amount)}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(r.sales_price_incl_vat)}</td>
                  <td style={{ fontWeight: 600, color: r.margin != null ? (r.margin >= 0 ? '#16a34a' : '#dc2626') : '#94a3b8' }}>
                    {r.margin != null ? formatCurrency(r.margin) : <span style={{ fontStyle: 'italic' }}>N/A</span>}
                  </td>
                  <td style={{ color: r.margin_pct != null ? (r.margin_pct >= 0 ? '#16a34a' : '#dc2626') : '#94a3b8' }}>
                    {r.margin_pct != null ? `${r.margin_pct}%` : <span style={{ fontStyle: 'italic' }}>N/A</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                  <td colSpan={7} style={{ textAlign: 'right' }}>Totals</td>
                  <td>{formatCurrency(totals.exclVat)}</td>
                  <td style={{ color: '#059669' }}>{formatCurrency(totals.vat)}</td>
                  <td>{formatCurrency(totals.inclVat)}</td>
                  <td style={{ color: totals.margin >= 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency(totals.margin)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
