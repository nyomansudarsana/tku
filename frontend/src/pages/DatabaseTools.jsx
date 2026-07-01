import { useState, useEffect, useCallback } from 'react'
import { adminAPI } from '../api'
import { formatDateTime } from '../utils/format'

const CONFIRM_PHRASE = 'RESET TRANSACTIONS'

function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DatabaseTools() {
  const [backups, setBackups] = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }
  const [demoResult, setDemoResult] = useState(null)

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const res = await adminAPI.listBackups()
      setBackups(res.data.items || [])
    } catch {
      // silent — backups list is informational, not critical path
    } finally {
      setLoadingBackups(false)
    }
  }, [])

  useEffect(() => { loadBackups() }, [loadBackups])

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setMessage(null)
    try {
      const res = await adminAPI.createBackup()
      setMessage({ type: 'success', text: `Backup created: ${res.data.filename}` })
      loadBackups()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to create backup.' })
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleReset = async () => {
    if (confirmText !== CONFIRM_PHRASE) return
    setResetting(true)
    setMessage(null)
    try {
      const res = await adminAPI.resetTransactions(confirmText)
      const counts = Object.entries(res.data.deleted_counts || {})
        .filter(([, n]) => n > 0)
        .map(([table, n]) => `${table}: ${n}`)
        .join(', ')
      setMessage({
        type: 'success',
        text: `Transaction data cleared. Backup saved as ${res.data.backup_file}.${counts ? ` Deleted — ${counts}.` : ''}`,
      })
      setConfirmText('')
      setDemoResult(null)
      loadBackups()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Reset failed.' })
    } finally {
      setResetting(false)
    }
  }

  const handleLoadDemoData = async () => {
    setLoadingDemo(true)
    setMessage(null)
    try {
      const res = await adminAPI.loadDemoData()
      setDemoResult(res.data)
      setMessage({ type: 'success', text: res.data.message })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load demo data.' })
    } finally {
      setLoadingDemo(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '52rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Database Tools</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Admin-only utilities for backing up the database and preparing fresh test data. All actions here are logged.
        </p>
      </div>

      {message && (
        <div style={{
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: '0.5rem', padding: '0.75rem',
          color: message.type === 'success' ? '#16a34a' : '#dc2626',
          fontSize: '0.875rem',
        }}>
          {message.text}
        </div>
      )}

      {/* Backups */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1e293b' }}>Backups</h2>
            <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
              Snapshots of the live database file. A backup is also taken automatically before every reset.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleCreateBackup} disabled={creatingBackup}>
            {creatingBackup ? 'Backing up...' : 'Create Backup Now'}
          </button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>File</th><th>Size</th><th>Created</th></tr>
            </thead>
            <tbody>
              {loadingBackups ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>Loading...</td></tr>
              ) : backups.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>No backups yet</td></tr>
              ) : backups.map(b => (
                <tr key={b.filename}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{b.filename}</td>
                  <td>{formatBytes(b.size_bytes)}</td>
                  <td>{formatDateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Backup files live in the server's <code>backups/</code> folder next to the database file. To restore one,
          stop the server, replace the live database file with the backup, and restart — do this only with direct
          filesystem access, not from this page.
        </p>
      </div>

      {/* Load demo data */}
      <div className="card">
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>Load Demo Data</h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Generates sample Receivings and Sales against your existing Suppliers, Products, Warehouses, and Stores —
          useful for exercising Reports and margin calculations end to end. Requires at least one active Supplier,
          Product, Warehouse, and Store to already exist.
        </p>
        <button className="btn btn-secondary" onClick={handleLoadDemoData} disabled={loadingDemo}>
          {loadingDemo ? 'Generating...' : 'Load Demo Data'}
        </button>
        {demoResult && (
          <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.5rem' }}>
            Created {demoResult.receivings_created} receiving(s) and {demoResult.sales_created} sale(s) at warehouse "{demoResult.warehouse_used}".
          </p>
        )}
      </div>

      {/* Danger zone */}
      <div className="card" style={{ border: '1px solid #fecaca' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem' }}>Reset Transaction Data</h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Permanently deletes all Receiving, Inventory, Inventory Ledger, Sales, Sales Details, Payments, Sales Returns,
          Supplier Returns, Stock Opname, Damaged Stock, and Stock Movement records.
        </p>
        <p style={{ color: '#16a34a', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Preserved: Users, Roles/Permissions, Suppliers, Products, Warehouses, Stores, Bank Accounts, Categories.
        </p>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          A backup is created automatically before this runs. To confirm, type <strong>{CONFIRM_PHRASE}</strong> below.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: '18rem' }}
            placeholder={CONFIRM_PHRASE}
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
          />
          <button
            className="btn"
            style={{ background: '#dc2626', color: '#fff' }}
            onClick={handleReset}
            disabled={confirmText !== CONFIRM_PHRASE || resetting}
          >
            {resetting ? 'Resetting...' : 'Reset Transaction Data'}
          </button>
        </div>
      </div>
    </div>
  )
}
