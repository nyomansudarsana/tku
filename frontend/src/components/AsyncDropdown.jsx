import { useState, useEffect, useRef } from 'react'
import api from '../api/client'

/**
 * AsyncDropdown
 *
 * Fetches options from the backend on mount, handles loading / error / empty
 * states, and surfaces a consistent <select> interface to the caller.
 *
 * Props
 * ─────
 * endpoint     string   e.g. "/products"
 * labelField   string   field shown as option text   (default "name")
 * valueField   string   field used as option value   (default "id")
 * value        any      controlled value
 * onChange     fn       called with the raw string value from the <select>
 * placeholder  string   first disabled option text
 * required     bool
 * disabled     bool
 * params       object   extra query params merged into the fetch
 * emptyHint    string   shown when the table is genuinely empty
 * className    string   extra class names forwarded to the <select>
 * style        object   extra inline styles forwarded to the <select>
 */
export default function AsyncDropdown({
  endpoint,
  labelField = 'name',
  valueField = 'id',
  value = '',
  onChange,
  onSelect,
  placeholder = 'Select...',
  required = false,
  disabled = false,
  params = {},
  emptyHint,
  className = '',
  style = {},
  formatLabel = null,  // optional: (opt) => string — overrides labelField for display
}) {
  const [options, setOptions] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ok | error | empty
  const paramsKey = JSON.stringify(params ?? {})
  const abortRef = useRef(null)

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('loading')
    api
      .get(endpoint, { params: { limit: 2000, ...params }, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return
        const items = res.data?.items ?? res.data ?? []
        setOptions(items)
        setStatus(items.length === 0 ? 'empty' : 'ok')
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED' || controller.signal.aborted) return
        console.error(`AsyncDropdown [${endpoint}] fetch error:`, err)
        setStatus('error')
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, paramsKey])

  const isDisabled = disabled || status === 'loading' || status === 'error'

  const selectStyle = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: `1px solid ${status === 'error' ? '#fca5a5' : '#d1d5db'}`,
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    background: isDisabled ? '#f9fafb' : 'white',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'border-color 0.2s',
    ...style,
  }

  return (
    <div style={{ position: 'relative' }}>
      <select
        className={`input ${className}`}
        style={selectStyle}
        value={value}
        onChange={(e) => {
          const val = e.target.value
          if (onChange) onChange(val)
          if (onSelect) {
            const opt = options.find(o => String(o[valueField]) === String(val))
            if (opt) onSelect(opt)
          }
        }}
        required={required}
        disabled={isDisabled}
      >
        {/* ── Status messages as first option ── */}
        {status === 'loading' && (
          <option value="" disabled>
            ⏳ Loading...
          </option>
        )}
        {status === 'error' && (
          <option value="" disabled>
            ⚠️ Failed to load — check connection
          </option>
        )}
        {status === 'empty' && (
          <option value="" disabled>
            {emptyHint || `No records found in ${endpoint}`}
          </option>
        )}

        {/* ── Normal state ── */}
        {status === 'ok' && (
          <>
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt[valueField]} value={opt[valueField]}>
                {formatLabel ? formatLabel(opt) : opt[labelField]}
              </option>
            ))}
          </>
        )}
      </select>

      {/* Loading spinner overlay */}
      {status === 'loading' && (
        <span
          style={{
            position: 'absolute',
            right: '2rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.75rem',
            color: '#94a3b8',
            pointerEvents: 'none',
          }}
        >
          ↻
        </span>
      )}
    </div>
  )
}
