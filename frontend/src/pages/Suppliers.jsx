import { useState, useEffect, useCallback } from 'react'
import { suppliersAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchBar from '../components/SearchBar'
import Pagination from '../components/Pagination'
import { formatDate } from '../utils/format'
import { downloadBlob } from '../utils/downloadFile'

const empty = { supplier_name: '', supplier_contact: '', supplier_email: '', supplier_address: '' }

export default function Suppliers() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Supplier-Products link panel
  const [linkSupplier, setLinkSupplier] = useState(null)    // supplier object
  const [linkedProducts, setLinkedProducts] = useState([])
  const [linkProductId, setLinkProductId] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [exporting, setExporting] = useState(false)

  const [limit, setLimit] = useState(15)

  const buildFilterParams = useCallback(() => {
    const params = {}
    if (search) params.search = search
    return params
  }, [search])

  const load = useCallback(async () => {
    const res = await suppliersAPI.list({ page, limit, ...buildFilterParams() })
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, limit, buildFilterParams])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({ supplier_name: item.supplier_name, supplier_contact: item.supplier_contact || '', supplier_email: item.supplier_email || '', supplier_address: item.supplier_address || '' })
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setLoading(true)
    try {
      if (editing) await suppliersAPI.update(editing.supplier_id, form)
      else await suppliersAPI.create(form)
      setModal(false)
      load()
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    await suppliersAPI.delete(id)
    load()
  }

  // Open the product-link panel for a supplier
  const openLinks = async (supplier) => {
    setLinkSupplier(supplier)
    setLinkProductId('')
    setLinkError('')
    await reloadLinks(supplier.supplier_id)
  }

  const reloadLinks = async (supplierId) => {
    const res = await suppliersAPI.listProducts(supplierId)
    setLinkedProducts(res.data || [])
  }

  const handleLinkProduct = async () => {
    if (!linkProductId) return
    setLinkLoading(true)
    setLinkError('')
    try {
      await suppliersAPI.linkProduct(linkSupplier.supplier_id, { product_id: parseInt(linkProductId) })
      setLinkProductId('')
      await reloadLinks(linkSupplier.supplier_id)
    } catch (err) {
      setLinkError(err.response?.data?.detail || 'Failed to link product.')
    } finally { setLinkLoading(false) }
  }

  const handleUnlink = async (productId) => {
    await suppliersAPI.unlinkProduct(linkSupplier.supplier_id, productId)
    await reloadLinks(linkSupplier.supplier_id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Suppliers</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Manage supplier master data and linked products</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const res = await suppliersAPI.exportXlsx(buildFilterParams())
              downloadBlob(res.data, 'suppliers-export.xlsx')
            } catch {
              alert('Failed to export suppliers.')
            } finally {
              setExporting(false)
            }
          }}>{exporting ? 'Exporting...' : 'Export'}</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Supplier</button>
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search suppliers..." />
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Supplier Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Address</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No suppliers found</td></tr>
              ) : items.map((item, i) => (
                <tr key={item.supplier_id}>
                  <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{item.supplier_name}</td>
                  <td>{item.supplier_contact || '-'}</td>
                  <td>{item.supplier_email || '-'}</td>
                  <td style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.supplier_address || '-'}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontWeight: 600, fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '0.375rem', cursor: 'pointer' }}
                        onClick={() => openLinks(item)}
                        title="Manage linked products"
                      >
                        Products
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.supplier_id)}>Delete</button>
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

      {/* Edit/Create Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setSaveError('') }} title={editing ? 'Edit Supplier' : 'Add Supplier'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {saveError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>{saveError}</div>}
          <div>
            <label className="label">Supplier Name *</label>
            <input className="input" required value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="label">Contact</label>
              <input className="input" value={form.supplier_contact} onChange={e => setForm(f => ({ ...f, supplier_contact: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.supplier_email} onChange={e => setForm(f => ({ ...f, supplier_email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={3} value={form.supplier_address} onChange={e => setForm(f => ({ ...f, supplier_address: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Supplier-Product Links Modal */}
      <Modal open={!!linkSupplier} onClose={() => setLinkSupplier(null)} title={`Products for ${linkSupplier?.supplier_name || ''}`} size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Products linked here will appear in the Receiving module when this supplier is selected.
          </p>

          {linkError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {linkError}
            </div>
          )}

          {/* Add product link */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', background: '#f8fafc', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Add Product</label>
              <AsyncDropdown
                endpoint="/products"
                labelField="product_name"
                valueField="product_id"
                params={{ status: 'Active' }}
                value={linkProductId}
                onChange={v => setLinkProductId(v)}
                placeholder="Select product to link..."
                emptyHint="No active products found"
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleLinkProduct}
              disabled={!linkProductId || linkLoading}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {linkLoading ? 'Linking...' : '+ Link Product'}
            </button>
          </div>

          {/* Linked products list */}
          {linkedProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '0.5rem', border: '1px dashed #d1d5db' }}>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>📦</div>
              <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No products linked yet</div>
              <div style={{ fontSize: '0.75rem' }}>Link products above so they appear when this supplier is selected in Receiving</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                {linkedProducts.length} linked product{linkedProducts.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '280px', overflowY: 'auto' }}>
                {linkedProducts.map(lp => (
                  <div key={lp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem', color: '#166534' }}>{lp.product_name}</span>
                    </div>
                    <button
                      onClick={() => handleUnlink(lp.product_id)}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderRadius: '0.375rem', cursor: 'pointer', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setLinkSupplier(null)}>Close</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => handleDelete(deleteId)} />
    </div>
  )
}
