import { useState } from 'react'

/**
 * CompanyLogo — renders the PT Kopernik brand logo.
 *
 * Props
 *   height    number   Display height in px (width auto-scales from aspect ratio). Default 40.
 *   dark      bool     Wraps logo in a white rounded pill for dark backgrounds. Default false.
 *   style     object   Extra inline styles on the outer wrapper.
 *   className string   Extra CSS class on the outer wrapper.
 *
 * Logo source priority (first one that exists wins):
 *   1. /assets/logo/kopernik-logo.png  ← official transparent PNG (preferred)
 *   2. /assets/logo/kopernik-logo.svg  ← SVG recreation fallback
 *   3. Inline text fallback            ← if both image files are missing
 *
 * To add the official logo:
 *   1. Save the original logo PNG to:  frontend/public/assets/logo/kopernik-logo-original.png
 *   2. Run:  python frontend/public/assets/logo/make_transparent.py
 *   3. The output kopernik-logo.png is picked up automatically — no code changes needed.
 */

/* Try PNG first, fall back to SVG */
const LOGO_PNG = '/assets/logo/kopernik-logo.png'
const LOGO_SVG = '/assets/logo/kopernik-logo.svg'

export default function CompanyLogo({ height = 40, dark = false, style = {}, className = '' }) {
  const [src, setSrc] = useState(LOGO_PNG)
  const [failed, setFailed] = useState(false)

  const handleError = () => {
    if (src === LOGO_PNG) {
      setSrc(LOGO_SVG)   // PNG missing → try SVG recreation
    } else {
      setFailed(true)    // SVG also missing → show text fallback
    }
  }

  /* ── Text fallback (only if both image files fail to load) ──────────────── */
  const fs = Math.round(height * 0.48)
  const textFallback = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1px',
      userSelect: 'none', lineHeight: 1, flexShrink: 0,
    }}>
      <span style={{ color: '#F5B800', fontSize: fs, fontWeight: 900, fontFamily: "'Arial Black', Arial, sans-serif", lineHeight: 1 }}>PT</span>
      <span style={{ color: '#E07020', fontSize: fs, fontWeight: 900, fontFamily: "'Arial Black', Arial, sans-serif", lineHeight: 1, letterSpacing: '-1px' }}>{'>>'}</span>
      <span style={{ color: dark ? '#1e293b' : '#2D1B09', fontSize: fs, fontWeight: 900, fontFamily: "'Arial Black', Arial, sans-serif", lineHeight: 1 }}>KOPERNIK</span>
    </div>
  )

  /* ── Logo image ─────────────────────────────────────────────────────────── */
  const logoImg = failed ? textFallback : (
    <img
      key={src}
      src={src}
      alt="PT Kopernik"
      loading="eager"
      onError={handleError}
      style={{
        display: 'block',
        height: `${height}px`,
        width: 'auto',       /* browser derives width from file's aspect ratio */
        maxWidth: 'none',    /* never let a parent constraint squish the width */
        objectFit: 'contain',
        flexShrink: 0,
      }}
    />
  )

  /* ── Dark variant: wrap in a white rounded pill ─────────────────────────── */
  if (dark) {
    const padV = Math.max(5, Math.round(height * 0.12))
    const padH = Math.max(10, Math.round(height * 0.24))
    return (
      <div
        className={className}
        style={{
          background: 'white',
          borderRadius: Math.round(height * 0.2),
          padding: `${padV}px ${padH}px`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          flexShrink: 0,
          lineHeight: 0,
          ...style,
        }}
      >
        {logoImg}
      </div>
    )
  }

  /* ── Standard (light-background) variant ───────────────────────────────── */
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        lineHeight: 0,
        ...style,
      }}
    >
      {logoImg}
    </div>
  )
}
