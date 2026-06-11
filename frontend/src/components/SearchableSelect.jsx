import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'

/**
 * SearchableSelect — drop-in replacement for AsyncDropdown with full-text search,
 * keyboard navigation, clear button, and loading indicator.
 *
 * Props (same interface as AsyncDropdown):
 *   endpoint     string   — API path, e.g. "/products"
 *   labelField   string   — object key used as display label
 *   valueField   string   — object key used as option value
 *   value        string   — currently selected value (stringified)
 *   onChange     fn(value, fullOption) — called on selection or clear
 *   placeholder  string   — shown when nothing selected
 *   params       object   — extra query params passed to the API
 *   emptyHint    string   — shown when the list is empty
 *   required     bool     — adds hidden required input for form validation
 *   disabled     bool
 *   allowClear   bool     — shows ✕ button when value selected (default true)
 *   className    string
 *   style        object
 */
export default function SearchableSelect({
  endpoint,
  labelField,
  valueField,
  value,
  onChange,
  placeholder = 'Select...',
  params = {},
  emptyHint,
  required = false,
  disabled = false,
  allowClear = true,
  className = '',
  style = {},
}) {
  const [isOpen,      setIsOpen]      = useState(false)
  const [search,      setSearch]      = useState('')
  const [options,     setOptions]     = useState([])
  const [status,      setStatus]      = useState('idle')   // idle | loading | ok | error | empty
  const [label,       setLabel]       = useState('')
  const [highlighted, setHighlighted] = useState(-1)

  const containerRef = useRef(null)
  const searchRef    = useRef(null)
  const listRef      = useRef(null)

  const paramsKey = JSON.stringify(params ?? {})

  // ── Load options ────────────────────────────────────────────────────────────
  const loadOptions = useCallback(async () => {
    setStatus('loading')
    setHighlighted(-1)
    try {
      const mergedParams = { ...(params ?? {}), limit: 2000 }
      const res  = await api.get(endpoint, { params: mergedParams })
      const data = res.data?.items ?? res.data
      const list = Array.isArray(data) ? data : []
      setOptions(list)
      setStatus(list.length === 0 ? 'empty' : 'ok')
    } catch {
      setOptions([])
      setStatus('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, paramsKey])

  // Reset options when params change (forces re-fetch on next open)
  useEffect(() => {
    setOptions([])
    setStatus('idle')
  }, [paramsKey])

  // Update displayed label when value or options change
  useEffect(() => {
    if (!value) { setLabel(''); return }
    const found = options.find(o => String(o[valueField]) === String(value))
    if (found) setLabel(found[labelField])
  }, [value, options, valueField, labelField])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close()
      }
    }
    if (isOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]')
      items[highlighted]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const filtered = options.filter(o =>
    String(o[labelField] ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const open = () => {
    if (disabled) return
    setIsOpen(true)
    setSearch('')
    if (status === 'idle' || options.length === 0) loadOptions()
    setTimeout(() => searchRef.current?.focus(), 30)
  }

  const close = () => {
    setIsOpen(false)
    setSearch('')
    setHighlighted(-1)
  }

  const selectOption = (opt) => {
    onChange(String(opt[valueField]), opt)
    setLabel(opt[labelField])
    close()
  }

  const clearSelection = (e) => {
    e.stopPropagation()
    onChange('', null)
    setLabel('')
  }

  const handleKeyDown = (e) => {
    if (!isOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted >= 0 && filtered[highlighted]) selectOption(filtered[highlighted])
    } else if (e.key === 'Escape') {
      close()
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', ...style }}>

      {/* ── Trigger button ── */}
      <div
        onClick={open}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           '0.25rem',
          padding:       '0.5rem 0.625rem',
          border:        `1px solid ${isOpen ? '#2563eb' : '#d1d5db'}`,
          borderRadius:  '0.5rem',
          background:    disabled ? '#f9fafb' : 'white',
          cursor:        disabled ? 'not-allowed' : 'pointer',
          fontSize:      '0.875rem',
          color:         label ? '#1e293b' : '#94a3b8',
          minHeight:     '2.375rem',
          opacity:       disabled ? 0.6 : 1,
          outline:       'none',
          transition:    'border-color 0.15s',
          boxShadow:     isOpen ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
          userSelect:    'none',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label || placeholder}
        </span>
        {value && allowClear && !disabled && (
          <span
            onClick={clearSelection}
            title="Clear selection"
            style={{ cursor: 'pointer', color: '#94a3b8', flexShrink: 0, lineHeight: 1, fontSize: '0.75rem', padding: '0 2px' }}
          >
            ✕
          </span>
        )}
        <span style={{ color: '#94a3b8', fontSize: '0.65rem', flexShrink: 0, marginLeft: '2px', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </div>

      {/* ── Dropdown panel ── */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position:     'absolute',
            top:          'calc(100% + 3px)',
            left:         0,
            right:        0,
            background:   'white',
            border:       '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            boxShadow:    '0 8px 32px rgba(0,0,0,0.12)',
            zIndex:       1050,
            overflow:     'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setHighlighted(0) }}
              onKeyDown={handleKeyDown}
              placeholder="Type to search..."
              style={{
                width:        '100%',
                padding:      '0.375rem 0.625rem',
                border:       '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize:     '0.8125rem',
                outline:      'none',
                boxSizing:    'border-box',
                background:   'white',
              }}
            />
          </div>

          {/* Options list */}
          <div ref={listRef} style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {status === 'loading' && (
              <div style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                Loading...
              </div>
            )}
            {status === 'error' && (
              <div style={{ padding: '0.75rem 1rem', color: '#dc2626', fontSize: '0.8125rem' }}>
                Failed to load options. Try again.
              </div>
            )}
            {(status === 'ok' || status === 'empty') && filtered.length === 0 && (
              <div style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                {search ? `No results for "${search}"` : (emptyHint || 'No options available')}
              </div>
            )}
            {filtered.map((opt, i) => {
              const isSelected    = String(opt[valueField]) === String(value)
              const isHighlighted = highlighted === i
              return (
                <div
                  key={String(opt[valueField])}
                  data-option
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(opt)}
                  onMouseEnter={() => setHighlighted(i)}
                  style={{
                    padding:    '0.5rem 0.875rem',
                    fontSize:   '0.8125rem',
                    cursor:     'pointer',
                    background: isHighlighted ? '#eff6ff' : isSelected ? '#f0fdf4' : 'transparent',
                    color:      isHighlighted ? '#1d4ed8'  : isSelected ? '#166534' : '#1e293b',
                    fontWeight: isSelected ? 600 : 400,
                    borderLeft: isSelected ? '3px solid #16a34a' : '3px solid transparent',
                    transition: 'background 0.08s',
                  }}
                >
                  {opt[labelField]}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Hidden input for native form required validation */}
      {required && (
        <input
          tabIndex={-1}
          value={value || ''}
          required
          onChange={() => {}}
          style={{ position: 'absolute', bottom: 0, left: '50%', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}
