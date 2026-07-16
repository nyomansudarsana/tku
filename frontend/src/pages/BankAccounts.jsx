import { useState, useEffect, useCallback } from 'react'
import { bankAccountsAPI } from '../api'
import { downloadBlob } from '../utils/downloadFile'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'

const empty = { bank_name: '', account_number: '', beneficiary_name: '', is_active: true }

export default function BankAccounts() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [deleteId, setDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [limit, setLimit] = useState(20)

  // No filter controls are exposed on this page's table yet — kept as a
  // helper (mirroring the other list pages) so it's a single place to wire
  // one up later without touching the export/list call sites.
  const buildFilterParams = useCallback(() => ({}), [])

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await bankAccountsAPI.list({ page, limit, ...buildFilterParams() })
      setItems(res.data.items)
      setTotal(res.data.total || 0)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load bank accounts. Please refresh.')
    }
  }, [page, limit, buildFilterParams])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({ bank_name: item.bank_name, account_number: item.account_number, beneficiary_name: item.beneficiary_name, is_active: item.is_active })
    setModal(true)
  }

  const [saveError, setSaveError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setLoading(true)
    try {
      if (editing) await bankAccountsAPI.update(editing.bank_id, form)
      else await bankAccountsAPI.create(form)
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Bank Accounts</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Bank accounts displayed on Bank Transfer invoices</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const res = await bankAccountsAPI.exportXlsx(buildFilterParams())
              downloadBlob(res.data, 'bank-accounts-export.xlsx')
            } catch {
              alert('Failed to export bank accounts.')
            } finally {
              setExporting(false)
            }
          }}>{exporting ? 'Exporting...' : 'Export'}</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Bank Account</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.875rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Bank Name</th><th>Account Number</th><th>Beneficiary Name</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No bank accounts yet</td></tr>
                : items.map((item, i) => (
                  <tr key={item.bank_id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.bank_name}</td>
                    <td><code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: '0.85rem' }}>{item.account_number}</code></td>
                    <td>{item.beneficiary_name}</td>
                    <td>
                      <span className={`badge ${item.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.bank_id)}>Delete</button>
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

      <Modal open={modal} onClose={() => { setModal(false); setSaveError('') }} title={editing ? 'Edit Bank Account' : 'Add Bank Account'} size="md">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {saveError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {saveError}
            </div>
          )}
          <div>
            <label className="label">Bank Name *</label>
            <input className="input" required value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. Bank Mandiri" />
          </div>
          <div>
            <label className="label">Account Number *</label>
            <input className="input" required value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} placeholder="e.g. 1234567890" />
          </div>
          <div>
            <label className="label">Beneficiary Name *</label>
            <input className="input" required value={form.beneficiary_name} onChange={e => setForm(f => ({ ...f, beneficiary_name: e.target.value }))} placeholder="e.g. PT Kopernik" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={async () => { await bankAccountsAPI.delete(deleteId); load() }} />
    </div>
  )
}
