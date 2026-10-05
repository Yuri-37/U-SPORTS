import React from 'react'

/**
 * The U-Sports mark: a white "U" on a blue tile. Same artwork as the browser
 * tab icon (public/favicon.svg) and the Android app icon, so the product has
 * one recognisable logo that is not the school's crest. The crest comes from
 * the institution profile and is shown separately, smaller, beside it.
 */
export default function UsportsMark({
  size = 32,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      role="img"
      aria-label="U-Sports"
      className={className}
      style={{ flexShrink: 0, borderRadius: size * 0.22 }}
    >
      <rect width="1024" height="1024" fill="#0066FF" />
      <path
        d="M 372,280 L 372,680 A 140,140 0 0 0 652,680 L 652,280"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="140"
        strokeLinecap="round"
      />
    </svg>
  )
}
