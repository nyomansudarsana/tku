import { useRef } from 'react'
import Modal from './Modal'
import { formatCurrency, formatDate } from '../utils/format'

const VAT_RATE = 0.11
const COMPANY = {
  name: 'Tech Kiosk Ubud',
  address: 'Jl. Raya Ubud, Ubud, Bali 80571, Indonesia',
  phone: '+62 813-3874-0003',
  email: 'info@tku.id',
  website: 'www.tku.id',
}

const invoiceNumber = (sale) => {
  if (!sale) return ''
  const d = new Date(sale.sales_date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `INV/${year}/${month}/${String(sale.sales_id).padStart(4, '0')}`
}

const vatBreakdown = (sale) => {
  // Use stored values if available (set by the correct VAT calculation)
  if (sale.vat_amount != null && sale.vat_amount > 0) {
    return { base: Math.round(sale.grand_total - sale.vat_amount), vat: Math.round(sale.vat_amount) }
  }
  // Fallback for legacy records: extract VAT from grand_total
  const vat = sale.grand_total * VAT_RATE / (1 + VAT_RATE)
  return { base: Math.round(sale.grand_total - vat), vat: Math.round(vat) }
}

// ── Inline styles (safe to copy into print window) ───────────────────────────
const S = {
  page: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', color: '#1e293b', maxWidth: '720px', margin: '0 auto', padding: '32px 40px', background: 'white' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #2563eb', paddingBottom: '20px', marginBottom: '24px' },
  logo: { fontSize: '22px', fontWeight: '800', color: '#2563eb', letterSpacing: '-0.5px' },
  companyMeta: { fontSize: '11px', color: '#64748b', lineHeight: '1.6', marginTop: '4px' },
  invoBadge: { textAlign: 'right' },
  invoNum: { fontSize: '15px', fontWeight: '700', color: '#2563eb', marginBottom: '4px' },
  invoDate: { fontSize: '11px', color: '#64748b' },
  section: { marginBottom: '20px' },
  sectionTitle: { fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  infoBox: { background: '#f8fafc', borderRadius: '6px', padding: '12px 16px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px' },
  infoLabel: { color: '#64748b', fontWeight: '400' },
  infoValue: { color: '#1e293b', fontWeight: '500', textAlign: 'right' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '24px' },
  th: { background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'left', fontWeight: '600', fontSize: '11px' },
  thRight: { background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: '600', fontSize: '11px' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  tdRight: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', verticalAlign: 'top' },
  calcBox: { maxWidth: '300px', marginLeft: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' },
  calcRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 16px', fontSize: '12px' },
  calcDivider: { borderTop: '1px solid #e2e8f0', margin: 0 },
  grandRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#1e3a5f', color: 'white' },
  grandLabel: { fontWeight: '700', fontSize: '14px' },
  grandValue: { fontWeight: '800', fontSize: '16px' },
  vatNote: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px 14px', fontSize: '11px', color: '#1e40af', marginBottom: '20px' },
  bankBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px' },
  bankTitle: { fontWeight: '700', color: '#15803d', fontSize: '12px', marginBottom: '8px' },
  bankRow: { display: 'flex', gap: '8px', fontSize: '12px', padding: '2px 0' },
  bankLabel: { color: '#64748b', minWidth: '130px' },
  bankValue: { color: '#1e293b', fontWeight: '600' },
  footer: { borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '32px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' },
}

function InvoiceContent({ sale }) {
  if (!sale) return null
  const invNum = invoiceNumber(sale)
  const { base, vat } = vatBreakdown(sale)

  return (
    <div style={S.page} id="tku-invoice-printable">
      {/* Header */}
      <div style={S.header}>
        <div>
          <img
            src="/assets/logo/kopernik-logo.png"
            alt="PT Kopernik"
            onError={e => { e.currentTarget.src = '/assets/logo/kopernik-logo.svg' }}
            style={{
              display: 'block',
              height: '46px',
              width: 'auto',
              maxWidth: 'none',
              objectFit: 'contain',
              marginBottom: '8px',
            }}
          />
          <div style={S.companyMeta}>
            {COMPANY.address}<br />
            Tel: {COMPANY.phone} · Email: {COMPANY.email}
          </div>
        </div>
        <div style={S.invoBadge}>
          <div style={S.invoNum}>{invNum}</div>
          <div style={S.invoDate}>Date: {formatDate(sale.sales_date)}</div>
          <div style={{ ...S.invoDate, marginTop: '4px' }}>
            <span style={{ background: sale.payment_status === 'Paid' ? '#dcfce7' : sale.payment_status === 'Unpaid' ? '#fee2e2' : '#fef9c3', color: sale.payment_status === 'Paid' ? '#15803d' : sale.payment_status === 'Unpaid' ? '#dc2626' : '#854d0e', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', fontSize: '10px' }}>
              {sale.payment_status}
            </span>
          </div>
        </div>
      </div>

      {/* Transaction Info */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Transaction Information</div>
        <div style={S.infoGrid}>
          <div style={S.infoBox}>
            {[
              ['Store', sale.store?.store_name || '—'],
              ['Customer', sale.customer_name || 'Walk-in Customer'],
              ['Payment Method', sale.payment_method],
            ].map(([l, v]) => (
              <div key={l} style={S.infoRow}><span style={S.infoLabel}>{l}</span><span style={S.infoValue}>{v}</span></div>
            ))}
          </div>
          <div style={S.infoBox}>
            {[
              ['Invoice No.', invNum],
              ['Invoice Date', formatDate(sale.sales_date)],
              ['Payment Status', sale.payment_status],
            ].map(([l, v]) => (
              <div key={l} style={S.infoRow}><span style={S.infoLabel}>{l}</span><span style={S.infoValue}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Product Table */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Product Details</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Product</th>
              <th style={{ ...S.th, textAlign: 'center', width: '70px' }}>Qty</th>
              <th style={S.thRight}>Unit Price (Incl. VAT)</th>
              <th style={S.thRight}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.td}>{sale.product?.product_name || '—'}</td>
              <td style={{ ...S.td, textAlign: 'center' }}>{sale.quantity} {sale.unit}</td>
              <td style={S.tdRight}>{formatCurrency(sale.sale_price)}</td>
              <td style={S.tdRight}>{formatCurrency(sale.subtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Calculation Breakdown */}
      <div style={S.section}>
        <div style={S.calcBox}>
          <div style={S.calcRow}><span style={{ color: '#64748b' }}>Subtotal (Incl. VAT)</span><span style={{ fontWeight: 500 }}>{formatCurrency(sale.subtotal)}</span></div>
          {sale.discount_pct > 0 && (
            <div style={{ ...S.calcRow, color: '#dc2626' }}>
              <span>Discount ({sale.discount_pct}% on base price)</span>
              <span>- {formatCurrency(sale.discount_amount)}</span>
            </div>
          )}
          <div style={S.calcRow}><span style={{ color: '#64748b' }}>VAT 11% (PPN)</span><span style={{ fontWeight: 500 }}>{formatCurrency(vat)}</span></div>
          <div style={S.calcDivider} />
          <div style={S.grandRow}>
            <span style={S.grandLabel}>Grand Total</span>
            <span style={S.grandValue}>{formatCurrency(sale.grand_total)}</span>
          </div>
        </div>
      </div>

      {/* VAT Info */}
      <div style={S.vatNote}>
        <strong>VAT Information:</strong> Product selling price already includes 11% VAT (PPN).<br />
        VAT portion in this invoice: <strong>{formatCurrency(vat)}</strong> (Base price: {formatCurrency(base)})
      </div>

      {/* Bank Transfer Info */}
      {sale.payment_method === 'Bank Transfer' && sale.bank_account && (
        <div style={S.bankBox}>
          <div style={S.bankTitle}>Transfer Payment Instructions</div>
          {[
            ['Bank Name', sale.bank_account.bank_name],
            ['Account Number', sale.bank_account.account_number],
            ['Beneficiary Name', sale.bank_account.beneficiary_name],
            ...(sale.transfer_reference ? [['Transfer Reference', sale.transfer_reference]] : []),
          ].map(([l, v]) => (
            <div key={l} style={S.bankRow}>
              <span style={S.bankLabel}>{l}</span>
              <span style={S.bankValue}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* EDC Info */}
      {sale.payment_method === 'EDC' && (sale.edc_receipt_number || sale.edc_special_code) && (
        <div style={{ ...S.bankBox, background: '#f0f9ff', borderColor: '#bae6fd' }}>
          <div style={{ ...S.bankTitle, color: '#0369a1' }}>EDC Payment Details</div>
          {sale.edc_receipt_number && <div style={S.bankRow}><span style={S.bankLabel}>EDC Receipt Number</span><span style={S.bankValue}>{sale.edc_receipt_number}</span></div>}
          {sale.edc_special_code && <div style={S.bankRow}><span style={S.bankLabel}>EDC Special Code</span><span style={S.bankValue}>{sale.edc_special_code}</span></div>}
        </div>
      )}

      {/* Remarks */}
      {sale.remarks && (
        <div style={{ ...S.vatNote, background: '#fefce8', borderColor: '#fde68a', color: '#92400e' }}>
          <strong>Notes:</strong> {sale.remarks}
        </div>
      )}

      {/* Footer */}
      <div style={S.footer}>
        <div>Thank you for your purchase! · {COMPANY.name} · {COMPANY.email}</div>
        <div style={{ marginTop: '4px' }}>This invoice was generated electronically and is valid without a signature.</div>
      </div>
    </div>
  )
}

export default function InvoiceModal({ open, onClose, sale }) {
  const contentRef = useRef(null)

  const handlePrint = () => {
    const el = document.getElementById('tku-invoice-printable')
    if (!el) return

    const printStyles = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 15mm; size: A4; }
      img { display: block; max-width: 100%; }
      img[alt="PT Kopernik"] { height: 46px; width: auto; max-width: none; object-fit: contain; }
    `

    // Rewrite all relative asset paths to absolute URLs for the about:blank print window
    const origin = window.location.origin
    const printHtml = el.outerHTML.replace(
      /src="(\/[^"]+)"/g,
      (_, path) => `src="${origin}${path}"`
    )
    const win = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${invoiceNumber(sale)}</title>
      <style>${printStyles}</style>
    </head><body>${printHtml}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 600)
  }

  return (
    <Modal open={open} onClose={onClose} title="Invoice Preview" size="xl">
      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#2563eb', color: 'white', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          Print Invoice
        </button>
        <button onClick={onClose} style={{ background: '#f1f5f9', color: '#374151', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '0.5rem', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}>
          Close
        </button>
      </div>

      {/* Invoice preview */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'auto', maxHeight: '70vh', background: '#f8fafc', padding: '16px' }} ref={contentRef}>
        <InvoiceContent sale={sale} />
      </div>
    </Modal>
  )
}
