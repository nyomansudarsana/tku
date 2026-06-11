import { useState } from 'react'
import { authAPI } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user } = useAuth()
  const [form, setForm] = useState({ old_password: '', new_password: '', confirm_password: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setMsg(''); setError('')
    if (form.new_password !== form.confirm_password) { setError('New passwords do not match'); return }
    setLoading(true)
    try {
      await authAPI.changePassword({ old_password: form.old_password, new_password: form.new_password })
      setMsg('Password changed successfully!')
      setForm({ old_password: '', new_password: '', confirm_password: '' })
    } catch (err) { setError(err.response?.data?.detail || 'Error changing password')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: '32rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>My Profile</h1>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '4rem', height: '4rem', background: '#dbeafe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: '#1d4ed8' }}>
            {user?.full_name?.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{user?.full_name}</div>
            <div style={{ color: '#64748b', fontSize: '0.875rem' }}>@{user?.username}</div>
            <span className={`badge ${user?.role === 'Admin' ? 'badge-red' : user?.role === 'Manager' ? 'badge-blue' : 'badge-gray'}`}>{user?.role}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Change Password</h2>
        {msg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.75rem', color: '#15803d', fontSize: '0.875rem', marginBottom: '1rem' }}>{msg}</div>}
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div><label className="label">Current Password *</label><input className="input" type="password" required value={form.old_password} onChange={e => setForm(f => ({ ...f, old_password: e.target.value }))} /></div>
          <div><label className="label">New Password *</label><input className="input" type="password" required value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} /></div>
          <div><label className="label">Confirm New Password *</label><input className="input" type="password" required value={form.confirm_password} onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))} /></div>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Updating...' : 'Change Password'}</button>
        </form>
      </div>
    </div>
  )
}
