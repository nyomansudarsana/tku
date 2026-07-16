import Modal from './Modal'
import { formatDate, formatNumber } from '../utils/format'

const COMPANY = {
  name:    'Tech Kiosk Ubud',
  address: 'Jl. Raya Ubud, Ubud, Bali 80571, Indonesia',
  phone:   '+62 813-3874-0003',
  email:   'info@tku.id',
}

// ── Inline styles (mirrors InvoiceModal's print pattern) ──────────────────────
const S = {
  page:       { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', color: '#1e293b', maxWidth: '900px', margin: '0 auto', padding: '32px 40px', background: 'white' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #2563eb', paddingBottom: '20px', marginBottom: '24px' },
  companyMeta:{ fontSize: '11px', color: '#64748b', lineHeight: '1.6', marginTop: '4px' },
  titleBadge: { textAlign: 'right' },
  titleText:  { fontSize: '15px', fontWeight: '700', color: '#2563eb', marginBottom: '4px' },
  titleDate:  { fontSize: '11px', color: '#64748b' },
  section:    { marginBottom: '20px' },
  sectionTitle:{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
  infoGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  infoBox:    { background: '#f8fafc', borderRadius: '6px', padding: '12px 16px' },
  infoRow:    { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px' },
  infoLabel:  { color: '#64748b', fontWeight: '400' },
  infoValue:  { color: '#1e293b', fontWeight: '500', textAlign: 'right' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '24px' },
  th:         { background: '#1e3a5f', color: 'white', padding: '8px 10px', textAlign: 'left', fontWeight: '600', fontSize: '10.5px' },
  thRight:    { background: '#1e3a5f', color: 'white', padding: '8px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10.5px' },
  td:         { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  tdRight:    { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', verticalAlign: 'top' },
  signRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '48px' },
  signBox:    { textAlign: 'center' },
  signLine:   { borderTop: '1px solid #94a3b8', marginTop: '48px', paddingTop: '6px', fontSize: '11px', color: '#475569' },
  footer:     { borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '24px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' },
}

function BreakdownList({ detail }) {
  if (!detail.breakdown || detail.breakdown.length === 0) return <span>—</span>
  return (
    <ul style={{ margin: 0, paddingLeft: '14px', listStyle: 'none' }}>
      {detail.breakdown.map(b => (
        <li key={b.breakdown_id ?? `${b.category}-${b.quantity}`}>
          - {b.category}: {b.quantity}{b.notes ? ` (${b.notes})` : ''}
        </li>
      ))}
    </ul>
  )
}

function OpnamePrintContent({ opname }) {
  if (!opname) return null
  const details = opname.details || []

  return (
    <div style={S.page} id="tku-opname-printable">
      {/* Header */}
      <div style={S.header}>
        <div>
          <img
            src="/assets/logo/kopernik-logo.png"
            alt="PT Kopernik"
            onError={e => { e.currentTarget.src = '/assets/logo/kopernik-logo.svg' }}
            style={{ display: 'block', height: '46px', width: 'auto', maxWidth: 'none', objectFit: 'contain', marginBottom: '8px' }}
          />
          <div style={S.companyMeta}>
            {COMPANY.address}<br />
            Tel: {COMPANY.phone} · Email: {COMPANY.email}
          </div>
        </div>
        <div style={S.titleBadge}>
          <div style={S.titleText}>Stock Opname Report #{opname.opname_id}</div>
          <div style={S.titleDate}>Date: {formatDate(opname.opname_date)}</div>
          <div style={{ ...S.titleDate, marginTop: '4px' }}>
            <span style={{
              background: opname.status === 'Approved' ? '#dcfce7' : opname.status === 'Rejected' ? '#fee2e2' : '#eff6ff',
              color:      opname.status === 'Approved' ? '#15803d' : opname.status === 'Rejected' ? '#dc2626' : '#2563eb',
              padding: '2px 8px', borderRadius: '4px', fontWeight: '600', fontSize: '10px',
            }}>{opname.status}</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Opname Information</div>
        <div style={S.infoGrid}>
          <div style={S.infoBox}>
            {[
              ['Warehouse', opname.warehouse?.warehouse_name || '—'],
              ['Store',     opname.store?.store_name || '—'],
            ].map(([l, v]) => (
              <div key={l} style={S.infoRow}><span style={S.infoLabel}>{l}</span><span style={S.infoValue}>{v}</span></div>
            ))}
          </div>
          <div style={S.infoBox}>
            {[
              ['Opname Date', formatDate(opname.opname_date)],
              ['Status',      opname.status],
            ].map(([l, v]) => (
              <div key={l} style={S.infoRow}><span style={S.infoLabel}>{l}</span><span style={S.infoValue}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Count Details</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Product</th>
              <th style={S.thRight}>System Qty</th>
              <th style={S.thRight}>Physical Qty</th>
              <th style={S.thRight}>Variance</th>
              <th style={S.th}>Variance Breakdown</th>
              <th style={S.th}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => (
              <tr key={d.id}>
                <td style={S.td}>{d.product?.product_name || `Product #${d.product_id}`}</td>
                <td style={S.tdRight}>{formatNumber(d.system_qty)}</td>
                <td style={S.tdRight}>{formatNumber(d.physical_qty)}</td>
                <td style={{ ...S.tdRight, fontWeight: '700', color: d.difference_qty < 0 ? '#dc2626' : d.difference_qty > 0 ? '#16a34a' : '#64748b' }}>
                  {d.difference_qty > 0 ? '+' : ''}{formatNumber(d.difference_qty)}
                </td>
                <td style={S.td}><BreakdownList detail={d} /></td>
                <td style={S.td}>{d.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Header Remarks */}
      {opname.remarks && (
        <div style={{ ...S.infoBox, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>Remarks</div>
          <div style={{ fontSize: '12px' }}>{opname.remarks}</div>
        </div>
      )}

      {/* Signatures */}
      <div style={S.signRow}>
        <div style={S.signBox}>
          <div style={S.signLine}>Prepared By{opname.performed_by ? `: ${opname.performed_by}` : ''}</div>
        </div>
        <div style={S.signBox}>
          <div style={S.signLine}>Approved By{opname.approved_by ? `: ${opname.approved_by}` : ''}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <div>{COMPANY.name} · {COMPANY.email}</div>
        <div style={{ marginTop: '4px' }}>This report was generated electronically and is valid without a signature.</div>
      </div>
    </div>
  )
}

export default function StockOpnamePrintModal({ open, onClose, opname }) {
  const handlePrint = () => {
    const el = document.getElementById('tku-opname-printable')
    if (!el) return

    const printStyles = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 15mm; size: A4; }
      img { display: block; max-width: 100%; }
      img[alt="PT Kopernik"] { height: 46px; width: auto; max-width: none; object-fit: contain; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    `
    const origin    = window.location.origin
    const printHtml = el.outerHTML.replace(/src="(\/[^"]+)"/g, (_, p) => `src="${origin}${p}"`)

    const win = window.open('', '_blank', 'width=1000,height=1200,scrollbars=yes')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Stock Opname #${opname?.opname_id ?? ''}</title>
      <style>${printStyles}</style>
    </head><body>${printHtml}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  return (
    <Modal open={open} onClose={onClose} title="Stock Opname Report Preview" size="xl">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
        <button onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#2563eb', color: 'white', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Export PDF
        </button>
        <button onClick={onClose}
          style={{ background: '#f1f5f9', color: '#374151', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '0.5rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}>
          Close
        </button>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'auto', maxHeight: '70vh', background: '#f8fafc', padding: '16px' }}>
        <OpnamePrintContent opname={opname} />
      </div>
    </Modal>
  )
}
