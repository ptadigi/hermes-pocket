# Design System

## Direction

Dark cinematic pocket cockpit. Graphite canvas, ruby signal, white content, green only verified success.

## Tokens

- Canvas: `#07080b`
- Surface: `#101218`
- Elevated: `#171a21`
- Border: `#2a2e38`
- Ruby: `#e3264f`
- Ruby bright: `#ff4269`
- Text: `#f7f8fa`
- Muted: `#9ba3b1`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#ef4444`

Touch target minimum 44px. Safe-area padding mandatory. Content text remains DOM above decorative canvas.

## Motion

ThreeUI Community `EnergyOrb` only on launch/connection surface. Lazy-loaded. DPR capped by component. Existing component pauses offscreen/hidden and handles reduced motion. CSS static radial fallback remains visible when WebGL unavailable.

No scroll hijack, dense particles, cursor replacement or continuous 3D in chat workspace.
