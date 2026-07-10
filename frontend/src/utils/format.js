export const formatCurrency = (value) => {
  if (value == null) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value)
}

export const formatNumber = (value) => {
  if (value == null) return '0'
  return new Intl.NumberFormat('id-ID').format(value)
}

// The backend stores/serializes timestamps as naive UTC (datetime.utcnow(),
// no 'Z'/offset suffix) — e.g. "2026-07-10T16:42:11.123456". new Date(...)
// on a string with no timezone marker is parsed as LOCAL time by the JS spec,
// so a UTC afternoon/evening timestamp (Indonesian nighttime/early-morning)
// silently renders one calendar day early. Date-only strings ("YYYY-MM-DD",
// e.g. sales_date/received_date) are unaffected — the spec already parses
// those as UTC midnight — so only append 'Z' when a time component is
// present and no timezone marker already exists.
const parseServerDate = (dateStr) => {
  const needsUtcMarker = /T\d{2}:\d{2}/.test(dateStr) && !/[Zz]$|[+-]\d{2}:\d{2}$/.test(dateStr)
  return new Date(needsUtcMarker ? `${dateStr}Z` : dateStr)
}

export const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return parseServerDate(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return parseServerDate(dateStr).toLocaleString('id-ID')
}

export const paymentStatusBadge = (status) => {
  const map = { Paid: 'badge-green', Unpaid: 'badge-red', Partial: 'badge-yellow' }
  return map[status] || 'badge-gray'
}

export const stockBadge = (qty) => {
  if (qty <= 0) return 'badge-red'
  if (qty <= 5) return 'badge-yellow'
  return 'badge-green'
}
