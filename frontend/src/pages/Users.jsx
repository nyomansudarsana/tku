import { useState, useEffect, useCallback } from 'react'
import { usersAPI } from '../api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchBar from '../components/SearchBar'
import Pagination from '../components/Pagination'
import { formatDate } from '../utils/format'
import { downloadBlob } from '../utils/downloadFile'

const ROLES = ['Admin', 'Manager', 'Staff']
const empty = { username: '', full_name: '', email: '', password: '', role: 'Staff', status: 'Active' }

export default function Users() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [resetModal, setResetModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetError, setResetError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [limit, setLimit] = useState(15)

  const buildFilterParams = useCallback(() => {
    const params = {}
    if (search) params.search = search
    return params
  }, [search])

  const load = useCallback(async () => {
    const res = await usersAPI.list({ page, limit, ...buildFilterParams() })
    setItems(res.data.items)
    setTotal(res.data.total)
  }, [page, limit, buildFilterParams])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(empty); setError(''); setModal(true) }
  const openEdit = (item) => { setEditing(item); setForm({ username: item.username, full_name: item.full_name, email: item.email || '', password: '', role: item.role, status: item.status }); setError(''); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (editing) {
        const data = { full_name: form.full_name, email: form.email, role: form.role, status: form.status }
        await usersAPI.update(editing.user_id, data)
      } else {
        await usersAPI.create(form)
      }
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally { setLoading(false) }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault(); setResetError(''); setLoading(true)
    try {
      await usersAPI.resetPassword(resetModal.user_id, { new_password: newPassword })
      setResetModal(null); setNewPassword('')
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.')
    } finally { setLoading(false) }
  }

  const roleBadge = (role) => {
    const map = { Admin: 'badge-red', Manager: 'badge-blue', Staff: 'badge-gray' }
    return map[role] || 'badge-gray'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>User Management</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Manage system users and roles</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const res = await usersAPI.exportXlsx(buildFilterParams())
              downloadBlob(res.data, 'users-export.xlsx')
            } catch {
              alert('Failed to export users.')
            } finally {
              setExporting(false)
            }
          }}>{exporting ? 'Exporting...' : 'Export'}</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
        </div>
      </div>
      <div className="card">
        <div style={{ marginBottom: '1rem' }}><SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search users..." /></div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>#</th><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No users found</td></tr>
                : items.map((item, i) => (
                  <tr key={item.user_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td><code style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{item.username}</code></td>
                    <td style={{ fontWeight: 500 }}>👤 {item.full_name}</td>
                    <td>{item.email || '-'}</td>
                    <td><span className={`badge ${roleBadge(item.role)}`}>{item.role}</span></td>
                    <td><span className={`badge ${item.status === 'Active' ? 'badge-green' : 'badge-red'}`}>{item.status}</span></td>
                    <td>{formatDate(item.created_at)}</td>
                    <td><div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setResetModal(item); setNewPassword('') }}>Reset PWD</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.user_id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage}
          pageSizeOptions={[15, 25, 50, 100]} onLimitChange={v => { setLimit(v); setPage(1) }} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit User' : 'Add User'} size="md">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div><label className="label">Username *</label><input className="input" required value={form.username} disabled={!!editing} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
            <div><label className="label">Full Name *</label><input className="input" required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            {!editing && <div><label className="label">Password *</label><input className="input" type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>}
            <div><label className="label">Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetModal} onClose={() => { setResetModal(null); setResetError('') }} title={`Reset Password — ${resetModal?.username}`} size="sm">
        <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {resetError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {resetError}
            </div>
          )}
          <div><label className="label">New Password *</label><input className="input" type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setResetModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await usersAPI.delete(deleteId); load() }} />
    </div>
  )
}
