import { useState, useEffect } from 'react'
import { dashboardAPI, storesAPI, categoriesAPI } from '../api'
import { Link } from 'react-router-dom'
import { formatCurrency, formatNumber, formatDate, paymentStatusBadge } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2']

function StatCard({ title, value, icon, color, subtitle }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
      <div style={{ width: '3rem', height: '3rem', borderRadius: '0.75rem', background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>{title}</p>
        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginTop: '0.125rem' }}>{value}</p>
        {subtitle && <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>{subtitle}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [filters, setFilters] = useState({ store_id: '', category_id: '' })
  const [stores, setStores] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [salesByCategory, setSalesByCategory] = useState([])
  const [salesByStore, setSalesByStore] = useState([])
  const [salesTrend, setSalesTrend] = useState([])
  const [stockSummary, setStockSummary] = useState(null)
  const [lowStockItems, setLowStockItems] = useState([])
  const [stockByLocation, setStockByLocation] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [outstanding, setOutstanding] = useState([])
  const [pendingCustReturns,   setPendingCustReturns]   = useState([])
  const [pendingSupReturns,    setPendingSupReturns]    = useState([])
  const [supReturnsInTransit,  setSupReturnsInTransit]  = useState([])
  const [opnameSummary, setOpnameSummary] = useState(null)
  const [damagedSummary, setDamagedSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([storesAPI.list({ limit: 100 }), categoriesAPI.list({ limit: 100 })]).then(([s, c]) => {
      setStores(s.data.items || [])
      setCategories(c.data.items || [])
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = {}
    if (filters.store_id) params.store_id = filters.store_id

    Promise.all([
      dashboardAPI.salesSummary(params),
      dashboardAPI.topProducts({ ...params, limit: 8 }),
      dashboardAPI.salesByCategory(params),
      dashboardAPI.salesByStore(params),
      dashboardAPI.salesTrend({ ...params, days: 30 }),
      dashboardAPI.stockSummary({}),
      dashboardAPI.lowStock({ limit: 50 }),
      dashboardAPI.salesByPaymentMethod(params),
      dashboardAPI.outstandingSales(),
      dashboardAPI.stockByLocation(),
      dashboardAPI.pendingCustomerReturns(),
      dashboardAPI.pendingSupplierReturns(),
      dashboardAPI.supplierReturnsInTransit(),
      dashboardAPI.stockOpnameSummary(),
      dashboardAPI.damagedStockSummary(),
    ]).then(([sum, top, bycat, bystore, trend, stock, lowstock, payment, outstanding, byLocation, custRet, supRet, supTransit, opname, damaged]) => {
      setSummary(sum.data)
      setTopProducts(top.data)
      setSalesByCategory(bycat.data)
      setSalesByStore(bystore.data)
      setSalesTrend(trend.data)
      setStockSummary(stock.data)
      setLowStockItems(lowstock.data?.items || lowstock.data || [])
      setPaymentMethods(payment.data)
      setOutstanding(outstanding.data)
      setStockByLocation(byLocation.data || [])
      setPendingCustReturns(custRet.data?.items || custRet.data || [])
      setPendingSupReturns(supRet.data?.items || supRet.data || [])
      setSupReturnsInTransit(supTransit.data?.items || supTransit.data || [])
      setOpnameSummary(opname.data)
      setDamagedSummary(damaged.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filters])

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading dashboard...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Kopernik branded header ───────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
        borderRadius: '0.875rem',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 4px 12px rgba(30,58,95,0.25)',
      }}>
        <div>
          <div style={{ color: 'white', fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
            Tech Kiosk Ubud
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
            Inventory &amp; Sales Management System
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem' }}>Welcome back</div>
          <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9375rem' }}>
            {user?.full_name || user?.username || 'User'}
          </div>
        </div>
      </div>

      {/* ── Filters row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 'auto' }} value={filters.store_id} onChange={e => setFilters(f => ({ ...f, store_id: e.target.value }))}>
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '1rem' }}>
        <StatCard title="Daily Sales" value={formatCurrency(summary?.daily_sales)} icon="📅" color="#2563eb" subtitle="Today" />
        <StatCard title="Monthly Sales" value={formatCurrency(summary?.monthly_sales)} icon="📆" color="#16a34a" subtitle="This month" />
        <StatCard title="Total Revenue" value={formatCurrency(summary?.total_revenue)} icon="💰" color="#7c3aed" subtitle="All time" />
        <StatCard title="Total Transactions" value={formatNumber(summary?.total_transactions)} icon="🧾" color="#d97706" subtitle="All time" />
        <StatCard title="Total SKUs" value={formatNumber(stockSummary?.total_items)} icon="📦" color="#0891b2" subtitle="In inventory" />
        <StatCard title="Low Stock Alert" value={formatNumber(lowStockItems.length)} icon="⚠️" color="#dc2626" subtitle="Below minimum level" />
      </div>

      {/* ── Returns, Opname & Damaged Stock ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '1rem' }}>

        {/* Pending Customer Returns (Submitted / Under Inspection) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1rem 0.625rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>🔄 Customer Returns</h3>
            {pendingCustReturns.length > 0 && (
              <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                {pendingCustReturns.length}
              </span>
            )}
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {pendingCustReturns.length === 0
              ? <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center' }}>No open returns</div>
              : pendingCustReturns.map(r => (
                <div key={r.return_id} style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#1e293b' }}>{r.product_name || `#${r.product_id}`}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d97706' }}>{formatNumber(r.quantity)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{formatDate(r.return_date)}</div>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: r.status === 'Submitted' ? '#fef3c7' : '#eff6ff', color: r.status === 'Submitted' ? '#d97706' : '#2563eb', fontWeight: 600 }}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))
            }
          </div>
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #f1f5f9' }}>
            <Link to="/sales-returns" style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>View all returns →</Link>
          </div>
        </div>

        {/* Pending Supplier Returns (Pending / Ready To Send) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1rem 0.625rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>📦 Supplier Returns</h3>
            {pendingSupReturns.length > 0 && (
              <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                {pendingSupReturns.length}
              </span>
            )}
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {pendingSupReturns.length === 0
              ? <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center' }}>No pending returns</div>
              : pendingSupReturns.map(r => (
                <div key={r.return_id} style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#1e293b' }}>{r.product_name || `#${r.product_id}`}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>{formatNumber(r.quantity)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.supplier_name} · {formatDate(r.return_date)}</div>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))
            }
          </div>
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #f1f5f9' }}>
            <Link to="/supplier-returns" style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>View all returns →</Link>
          </div>
        </div>

        {/* Supplier Returns In Transit */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: '3px solid #16a34a' }}>
          <div style={{ padding: '0.875rem 1rem 0.625rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>🚚 In Transit</h3>
            {supReturnsInTransit.length > 0 && (
              <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                {supReturnsInTransit.length}
              </span>
            )}
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {supReturnsInTransit.length === 0
              ? <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center' }}>No returns in transit</div>
              : supReturnsInTransit.map(r => (
                <div key={r.return_id} style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#1e293b' }}>{r.product_name || `#${r.product_id}`}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>{formatNumber(r.quantity)}</div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '1px' }}>{r.supplier_name} · {formatDate(r.return_date)}</div>
                </div>
              ))
            }
          </div>
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#64748b' }}>
            Shipped to supplier, awaiting confirmation
          </div>
        </div>

        {/* Stock Opname Summary */}
        <div className="card">
          <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem', marginBottom: '0.875rem' }}>📋 Stock Opname</h3>
          {!opnameSummary ? (
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>No opname data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#64748b' }}>Last Approved</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>
                  {opnameSummary.last_approved_date ? formatDate(opnameSummary.last_approved_date) : 'Never'}
                </span>
              </div>
              {['Draft', 'Approved', 'Rejected'].map(status => {
                const count = opnameSummary[`${status.toLowerCase()}_count`] || 0
                const colorMap = { Draft: ['#fef3c7','#d97706'], Approved: ['#dcfce7','#16a34a'], Rejected: ['#fee2e2','#dc2626'] }
                const [bg, color] = colorMap[status]
                return (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{status}</span>
                    <span style={{ padding: '0.15rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: bg, color }}>
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Damaged Stock Summary */}
        <div className="card" style={{ borderLeft: '3px solid #f97316' }}>
          <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem', marginBottom: '0.875rem' }}>⚠️ Damaged Stock</h3>
          {!damagedSummary ? (
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>No data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Damaged Qty</span>
                <span style={{ fontWeight: 800, fontSize: '1.125rem', color: '#dc2626' }}>{formatNumber(damagedSummary.total_damaged_qty)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Affected Products</span>
                <span style={{ fontWeight: 700, color: '#ea580c' }}>{damagedSummary.affected_products}</span>
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                Not included in available stock
              </div>
              {damagedSummary.total_damaged_qty > 0 && (
                <Link to="/damaged-stock" style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                  View all →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>Sales Trend (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>Sales by Category</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={salesByCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {salesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>Top Selling Products</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="product_name" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="total_revenue" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>Sales by Payment Method</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={paymentMethods}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="method" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Stock Monitoring ───────────────────────────────────────────────── */}
      {lowStockItems.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          {/* Low Stock Alert table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9375rem' }}>
                <span style={{ marginRight: '0.5rem' }}>⚠️</span>Low Stock Alerts
              </h3>
              <span style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                {lowStockItems.length} product{lowStockItems.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '0.5rem 1.25rem', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Product</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Current</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Minimum</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Warehouse</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((item, i) => {
                    const isOut = item.current_stock <= 0
                    return (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: isOut ? '#fff5f5' : 'white' }}>
                        <td style={{ padding: '0.625rem 1.25rem' }}>
                          <div style={{ fontWeight: 500, color: '#1e293b' }}>{item.product_name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{item.unit}</div>
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center', fontWeight: 700, color: isOut ? '#dc2626' : '#d97706' }}>
                          {formatNumber(item.current_stock)}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center', color: '#64748b' }}>
                          {formatNumber(item.minimum_stock_level)}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                          {item.warehouse_name || '—'}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.175rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                            background: isOut ? '#fee2e2' : '#fef3c7',
                            color: isOut ? '#dc2626' : '#d97706',
                          }}>
                            {isOut ? 'Out of Stock' : 'Low Stock'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reorder Recommendations */}
          <div className="card">
            <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9375rem', marginBottom: '0.875rem' }}>
              <span style={{ marginRight: '0.5rem' }}>📋</span>Products To Reorder
            </h3>
            {lowStockItems.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>All products are well-stocked.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxHeight: '220px', overflowY: 'auto' }}>
                {lowStockItems.slice(0, 8).map((item, i) => {
                  const isOut = item.current_stock <= 0
                  const gap = Math.max(0, (item.minimum_stock_level || 0) - (item.current_stock || 0))
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.625rem 0.875rem', borderRadius: '0.5rem',
                      background: isOut ? '#fef2f2' : '#fffbeb',
                      border: `1px solid ${isOut ? '#fecaca' : '#fde68a'}`,
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.8125rem', color: '#1e293b' }}>{item.product_name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.125rem' }}>Need {gap} {item.unit || 'units'} more</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: isOut ? '#dc2626' : '#d97706' }}>
                          {formatNumber(item.current_stock)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>/ {formatNumber(item.minimum_stock_level)} min</div>
                      </div>
                    </div>
                  )
                })}
                {lowStockItems.length > 8 && (
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                    +{lowStockItems.length - 8} more in full table
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stock by Warehouse / Location ─────────────────────────────────── */}
      {stockByLocation.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9375rem', marginBottom: '0.875rem' }}>
            Stock by Warehouse / Location
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(22rem, 1fr))', gap: '1rem' }}>
            {stockByLocation.map(wh => (
              <div key={wh.warehouse_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Warehouse header */}
                <div style={{ padding: '0.75rem 1rem', background: '#1e3a5f', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{wh.warehouse_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>{wh.total_items} product{wh.total_items !== 1 ? 's' : ''}</div>
                  </div>
                  {wh.low_stock_count > 0 && (
                    <span style={{ background: '#dc2626', color: 'white', fontSize: '0.7rem', fontWeight: 700, padding: '0.175rem 0.5rem', borderRadius: '999px' }}>
                      {wh.low_stock_count} low
                    </span>
                  )}
                </div>
                {/* Product rows */}
                {wh.products.length === 0 ? (
                  <div style={{ padding: '0.875rem 1rem', fontSize: '0.8rem', color: '#94a3b8' }}>No stock recorded</div>
                ) : (
                  <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '0.375rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.72rem' }}>Product</th>
                          <th style={{ padding: '0.375rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Stock</th>
                          <th style={{ padding: '0.375rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '0.72rem' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wh.products.map(p => {
                          const isOut = p.status === 'Out of Stock'
                          const isLow = p.status === 'Low Stock'
                          return (
                            <tr key={p.product_id} style={{ borderTop: '1px solid #f1f5f9', background: isOut ? '#fff5f5' : 'white' }}>
                              <td style={{ padding: '0.5rem 1rem', fontWeight: 500, color: '#1e293b' }}>
                                {p.product_name}
                                <span style={{ color: '#94a3b8', fontSize: '0.68rem', marginLeft: '0.25rem' }}>{p.unit}</span>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: isOut ? '#dc2626' : isLow ? '#d97706' : '#16a34a' }}>
                                {formatNumber(p.quantity)}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                {p.status !== 'OK' && (
                                  <span style={{
                                    padding: '0.15rem 0.45rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 600,
                                    background: isOut ? '#fee2e2' : '#fef3c7',
                                    color: isOut ? '#dc2626' : '#d97706',
                                  }}>{p.status}</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales by Store & Outstanding */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>Sales by Store</h3>
          {salesByStore.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No data</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {salesByStore.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{s.store}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.count} transactions</div>
                  </div>
                  <div style={{ fontWeight: 600, color: '#2563eb' }}>{formatCurrency(s.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#1e293b' }}>Outstanding (Unpaid) Sales</h3>
          {outstanding.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No outstanding sales</p> : (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {outstanding.slice(0, 10).map((s) => (
                <div key={s.sales_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#fef2f2', borderRadius: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{s.customer_name || `Sale #${s.sales_id}`}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{formatDate(s.sales_date)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatCurrency(s.grand_total)}</span>
                    <span className={`badge ${paymentStatusBadge(s.payment_status)}`}>{s.payment_status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
