import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsAPI } from '../api'

const POLL_MS = 60_000

export default function NotificationBell() {
  const [summary, setSummary] = useState(null)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const containerRef = useRef(null)

  const load = useCallback(() => {
    notificationsAPI.summary().then(res => setSummary(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const total = summary?.total_badge_count || 0

  const go = (path) => {
    setOpen(false)
    navigate(path)
  }

  const Row = ({ label, count, onClick }) => {
    if (!count) return null
    return (
      <button
        onClick={onClick}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontSize: '0.8125rem', color: '#1e293b',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span>{label}</span>
        <span style={{
          background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: '0.72rem',
          borderRadius: '999px', padding: '0.1rem 0.5rem', minWidth: '1.25rem', textAlign: 'center',
        }}>{count}</span>
      </button>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem', border: '1px solid transparent',
          background: open ? '#f1f5f9' : 'none', cursor: 'pointer', color: '#4b5563',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && (
          <span style={{
            position: 'absolute', top: '2px', right: '2px', background: '#dc2626', color: 'white',
            borderRadius: '999px', fontSize: '0.6rem', fontWeight: 700, minWidth: '1.05rem', height: '1.05rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 0.5rem)',
          background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.625rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', minWidth: '17rem', zIndex: 100, overflow: 'hidden',
        }}>
          <div style={{ padding: '0.75rem 0.875rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '0.8125rem', color: '#1e293b' }}>
            Notifications
          </div>
          {total === 0 ? (
            <div style={{ padding: '1rem 0.875rem', fontSize: '0.8125rem', color: '#94a3b8' }}>Nothing needs your attention.</div>
          ) : (
            <div style={{ padding: '0.25rem 0' }}>
              <Row label="Stock Opname awaiting approval" count={summary?.pending_approval?.stock_opname_count}
                onClick={() => go('/stock-opname?status=Draft')} />
              <Row label="Supplier Returns awaiting action" count={summary?.pending_approval?.supplier_return_count}
                onClick={() => go('/supplier-returns?status=Pending')} />
              <Row label="Low Stock Products" count={summary?.low_stock?.count}
                onClick={() => go('/')} />
              <Row label="Rejected Products Awaiting Supplier Return" count={summary?.urgent?.rejected_awaiting_return_count}
                onClick={() => go('/receiving?has_rejected=true')} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
