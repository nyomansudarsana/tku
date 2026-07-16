// pageSizeOptions/onLimitChange are optional — pages that don't pass them
// keep the exact previous behavior (no size selector rendered).
export default function Pagination({ page, total, limit, onChange, pageSizeOptions, onLimitChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const showPager = totalPages > 1

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280', flexWrap: 'wrap', gap: '0.75rem' }}>
      <span>
        {total > 0
          ? `Showing ${((page - 1) * limit) + 1}–${Math.min(page * limit, total)} of ${total}`
          : 'No records'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        {pageSizeOptions && onLimitChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            Rows per page:
            <select
              className="input"
              style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
              value={limit}
              onChange={e => onLimitChange(parseInt(e.target.value))}
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {showPager && (
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
        )}
      </div>
    </div>
  )
}
