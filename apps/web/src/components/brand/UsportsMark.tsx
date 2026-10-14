import React from 'react'

/**
 * The U-Sports mark (brand/usports-mark-blue.svg): the white faceted "U" on a
 * blue tile. Same artwork as the browser tab icon (public/favicon.svg) and the
 * Android app icon, so the product has
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
      viewBox="193 193 1114 1114"
      width={size}
      height={size}
      role="img"
      aria-label="U-Sports"
      className={className}
      style={{ flexShrink: 0, borderRadius: size * 0.22 }}
    >
      <rect x="193" y="193" width="1114" height="1114" fill="#0066FF" />
      <path fill="#FFFFFF" d="M517.4 404.9L672 404.9L608.44 592.95A121.7 121.7 0 0 1 580.8 762.4L478.4 590.3ZM982.6 404.9L828 404.9L891.56 592.95A121.7 121.7 0 0 0 919.2 762.4L1021.6 590.3ZM580.8 762.4L478.6 927.2L574.4 1095.1L925.6 1095.1L1021.4 927.2L919.2 762.4L858.1 928.9L641.9 928.9Z" />
    </svg>
  )
}
