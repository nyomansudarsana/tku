import { useState, useEffect, useCallback } from 'react'
import { permissionsAPI } from '../api'
import AsyncDropdown from '../components/AsyncDropdown'

export default function RoleManagement() {
  const [userId, setUserId] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [effective, setEffective] = useState({})
  const [overrides, setOverrides] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    permissionsAPI.listCatalog().then(res => setCatalog(res.data)).catch(() => setError('Failed to load permission catalog.'))
  }, [])

  const loadUserPermissions = useCallback(async (id) => {
    if (!id) { setEffective({}); setOverrides({}); return }
    setLoading(true)
    setError('')
    try {
      const res = await permissionsAPI.getUserPermissions(id)
      setEffective(res.data.effective)
      setOverrides(res.data.overrides)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load user permissions.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleUserSelect = (opt) => {
    setSelectedUser(opt)
    setSaveMessage('')
    loadUserPermissions(opt.user_id)
  }

  const toggle = (key) => {
    setEffective(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    setSaveMessage('')
    setError('')
    try {
      const res = await permissionsAPI.updateUserPermissions(userId, { overrides: effective })
      setEffective(res.data.effective)
      setOverrides(res.data.overrides)
      setSaveMessage('Saved.')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save permissions.')
    } finally {
      setSaving(false)
    }
  }

  const grouped = catalog.reduce((acc, p) => {
    (acc[p.group_label] ||= []).push(p)
    return acc
  }, {})

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Role Management</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Fine-tune menu access per user — checkboxes start from the user's role default (Admin/Manager/Staff) and only overrides are stored
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <label className="label">Select User *</label>
        <div style={{ maxWidth: '24rem' }}>
          <AsyncDropdown
            endpoint="/users"
            labelField="full_name"
            valueField="user_id"
            value={userId}
            onChange={setUserId}
            onSelect={handleUserSelect}
            formatLabel={u => `${u.full_name} (${u.username}) — ${u.role}`}
            placeholder="Select a user..."
            emptyHint="No users found"
          />
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {selectedUser && !loading && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>{selectedUser.full_name}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {selectedUser.username} · Role: <strong>{selectedUser.role}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {saveMessage && <span style={{ color: '#16a34a', fontSize: '0.8125rem', fontWeight: 600 }}>{saveMessage}</span>}
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: '1.25rem' }}>
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.625rem' }}>
                  {group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {items.map(p => {
                    const isOverridden = Object.prototype.hasOwnProperty.call(overrides, p.permission_key)
                    return (
                      <label key={p.permission_key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#1e293b', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!effective[p.permission_key]}
                          onChange={() => toggle(p.permission_key)}
                        />
                        <span>{p.label}</span>
                        {isOverridden && (
                          <span style={{ fontSize: '0.65rem', color: '#d97706', fontWeight: 600 }} title="Overrides the role default">
                            (custom)
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="card" style={{ color: '#94a3b8' }}>Loading permissions...</div>}
    </div>
  )
}
