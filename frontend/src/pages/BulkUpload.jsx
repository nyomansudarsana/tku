import { useState, useEffect, useRef } from 'react'
import { bulkUploadAPI } from '../api'
import { formatDate } from '../utils/format'

const IMPORT_TYPES = [
  { value: 'suppliers', label: 'Suppliers', icon: '🏭', description: 'Import supplier master data' },
  { value: 'categories', label: 'Categories', icon: '🗂️', description: 'Import product categories' },
  { value: 'products', label: 'Products', icon: '📦', description: 'Import product catalog (categories must exist first)' },
  { value: 'bank_accounts', label: 'Bank Accounts', icon: '🏦', description: 'Import bank account records' },
]

function StatusBadge({ status, errorRows }) {
  if (status === 'completed' && errorRows === 0)
    return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: '#dcfce7', color: '#16a34a' }}>Success</span>
  if (status === 'completed' && errorRows > 0)
    return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: '#fef3c7', color: '#d97706' }}>Partial</span>
  return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: '#fee2e2', color: '#dc2626' }}>Failed</span>
}

export default function BulkUpload() {
  const [importType, setImportType] = useState('suppliers')
  const [file, setFile] = useState(null)
  const [step, setStep] = useState('idle') // idle | validating | preview | importing | done
  const [preview, setPreview] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [history, setHistory] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [error, setError] = useState('')
  const fileRef = useRef()
  const HIST_LIMIT = 10

  useEffect(() => {
    loadHistory()
  }, [historyPage])

  const loadHistory = async () => {
    try {
      const res = await bulkUploadAPI.history({ page: historyPage, limit: HIST_LIMIT })
      setHistory(res.data.items || [])
      setHistoryTotal(res.data.total || 0)
    } catch { /* silent */ }
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await bulkUploadAPI.getTemplate(importType)
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `template_${importType}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download template.')
    }
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setStep('idle'); setPreview(null); setImportResult(null); setError('') }
  }

  const handleValidate = async () => {
    if (!file) { setError('Please select a file first.'); return }
    setError('')
    setStep('validating')
    try {
      const res = await bulkUploadAPI.validate(importType, file)
      setPreview(res.data)
      setStep('preview')
    } catch (err) {
      setError(err.response?.data?.detail || 'Validation failed.')
      setStep('idle')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setStep('importing')
    setError('')
    try {
      const res = await bulkUploadAPI.import(importType, file)
      setImportResult(res.data)
      setStep('done')
      loadHistory()
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed.')
      setStep('preview')
    }
  }

  const handleReset = () => {
    setFile(null)
    setStep('idle')
    setPreview(null)
    setImportResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const selected = IMPORT_TYPES.find(t => t.value === importType)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Bulk Upload</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Import master data from CSV or XLSX files</p>
        </div>
      </div>

      {/* Step 1: Select Type & Download Template */}
      <div className="card">
        <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '1rem' }}>Step 1 — Select Data Type</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {IMPORT_TYPES.map(t => (
            <button key={t.value} onClick={() => { setImportType(t.value); handleReset() }}
              style={{
                padding: '0.875rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${importType === t.value ? '#2563eb' : '#e2e8f0'}`,
                background: importType === t.value ? '#eff6ff' : 'white',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.375rem' }}>{t.icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: importType === t.value ? '#1d4ed8' : '#1e293b' }}>{t.label}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>{t.description}</div>
            </button>
          ))}
        </div>
        <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
          Download {selected?.label} Template (CSV)
        </button>
      </div>

      {/* Step 2: Upload & Validate */}
      <div className="card">
        <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '1rem' }}>Step 2 — Upload File</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: '14rem' }}>
            <label className="label">Select CSV or XLSX file</label>
            <input ref={fileRef} className="input" type="file" accept=".csv,.xlsx"
              onChange={handleFileChange} style={{ padding: '0.375rem' }} />
            {file && <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.375rem' }}>Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', paddingBottom: '0' }}>
            <button className="btn btn-primary" onClick={handleValidate} disabled={!file || step === 'validating'} style={{ marginTop: '1.5rem' }}>
              {step === 'validating' ? 'Validating...' : 'Validate File'}
            </button>
            {(preview || importResult) && (
              <button className="btn btn-secondary" onClick={handleReset} style={{ marginTop: '1.5rem' }}>Reset</button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* Step 3: Validation Preview */}
      {preview && step === 'preview' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontWeight: 600, color: '#1e293b' }}>Step 3 — Validation Preview</h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                {preview.total_rows} rows found — <span style={{ color: '#16a34a', fontWeight: 600 }}>{preview.valid_rows} valid</span>
                {preview.invalid_rows > 0 && <span>, <span style={{ color: '#dc2626', fontWeight: 600 }}>{preview.invalid_rows} invalid</span></span>}
              </p>
            </div>
            {preview.valid_rows > 0 && (
              <button className="btn btn-primary" onClick={handleImport} disabled={step === 'importing'}>
                {step === 'importing' ? 'Importing...' : `Import ${preview.valid_rows} Valid Rows`}
              </button>
            )}
          </div>

          {/* Errors table */}
          {preview.errors?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.5rem' }}>Validation Errors</h4>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #fecaca', borderRadius: '0.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2' }}>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#dc2626' }}>Row</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#dc2626' }}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #fecaca' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#7f1d1d' }}>#{e.row_number}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#b91c1c' }}>{e.error_message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valid rows preview */}
          {preview.preview?.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#16a34a', marginBottom: '0.5rem' }}>
                Valid Rows Preview (first {preview.preview.length})
              </h4>
              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #bbf7d0', borderRadius: '0.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4' }}>
                      {Object.keys(preview.preview[0]).filter(k => !k.startsWith('_')).map(k => (
                        <th key={k} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#166534', whiteSpace: 'nowrap' }}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #bbf7d0' }}>
                        {Object.entries(row).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                          <td key={k} style={{ padding: '0.5rem 0.75rem', color: '#1e293b', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Import Result */}
      {importResult && step === 'done' && (
        <div className="card" style={{ border: importResult.error_rows > 0 ? '1px solid #fde68a' : '1px solid #bbf7d0', background: importResult.error_rows > 0 ? '#fffbeb' : '#f0fdf4' }}>
          <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem' }}>
            {importResult.error_rows === 0 ? '✅ Import Complete' : '⚠️ Import Completed with Errors'}
          </h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div><span style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Rows</span><div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{importResult.total_rows}</div></div>
            <div><span style={{ fontSize: '0.8rem', color: '#16a34a' }}>Imported</span><div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#16a34a' }}>{importResult.success_rows}</div></div>
            {importResult.error_rows > 0 && <div><span style={{ fontSize: '0.8rem', color: '#dc2626' }}>Failed</span><div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#dc2626' }}>{importResult.error_rows}</div></div>}
          </div>
          <button className="btn btn-secondary" onClick={handleReset}>Upload Another File</button>
        </div>
      )}

      {/* Import History */}
      <div className="card">
        <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '1rem' }}>Import History</h3>
        {history.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No imports yet.</p>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Filename</th><th>Total</th><th>Imported</th><th>Errors</th><th>By</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.import_id}>
                      <td style={{ fontSize: '0.8rem' }}>{formatDate(h.created_at)}</td>
                      <td><span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>{h.import_type}</span></td>
                      <td style={{ fontSize: '0.8rem', maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.filename}</td>
                      <td style={{ textAlign: 'center' }}>{h.total_rows}</td>
                      <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{h.success_rows}</td>
                      <td style={{ textAlign: 'center', color: h.error_rows > 0 ? '#dc2626' : '#94a3b8', fontWeight: h.error_rows > 0 ? 600 : 400 }}>{h.error_rows}</td>
                      <td style={{ fontSize: '0.8rem', color: '#475569' }}>{h.created_by}</td>
                      <td><StatusBadge status={h.status} errorRows={h.error_rows} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{historyTotal} total imports</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)}>Prev</button>
                <button className="btn btn-secondary btn-sm" disabled={historyPage * HIST_LIMIT >= historyTotal} onClick={() => setHistoryPage(p => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
