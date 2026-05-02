// SVG data-URLs for entity billboards.
//
// New layout (since "markers feel flat" feedback): each icon is a vertical
// stack — ground shadow at the bottom, faint dashed leader line going up,
// glowing main marker at the top. Combined with verticalOrigin: BOTTOM,
// the marker reads as physically suspended above the ground rather than
// painted on it.
//
//  viewBox 0 0 80 116
//  ┌────────┐  y=0   ┐
//  │  MAIN  │        │ marker body (top)
//  │ MARKER │        │
//  └────────┘  y=58  ┘
//      │             ┐
//      │  ░░░        │ leader line (dashed olo)
//      │             ┘
//   ── ─── ──   y=110 ┐ ground footprint (shadow ellipse)
//                     ┘

function dataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const GLOW_FILTER = `
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.5" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>`

// Footprint + leader (shared across all markers — colors injected per-icon)
function footAndLeader(color: string): string {
  return `
    <ellipse cx="40" cy="110" rx="20" ry="3" fill="rgba(0,0,0,0.55)"/>
    <ellipse cx="40" cy="110" rx="14" ry="2" fill="${color}" opacity="0.45"/>
    <line x1="40" y1="106" x2="40" y2="62" stroke="${color}" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.55"/>
  `
}

// VIP — pulsing concentric ring + filled core
export const VIP_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  ${footAndLeader('#00FFBC')}
  <g filter="url(#glow)">
    <circle cx="40" cy="32" r="30" fill="none" stroke="#00FFBC" stroke-width="1.5" opacity="0.35"/>
    <circle cx="40" cy="32" r="22" fill="none" stroke="#00FFBC" stroke-width="2" opacity="0.7"/>
    <circle cx="40" cy="32" r="14" fill="#00FFBC" stroke="white" stroke-width="2.5"/>
    <text x="40" y="36" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="black">VIP</text>
  </g>
</svg>`)

// AB-U10 (legacy fallback; the 3D GLB model handles the live position now)
export const U10_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  ${footAndLeader('#00FFBC')}
  <g filter="url(#glow)">
    <ellipse cx="40" cy="32" rx="28" ry="10" fill="#00FFBC" stroke="white" stroke-width="2"/>
    <rect x="34" y="14" width="12" height="36" rx="3" fill="#00CC8F" stroke="white" stroke-width="1.5"/>
    <polygon points="40,8 35,18 45,18" fill="white"/>
    <circle cx="14" cy="22" r="5" fill="#003020" stroke="#00FFBC" stroke-width="1.5"/>
    <circle cx="66" cy="22" r="5" fill="#003020" stroke="#00FFBC" stroke-width="1.5"/>
    <circle cx="14" cy="42" r="5" fill="#003020" stroke="#00FFBC" stroke-width="1.5"/>
    <circle cx="66" cy="42" r="5" fill="#003020" stroke="#00FFBC" stroke-width="1.5"/>
  </g>
</svg>`)

// Hostile FPV — X-frame quadcopter
export const FPV_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  <ellipse cx="40" cy="110" rx="22" ry="3.5" fill="rgba(0,0,0,0.55)"/>
  <ellipse cx="40" cy="110" rx="16" ry="2" fill="#ff3d55" opacity="0.5"/>
  <line x1="40" y1="106" x2="40" y2="62" stroke="#ff3d55" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.7"/>
  <g filter="url(#glow)">
    <line x1="20" y1="14" x2="60" y2="50" stroke="#ff5566" stroke-width="4" stroke-linecap="round"/>
    <line x1="60" y1="14" x2="20" y2="50" stroke="#ff5566" stroke-width="4" stroke-linecap="round"/>
    <circle cx="20" cy="14" r="9" fill="rgba(255,61,85,0.25)" stroke="#ff3d55" stroke-width="2"/>
    <circle cx="60" cy="14" r="9" fill="rgba(255,61,85,0.25)" stroke="#ff3d55" stroke-width="2"/>
    <circle cx="20" cy="50" r="9" fill="rgba(255,61,85,0.25)" stroke="#ff3d55" stroke-width="2"/>
    <circle cx="60" cy="50" r="9" fill="rgba(255,61,85,0.25)" stroke="#ff3d55" stroke-width="2"/>
    <circle cx="40" cy="32" r="7" fill="#aa1020" stroke="white" stroke-width="2"/>
    <circle cx="40" cy="32" r="2.5" fill="#ff8888"/>
  </g>
</svg>`)

// Multicopter overwatch (purple)
export const MC_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  ${footAndLeader('#9b6bff')}
  <g filter="url(#glow)">
    <line x1="20" y1="14" x2="60" y2="50" stroke="#9b6bff" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="60" y1="14" x2="20" y2="50" stroke="#9b6bff" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="20" cy="14" r="7" fill="rgba(155,107,255,0.3)" stroke="#9b6bff" stroke-width="1.5"/>
    <circle cx="60" cy="14" r="7" fill="rgba(155,107,255,0.3)" stroke="#9b6bff" stroke-width="1.5"/>
    <circle cx="20" cy="50" r="7" fill="rgba(155,107,255,0.3)" stroke="#9b6bff" stroke-width="1.5"/>
    <circle cx="60" cy="50" r="7" fill="rgba(155,107,255,0.3)" stroke="#9b6bff" stroke-width="1.5"/>
    <circle cx="40" cy="32" r="6" fill="#5530aa" stroke="white" stroke-width="1.5"/>
  </g>
</svg>`)

// Radar — blue triangle
export const RADAR_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  ${footAndLeader('#3b8eff')}
  <g filter="url(#glow)">
    <polygon points="40,8 64,52 16,52" fill="rgba(59,142,255,0.4)" stroke="#5fb6ff" stroke-width="2.5"/>
    <circle cx="40" cy="38" r="5" fill="#5fb6ff" stroke="white" stroke-width="1.5"/>
  </g>
</svg>`)

// Capture marker — ✕ ring
export const CAPTURE_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  ${footAndLeader('#00FFBC')}
  <g filter="url(#glow)">
    <circle cx="40" cy="32" r="26" fill="rgba(0,255,188,0.18)" stroke="#00FFBC" stroke-width="3"/>
    <line x1="26" y1="18" x2="54" y2="46" stroke="#00FFBC" stroke-width="4" stroke-linecap="round"/>
    <line x1="54" y1="18" x2="26" y2="46" stroke="#00FFBC" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>`)

// GCS — building w/ antenna mast
export const GCS_ICON = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 116">
  <defs>${GLOW_FILTER}</defs>
  ${footAndLeader('#5fb6ff')}
  <g filter="url(#glow)">
    <line x1="40" y1="38" x2="40" y2="6" stroke="#5fb6ff" stroke-width="2.5"/>
    <circle cx="40" cy="6" r="3.5" fill="#5fb6ff" stroke="white" stroke-width="1"/>
    <polygon points="18,40 40,22 62,40" fill="rgba(95,182,255,0.6)" stroke="#5fb6ff" stroke-width="2"/>
    <rect x="20" y="40" width="40" height="22" fill="rgba(95,182,255,0.35)" stroke="#5fb6ff" stroke-width="2" rx="2"/>
    <rect x="36" y="50" width="8" height="12" fill="#0a1322"/>
    <rect x="24" y="46" width="6" height="6" fill="#9bd4ff" opacity="0.7"/>
    <rect x="50" y="46" width="6" height="6" fill="#9bd4ff" opacity="0.7"/>
  </g>
</svg>`)
