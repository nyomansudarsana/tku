export default function Pagination({ page, total, limit, onChange }) {
  const totalPages = Math.ceil(total / limit)
  if (totalPages <= 1) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
      <span>Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}</span>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="btn btn-secondary btn-sm">‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let p = page <= 3 ? i + 1 : page + i - 2
          if (p > totalPages) return null
          return (
            <button key={p} onClick={() => onChange(p)} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}>{p}</button>
          )
        })}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="btn btn-secondary btn-sm">›</button>
      </div>
    </div>
  )
}
