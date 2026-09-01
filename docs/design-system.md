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

Motion stays CSS-native and optional. Respect `prefers-reduced-motion`; no continuous 3D, scroll hijack, dense particles or cursor replacement in the chat workspace.

The app icon is generated from `public/icons/icon-source.png`; run `python scripts/generate-icons.py` to regenerate the 180/192/512px variants.
