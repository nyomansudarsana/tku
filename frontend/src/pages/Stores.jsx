import { useState, useEffect, useCallback } from 'react'
import { storesAPI } from '../api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchBar from '../components/SearchBar'
import Pagination from '../components/Pagination'
import { formatDate } from '../utils/format'
import { exportCsv } from '../utils/exportCsv'

const empty = { store_name: '', location: '', description: '' }

export default function Stores() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const limit = 15

  const load = useCallback(async () => {
    const res = await storesAPI.list({ search, page, limit })
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [search, page])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(empty); setError(''); setModal(true) }
  const openEdit = (item) => { setEditing(item); setForm({ store_name: item.store_name, location: item.location || '', description: item.description || '' }); setError(''); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (editing) await storesAPI.update(editing.store_id, form)
      else await storesAPI.create(form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Stores</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Manage store locations</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => exportCsv(items, ['store_name','location','description'], { store_name:'Name', location:'Location', description:'Description' }, 'stores-export')}>Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Store</button>
        </div>
      </div>
      <div className="card">
        <div style={{ marginBottom: '1rem' }}><SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search stores..." /></div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>#</th><th>Store Name</th><th>Location</th><th>Description</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No stores found</td></tr>
                : items.map((item, i) => (
                  <tr key={item.store_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td style={{ fontWeight: 500 }}>🏪 {item.store_name}</td>
                    <td>{item.location || '-'}</td>
                    <td>{item.description || '-'}</td>
                    <td>{formatDate(item.created_at)}</td>
                    <td><div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.store_id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Store' : 'Add Store'} size="sm">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          <div><label className="label">Store Name *</label><input className="input" required value={form.store_name} onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))} /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          <div><label className="label">Description</label><textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await storesAPI.delete(deleteId); load() }} />
    </div>
  )
}
