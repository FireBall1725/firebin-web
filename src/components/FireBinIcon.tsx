// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// FireBin's square app mark: a rounded square in the FireLabs orange-to-red
// gradient holding a white IC chip (electronics, and it fills the square). Sits
// next to the FireBin wordmark and rasterises cleanly down to favicon sizes.
// The standalone favicon SVG (web/public/firebin-mark.svg) mirrors this artwork.

export function FireBinIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="firebin-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB020" />
          <stop offset="1" stopColor="#FF3B1F" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#firebin-mark)" />
      {/* IC chip: rounded body, three pins per side, a pin-1 dot. */}
      <g stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x="14" y="14" width="20" height="20" rx="3.5" />
        <line x1="8.5" y1="20" x2="14" y2="20" />
        <line x1="8.5" y1="24" x2="14" y2="24" />
        <line x1="8.5" y1="28" x2="14" y2="28" />
        <line x1="34" y1="20" x2="39.5" y2="20" />
        <line x1="34" y1="24" x2="39.5" y2="24" />
        <line x1="34" y1="28" x2="39.5" y2="28" />
      </g>
      <circle cx="18.5" cy="18.5" r="1.6" fill="#fff" />
    </svg>
  )
}
