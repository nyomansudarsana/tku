// Shared blob-download helper for backend-generated file exports (xlsx, pdf, etc.)
// — same createObjectURL/<a download>/revokeObjectURL sequence used across
// the report pages, factored out so every filtered-export button stays consistent.
export function downloadBlob(data, filename, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const blob = new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
