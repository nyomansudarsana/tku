/**
 * Export rows to a CSV file download.
 * @param {Object[]} rows  - Array of plain objects (one per data row)
 * @param {string[]} cols  - Column keys to include, in order
 * @param {Object}  labels - Optional map of col key → header label
 * @param {string}  filename - Download filename (no extension needed)
 */
export function exportCsv(rows, cols, labels = {}, filename = 'export') {
  const header = cols.map(c => labels[c] || c)
  const lines = [
    header.join(','),
    ...rows.map(row =>
      cols.map(c => {
        const val = row[c] ?? ''
        const str = String(val).replace(/"/g, '""')
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
      }).join(',')
    ),
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
