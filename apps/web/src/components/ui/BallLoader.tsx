import React from 'react'

/**
 * The full-screen loading state: a basketball bouncing on a shadow. The markup
 * and its CSS live in index.html (class names ub-*), so the very same ball is
 * on screen before any script arrives and this component continues it without
 * a jump. Reduced motion: the ball holds still and softly pulses instead.
 */
export default function BallLoader({ label = 'Loading U-Sports…' }: { label?: string }) {
  return (
    <div className="ub-boot" role="status" aria-live="polite">
      <div className="ub-stage">
        <div className="ub-ball">
          <svg className="ub-spin" viewBox="0 0 100 100" width="64" height="64" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="#F28A1E" />
            <path
              d="M50 4v92M4 50h92M17 16c20 22 20 46 0 68M83 16c-20 22-20 46 0 68"
              fill="none"
              stroke="#7A3A08"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <circle cx="50" cy="50" r="46" fill="none" stroke="#B4600F" strokeWidth="2.5" />
            <path d="M26 22c6-7 14-11 22-12" fill="none" stroke="#FFD3A1" strokeWidth="4" strokeLinecap="round" opacity=".55" />
          </svg>
        </div>
        <div className="ub-shadow" />
      </div>
      <p className="ub-text">{label}</p>
    </div>
  )
}
