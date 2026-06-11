export const formatCurrency = (value) => {
  if (value == null) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value)
}

export const formatNumber = (value) => {
  if (value == null) return '0'
  return new Intl.NumberFormat('id-ID').format(value)
}

export const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('id-ID')
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
