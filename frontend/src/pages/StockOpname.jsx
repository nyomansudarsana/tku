import { useState, useEffect, useCallback } from 'react'
import { stockOpnamesAPI } from '../api'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { formatDate, formatNumber } from '../utils/format'

const STATUSES = ['Draft', 'Approved', 'Rejected']
const DIFF_REASONS = ['Damaged', 'Broken', 'Lost', 'Expired', 'Miscount', 'Theft', 'Other']

function StatusBadge({ status }) {
  const map = {
    Draft:    ['#eff6ff', '#2563eb'],
    Approved: ['#dcfce7', '#16a34a'],
    Rejected: ['#fee2e2', '#dc2626'],
  }
  const [bg, color] = map[status] || ['#f1f5f9', '#64748b']
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: bg, color }}>
      {status}
    </span>
  )
}

function DiffBadge({ diff }) {
  if (Math.abs(diff) < 0.001) return <span style={{ color: '#94a3b8' }}>—</span>
  const color = diff > 0 ? '#16a34a' : '#dc2626'
  return <span style={{ fontWeight: 700, color }}>{diff > 0 ? '+' : ''}{formatNumber(diff)}</span>
}

export default function StockOpname() {
  const [items,       setItems]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [createModal, setCreateModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [deleteId,    setDeleteId]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  // Create form
  const [newForm, setNewForm] = useState({
    opname_date:  new Date().toISOString().slice(0, 10),
    warehouse_id: '',
    store_id:     '',
    remarks:      '',
    performed_by: '',
  })

  // Detail add form
  const emptyAdd = () => ({ product_id: '', good_qty: '', damaged_qty: '0', reason: '', remarks: '' })
  const [addProduct, setAddProduct]   = useState(emptyAdd())
  const [addError,   setAddError]     = useState('')
  const [addLoading, setAddLoading]   = useState(false)
  const [populating, setPopulating]   = useState(false)
  const [approving,  setApproving]    = useState(false)
  const limit = 15

  const load = useCallback(async () => {
    const res = await stockOpnamesAPI.list({ page, limit })
    setItems(res.data.items || [])
    setTotal(res.data.total || 0)
  }, [page])

  useEffect(() => { load() }, [load])

  const openDetail = async (item) => {
    const res = await stockOpnamesAPI.get(item.opname_id)
    setSelected(res.data)
    setAddProduct(emptyAdd())
    setAddError('')
    setDetailModal(true)
  }

  const refreshSelected = async () => {
    if (!selected) return
    const res = await stockOpnamesAPI.get(selected.opname_id)
    setSelected(res.data)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    if (!newForm.warehouse_id) { setError('Please select a warehouse'); return }
    setLoading(true)
    try {
      const data = {
        opname_date:  newForm.opname_date,
        warehouse_id: parseInt(newForm.warehouse_id),
        store_id:     newForm.store_id    ? parseInt(newForm.store_id)  : null,
        remarks:      newForm.remarks     || null,
        performed_by: newForm.performed_by || null,
      }
      await stockOpnamesAPI.create(data)
      setCreateModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create.')
    } finally { setLoading(false) }
  }

  const handlePopulate = async () => {
    if (!selected) return
    setPopulating(true)
    try {
      await stockOpnamesAPI.populateFromInventory(selected.opname_id)
      await refreshSelected()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to populate.')
    } finally { setPopulating(false) }
  }

  const handleAddDetail = async (e) => {
    e.preventDefault()
    setAddError('')
    if (!addProduct.product_id) { setAddError('Select a product'); return }
    const goodQty    = parseFloat(addProduct.good_qty)
    const damagedQty = parseFloat(addProduct.damaged_qty) || 0
    if (isNaN(goodQty) || goodQty < 0)  { setAddError('Good quantity must be ≥ 0'); return }
    if (damagedQty < 0)                  { setAddError('Damaged quantity must be ≥ 0'); return }
    setAddLoading(true)
    try {
      await stockOpnamesAPI.addDetail(selected.opname_id, {
        product_id:  parseInt(addProduct.product_id),
        good_qty:    goodQty,
        damaged_qty: damagedQty,
        reason:      addProduct.reason  || null,
        remarks:     addProduct.remarks || null,
      })
      setAddProduct(emptyAdd())
      await refreshSelected()
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Failed to add product.')
    } finally { setAddLoading(false) }
  }

  const handleUpdateDetail = async (detailId, good_qty, damaged_qty, reason) => {
    try {
      await stockOpnamesAPI.updateDetail(selected.opname_id, detailId, { good_qty, damaged_qty, reason })
      await refreshSelected()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update.')
    }
  }

  const handleDeleteDetail = async (detailId) => {
    if (!window.confirm('Remove this product from the opname?')) return
    try {
      await stockOpnamesAPI.deleteDetail(selected.opname_id, detailId)
      await refreshSelected()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove.')
    }
  }

  const handleApprove = async () => {
    if (!window.confirm('Approve this Stock Opname? Inventory will be adjusted to match good (sellable) counts, and damaged items will be recorded separately.')) return
    setApproving(true)
    try {
      await stockOpnamesAPI.approve(selected.opname_id)
      await refreshSelected()
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to approve.')
    } finally { setApproving(false) }
  }

  const handleReject = async () => {
    if (!window.confirm('Reject this Stock Opname?')) return
    try {
      await stockOpnamesAPI.reject(selected.opname_id)
      await refreshSelected()
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to reject.')
    }
  }

  const handleDelete = async (id) => {
    await stockOpnamesAPI.delete(id)
    load()
  }

  // ── Opname summary stats ────────────────────────────────────────────────────
  const opnameSummary = (details) => {
    if (!details || details.length === 0) return null
    const withDiff    = details.filter(d => Math.abs(d.difference_qty) > 0.001)
    const withDamage  = details.filter(d => d.damaged_qty > 0.001)
    const totalDamage = details.reduce((s, d) => s + (d.damaged_qty || 0), 0)
    return { withDiff: withDiff.length, withDamage: withDamage.length, totalDamage }
  }

  const isEditable = selected && selected.status === 'Draft'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Stock Opname</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Physical count per warehouse — Good qty adjusts inventory, Damaged qty creates damage records
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setNewForm({ opname_date: new Date().toISOString().slice(0, 10), warehouse_id: '', store_id: '', remarks: '', performed_by: '' })
          setError('')
          setCreateModal(true)
        }}>
          + New Opname
        </button>
      </div>

      {/* ── List ── */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Warehouse</th><th>Performed By</th>
                <th>Products</th><th>Status</th><th>Approved By</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No opname sessions found. Create the first one.</td></tr>
              ) : items.map((item, i) => (
                <tr key={item.opname_id}>
                  <td style={{ color: '#94a3b8' }}>{(page - 1) * limit + i + 1}</td>
                  <td>{formatDate(item.opname_date)}</td>
                  <td style={{ fontWeight: 500 }}>{item.warehouse?.warehouse_name || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{item.performed_by || item.created_by || '—'}</td>
                  <td>
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600 }}>
                      {item.detail_count || 0}
                    </span>
                  </td>
                  <td><StatusBadge status={item.status} /></td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{item.approved_by || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontWeight: 600, fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '0.375rem', cursor: 'pointer' }}
                        onClick={() => openDetail(item)}
                      >
                        {item.status === 'Draft' ? 'Edit / Count' : 'View'}
                      </button>
                      {item.status === 'Draft' && (
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.opname_id)}>Del</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* ── Create Modal ── */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="New Stock Opname">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>{error}</div>
          )}
          <div>
            <label className="label">Opname Date *</label>
            <input className="input" type="date" required value={newForm.opname_date} onChange={e => setNewForm(f => ({ ...f, opname_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Warehouse *</label>
            <SearchableSelect
              endpoint="/warehouses"
              labelField="warehouse_name"
              valueField="warehouse_id"
              value={newForm.warehouse_id}
              onChange={v => setNewForm(f => ({ ...f, warehouse_id: v }))}
              placeholder="Select warehouse..."
              required
            />
            <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
              System quantities will be fetched from this warehouse's current inventory
            </p>
          </div>
          <div>
            <label className="label">Store (optional)</label>
            <SearchableSelect
              endpoint="/stores"
              labelField="store_name"
              valueField="store_id"
              value={newForm.store_id}
              onChange={v => setNewForm(f => ({ ...f, store_id: v }))}
              placeholder="Select store (optional)..."
            />
          </div>
          <div>
            <label className="label">Performed By</label>
            <input className="input" placeholder="Name of person performing the count" value={newForm.performed_by} onChange={e => setNewForm(f => ({ ...f, performed_by: e.target.value }))} />
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={newForm.remarks} onChange={e => setNewForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create Opname'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Detail / Count Modal ── */}
      <Modal open={detailModal} onClose={() => setDetailModal(false)} title={`Stock Opname — ${selected ? formatDate(selected.opname_date) : ''}`} size="xl">
        {selected && (() => {
          const summary = opnameSummary(selected.details)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Header info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                {[
                  ['Warehouse',     selected.warehouse?.warehouse_name || '—'],
                  ['Date',          formatDate(selected.opname_date)],
                  ['Performed By',  selected.performed_by || selected.created_by || '—'],
                  ['Status',        null],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ background: '#f8fafc', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{lbl}</div>
                    {val !== null
                      ? <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>{val}</div>
                      : <StatusBadge status={selected.status} />
                    }
                  </div>
                ))}
              </div>

              {/* Summary stats (Approved only) */}
              {selected.status === 'Approved' && summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.625rem 0.875rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Inventory Adjusted</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#166534' }}>{summary.withDiff} product(s)</div>
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', padding: '0.625rem 0.875rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Damage Recorded</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#9a3412' }}>{summary.withDamage} product(s) · {formatNumber(summary.totalDamage)} units</div>
                  </div>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem', padding: '0.625rem 0.875rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Approved By</div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0c4a6e' }}>{selected.approved_by || '—'}</div>
                  </div>
                </div>
              )}

              {/* Approve / Reject buttons */}
              {selected.status === 'Draft' && (
                <div style={{ display: 'flex', gap: '0.75rem', padding: '0.875rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem' }}>
                  <div style={{ flex: 1, fontSize: '0.8125rem', color: '#78350f' }}>
                    <strong>Ready to approve?</strong> Inventory will be updated to match <strong>Good Qty</strong> counts. Damaged items will be added to Damaged Stock records for traceability.
                  </div>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer', padding: '0.375rem 0.875rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600 }}
                    onClick={handleReject}
                  >Reject</button>
                  <button
                    className="btn"
                    style={{ background: '#16a34a', color: 'white', border: 'none', cursor: 'pointer', padding: '0.375rem 0.875rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600 }}
                    onClick={handleApprove}
                    disabled={approving}
                  >{approving ? 'Approving...' : 'Approve & Adjust Inventory'}</button>
                </div>
              )}

              {selected.status === 'Approved' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#166534', fontWeight: 500 }}>
                  This opname is approved. Inventory adjusted to good counts. Damaged items recorded in Damaged Stock.
                </div>
              )}

              {/* Add product form (Draft only) */}
              {isEditable && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      onClick={handlePopulate}
                      disabled={populating}
                    >
                      {populating ? 'Loading...' : '+ Auto-fill from Inventory'}
                    </button>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.6 }}>
                      Adds all products in this warehouse with system qty pre-filled as Good Qty (edit counts below)
                    </span>
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: '#64748b' }}>
                    <span><strong style={{ color: '#16a34a' }}>Good Qty</strong> — sellable units counted</span>
                    <span><strong style={{ color: '#d97706' }}>Damaged Qty</strong> — damaged units found (recorded separately, not double-deducted)</span>
                    <span><strong style={{ color: '#2563eb' }}>Difference</strong> = Good Qty − System Qty (this adjusts inventory)</span>
                  </div>

                  <form onSubmit={handleAddDetail} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {addError && (
                      <div style={{ width: '100%', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#dc2626', fontSize: '0.8rem' }}>{addError}</div>
                    )}
                    <div style={{ flex: '0 0 240px' }}>
                      <label className="label" style={{ fontSize: '0.72rem' }}>Product</label>
                      <SearchableSelect
                        endpoint="/products"
                        labelField="product_name"
                        valueField="product_id"
                        params={{ status: 'Active' }}
                        value={addProduct.product_id}
                        onChange={v => setAddProduct(p => ({ ...p, product_id: v }))}
                        placeholder="Select product..."
                      />
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <label className="label" style={{ fontSize: '0.72rem', color: '#15803d' }}>Good Qty</label>
                      <input
                        className="input" type="number" min="0" step="0.01"
                        value={addProduct.good_qty}
                        onChange={e => setAddProduct(p => ({ ...p, good_qty: e.target.value }))}
                        placeholder="e.g. 93"
                        style={{ borderColor: '#86efac' }}
                      />
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <label className="label" style={{ fontSize: '0.72rem', color: '#d97706' }}>Damaged Qty</label>
                      <input
                        className="input" type="number" min="0" step="0.01"
                        value={addProduct.damaged_qty}
                        onChange={e => setAddProduct(p => ({ ...p, damaged_qty: e.target.value }))}
                        placeholder="0"
                        style={{ borderColor: '#fcd34d' }}
                      />
                    </div>
                    <div style={{ flex: '0 0 150px' }}>
                      <label className="label" style={{ fontSize: '0.72rem' }}>Reason (if diff)</label>
                      <select className="input" value={addProduct.reason} onChange={e => setAddProduct(p => ({ ...p, reason: e.target.value }))}>
                        <option value="">No reason</option>
                        {DIFF_REASONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={addLoading} style={{ flexShrink: 0 }}>
                      {addLoading ? 'Adding...' : '+ Add'}
                    </button>
                  </form>
                </div>
              )}

              {/* Products table */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#1e293b', marginBottom: '0.5rem' }}>
                  Products ({selected.details?.length || 0})
                </div>
                {(!selected.details || selected.details.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '0.5rem', border: '1px dashed #d1d5db' }}>
                    No products added yet. Use "Auto-fill from Inventory" or add manually above.
                  </div>
                ) : (
                  <div className="table-container" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                    <table className="table" style={{ fontSize: '0.8125rem' }}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th style={{ textAlign: 'right' }}>System Qty</th>
                          <th style={{ textAlign: 'right', color: '#15803d' }}>Good Qty</th>
                          <th style={{ textAlign: 'right', color: '#d97706' }}>Damaged Qty</th>
                          <th style={{ textAlign: 'right' }}>Total Physical</th>
                          <th style={{ textAlign: 'right', color: '#2563eb' }}>Difference</th>
                          <th>Reason</th>
                          {isEditable && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {selected.details.map(d => (
                          <DetailRow
                            key={d.id}
                            detail={d}
                            editable={isEditable}
                            reasons={DIFF_REASONS}
                            onUpdate={handleUpdateDetail}
                            onDelete={handleDeleteDetail}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setDetailModal(false)}>Close</button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
      />
    </div>
  )
}

// ── Editable detail row ────────────────────────────────────────────────────────
function DetailRow({ detail, editable, reasons, onUpdate, onDelete }) {
  const [editing,    setEditing]    = useState(false)
  const [goodQty,    setGoodQty]    = useState(String(detail.good_qty ?? detail.physical_qty))
  const [damagedQty, setDamagedQty] = useState(String(detail.damaged_qty ?? 0))
  const [reason,     setReason]     = useState(detail.reason || '')

  const previewGoodDiff = parseFloat(goodQty || 0) - detail.system_qty

  const save = async () => {
    const gq = parseFloat(goodQty)
    const dq = parseFloat(damagedQty) || 0
    if (isNaN(gq) || gq < 0) return
    if (dq < 0) return
    await onUpdate(detail.id, gq, dq, reason || null)
    setEditing(false)
  }

  const cancel = () => {
    setGoodQty(String(detail.good_qty ?? detail.physical_qty))
    setDamagedQty(String(detail.damaged_qty ?? 0))
    setReason(detail.reason || '')
    setEditing(false)
  }

  const inputStyle = (green) => ({
    width: '80px',
    padding: '0.25rem 0.375rem',
    border: `1px solid ${green ? '#86efac' : '#fcd34d'}`,
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    textAlign: 'right',
  })

  const goodQtyDisplay  = detail.good_qty    ?? detail.physical_qty
  const damagedDisplay  = detail.damaged_qty ?? 0
  const physicalDisplay = goodQtyDisplay + damagedDisplay

  if (editing) {
    return (
      <tr style={{ background: '#fafafa' }}>
        <td style={{ fontWeight: 500 }}>{detail.product?.product_name || `#${detail.product_id}`}</td>
        <td style={{ textAlign: 'right' }}>{formatNumber(detail.system_qty)}</td>
        <td style={{ textAlign: 'right' }}>
          <input
            type="number" min="0" step="0.01"
            value={goodQty}
            onChange={e => setGoodQty(e.target.value)}
            style={inputStyle(true)}
          />
        </td>
        <td style={{ textAlign: 'right' }}>
          <input
            type="number" min="0" step="0.01"
            value={damagedQty}
            onChange={e => setDamagedQty(e.target.value)}
            style={inputStyle(false)}
          />
        </td>
        <td style={{ textAlign: 'right', color: '#94a3b8', fontSize: '0.75rem' }}>
          {formatNumber((parseFloat(goodQty) || 0) + (parseFloat(damagedQty) || 0))}
        </td>
        <td style={{ textAlign: 'right' }}>
          <DiffBadge diff={previewGoodDiff} />
        </td>
        <td>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}>
            <option value="">No reason</option>
            {reasons.map(r => <option key={r}>{r}</option>)}
          </select>
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button onClick={save} style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '0.25rem', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            <button onClick={cancel} style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: '#f1f5f9', color: '#64748b', border: '1px solid #d1d5db', borderRadius: '0.25rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{detail.product?.product_name || `#${detail.product_id}`}</td>
      <td style={{ textAlign: 'right' }}>{formatNumber(detail.system_qty)}</td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }}>{formatNumber(goodQtyDisplay)}</td>
      <td style={{ textAlign: 'right', fontWeight: damagedDisplay > 0 ? 600 : 400, color: damagedDisplay > 0 ? '#c2410c' : '#94a3b8' }}>
        {damagedDisplay > 0 ? formatNumber(damagedDisplay) : '—'}
      </td>
      <td style={{ textAlign: 'right', color: '#64748b', fontSize: '0.75rem' }}>{formatNumber(physicalDisplay)}</td>
      <td style={{ textAlign: 'right' }}><DiffBadge diff={detail.difference_qty} /></td>
      <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{detail.reason || '—'}</td>
      {editable && (
        <td>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button onClick={() => setEditing(true)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '0.25rem', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
            <button onClick={() => onDelete(detail.id)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.25rem', cursor: 'pointer', fontWeight: 600 }}>✕</button>
          </div>
        </td>
      )}
    </tr>
  )
}
