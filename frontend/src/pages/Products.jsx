import { useState, useEffect, useCallback } from 'react'
import { productsAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchBar from '../components/SearchBar'
import Pagination from '../components/Pagination'
import { formatCurrency } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

const UNITS = ['PCS', 'Pack', 'Unit', 'Box', 'Set', 'Kg', 'Liter']
const empty = {
  product_name: '',
  supplier_id: '',
  category_id: '',
  sale_price: '',
  product_description: '',
  sku: '',
  barcode: '',
  unit: 'PCS',
  status: 'Active',
  minimum_stock_level: '0',
}

export default function Products() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const limit = 15

  const load = useCallback(async () => {
    const params = { search, page, limit }
    if (categoryFilter) params.category_id = categoryFilter
    if (statusFilter) params.status = statusFilter
    const res = await productsAPI.list(params)
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [search, page, categoryFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(empty); setSaveError(''); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      product_name: item.product_name,
      supplier_id: item.supplier_id ? String(item.supplier_id) : '',
      category_id: item.category_id ? String(item.category_id) : '',
      sale_price: item.sale_price,
      product_description: item.product_description || '',
      sku: item.sku || '',
      barcode: item.barcode || '',
      unit: item.unit,
      status: item.status,
      minimum_stock_level: item.minimum_stock_level ?? 0,
    })
    setSaveError('')
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setLoading(true)
    try {
      const data = {
        ...form,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        sale_price: parseFloat(form.sale_price),
        minimum_stock_level: parseFloat(form.minimum_stock_level) || 0,
      }
      if (editing) await productsAPI.update(editing.product_id, data)
      else await productsAPI.create(data)
      setModal(false)
      load()
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Products</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Manage product catalog</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(p => ({
              name: p.product_name,
              supplier: p.supplier?.supplier_name || '',
              sku: p.sku || '',
              category: p.category?.category_name || '',
              price: p.sale_price,
              unit: p.unit,
              status: p.status,
              description: p.product_description || '',
            }))
            exportCsv(rows,
              ['name','supplier','sku','category','price','unit','status','description'],
              { name:'Product Name', supplier:'Supplier', sku:'SKU', category:'Category', price:'Sale Price', unit:'Unit', status:'Status', description:'Description' },
              'products-export')
          }}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Product</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search products..." />
          <div style={{ minWidth: '12rem' }}>
            <AsyncDropdown
              endpoint="/categories"
              labelField="category_name"
              valueField="category_id"
              value={categoryFilter}
              onChange={v => { setCategoryFilter(v); setPage(1) }}
              placeholder="All Categories"
              emptyHint="No categories found"
              style={{ width: 'auto' }}
            />
          </div>
          <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>SKU</th><th>Product Name</th><th>Supplier</th><th>Category</th><th>Unit</th><th>Price</th><th>Min Stock</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No products found</td></tr>
                : items.map((item, i) => (
                  <tr key={item.product_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td><code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{item.sku || '-'}</code></td>
                    <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                    <td>
                      {item.supplier
                        ? <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 500 }}>{item.supplier.supplier_name}</span>
                        : <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 500 }}>⚠ No Supplier</span>}
                    </td>
                    <td>{item.category?.category_name || '-'}</td>
                    <td>{item.unit}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(item.sale_price)}</td>
                    <td style={{ textAlign: 'center', color: item.minimum_stock_level > 0 ? '#d97706' : '#94a3b8' }}>{item.minimum_stock_level ?? 0}</td>
                    <td><span className={`badge ${item.status === 'Active' ? 'badge-green' : 'badge-red'}`}>{item.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.product_id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setSaveError('') }} title={editing ? 'Edit Product' : 'Add Product'} size="lg">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {saveError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {saveError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <div style={{ gridColumn: '1/-1' }}>
              <label className="label">Product Name *</label>
              <input className="input" required value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} />
            </div>

            <div>
              <label className="label">Supplier</label>
              <SearchableSelect
                endpoint="/suppliers"
                labelField="supplier_name"
                valueField="supplier_id"
                value={form.supplier_id}
                onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
                placeholder="Select supplier"
                emptyHint="No suppliers found"
              />
              <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                Sets which supplier this product appears under in Receiving
              </p>
            </div>

            <div>
              <label className="label">Category</label>
              <AsyncDropdown
                endpoint="/categories"
                labelField="category_name"
                valueField="category_id"
                value={form.category_id}
                onChange={v => setForm(f => ({ ...f, category_id: v }))}
                placeholder="Select category"
                emptyHint="No categories found — add categories in Master Data first"
              />
            </div>

            <div>
              <label className="label">Sale Price (IDR) *</label>
              <input className="input" type="number" required min="0" step="100" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} />
            </div>

            <div>
              <label className="label">SKU</label>
              <input className="input" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>

            <div>
              <label className="label">Barcode</label>
              <input className="input" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
            </div>

            <div>
              <label className="label">Unit *</label>
              <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>

            <div>
              <label className="label">Minimum Stock Level</label>
              <input className="input" type="number" min="0" step="1" value={form.minimum_stock_level} onChange={e => setForm(f => ({ ...f, minimum_stock_level: e.target.value }))} placeholder="0" />
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>Alert when available stock falls at or below this quantity</p>
            </div>

            <div style={{ gridColumn: '1/-1' }}>
              <label className="label">Description</label>
              <textarea className="input" rows={3} value={form.product_description} onChange={e => setForm(f => ({ ...f, product_description: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await productsAPI.delete(deleteId); load() }} />
    </div>
  )
}
