'use client'

import React, { useEffect, useRef, useState } from 'react'

/** Number that eases from its previous value to the new one. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 800)
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - p, 4)))
      from.current = v
      setShown(v)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <span className={`tabular-nums ${className ?? ''}`}>{shown.toLocaleString()}</span>
}

/** Letters rise in one after another. Re-plays whenever the text changes. */
export function SplitText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={`${text}-${i}`} aria-hidden className="kx-char" style={{ animationDelay: `${Math.min(i, 30) * 32}ms` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

/** Endless crawl of clickable labels; pauses on hover or focus. */
export function Ticker({ items, onPick }: { items: { id: string; label: string }[]; onPick: (id: string) => void }) {
  if (!items.length) return null
  const row = (hidden: boolean) =>
    items.map(item => (
      <button key={item.id} type="button" className="kx-tick" tabIndex={hidden ? -1 : 0} aria-hidden={hidden} onClick={() => onPick(item.id)}>
        {item.label}
      </button>
    ))
  return (
    <div className="kx-ticker" role="region" aria-label="Most connected entities">
      <div className="kx-track" style={{ animationDuration: `${items.length * 3.5}s` }}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

/** Small solar-system loader: a core pulsing inside three counter-rotating orbits. */
export function OrbitLoader({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="text-lilac">
      {[18, 30, 43].map((r, i) => (
        <g key={r} className="kx-spin" style={{ animationDuration: `${2.6 + i * 1.8}s`, animationDirection: i === 1 ? 'reverse' : 'normal' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity=".22" />
          <circle cx={50 + r} cy="50" r={3.4 - i * 0.5} fill={i === 1 ? 'var(--lilac)' : 'var(--primary)'} />
        </g>
      ))}
      <circle className="kx-pulse" cx="50" cy="50" r="6" fill="var(--primary)" />
    </svg>
  )
}

/** Circular progress, 0-100. */
export function Ring({ value, size = 44, className }: { value: number; size?: number; className?: string }) {
  const r = 18
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} role="img" aria-label={`${Math.round(v)} percent`} className={className}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform="rotate(-90 22 22)"
        style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.2, 1, 0.3, 1)' }}
      />
    </svg>
  )
}
