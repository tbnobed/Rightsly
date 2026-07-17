# Rightsli — Logo & Asset Package

All logo files for Rightsli, the TBN rights management system. SVGs are the masters (infinitely scalable, text already outlined so no font is required). PNGs are ready-to-use exports.

## Quick pick

- **App favicon / icon** → `png/favicon.ico`, `png/apple-touch-icon.png`, `png/rightsli-icon-*.png`
- **In-app top nav (dark bar)** → `svg/rightsli-lockup-dark.svg`
- **On a white page / document** → `svg/rightsli-lockup-onwhite.svg`
- **Social share preview** → `png/rightsli-social-og.png` (1200×630)

## Folder structure

```
svg/   — vector masters (use these wherever possible)
png/   — raster exports (icons, @1x/2x/3x lockups, favicon, social)
```

## The mark

The icon is the brass **dividing rule** locked to a green **R** — drawn from "rightly dividing" (2 Timothy 2:15), the root of the name. It reads as a records system putting each contract in its right place.

| File | Use |
|------|-----|
| `svg/rightsli-mark.svg` | Primary app icon — green R on ink, rounded square |
| `svg/rightsli-mark-light.svg` | Icon on light/parchment backgrounds |
| `svg/rightsli-mark-mono-ink.svg` | Single-color ink, transparent bg (stamps, watermarks) |
| `svg/rightsli-mark-mono-parchment.svg` | Single-color light, transparent bg (on photos/dark) |
| `svg/rightsli-mark-mono-dark.svg` | Ink mark on white square |

## The lockups (horizontal: rule + wordmark)

| File | Background | Use |
|------|-----------|-----|
| `rightsli-lockup-dark` | ink | Primary — top nav, dark headers |
| `rightsli-lockup-light` | parchment | Light-themed headers |
| `rightsli-lockup-onwhite` | transparent, ink text | Documents, white pages, PDFs |
| `rightsli-lockup-onwhite-reverse` | transparent, light text | Over photos or dark blocks |
| `rightsli-lockup-tagline-dark` | ink | Marketing / splash with tagline |
| `rightsli-lockup-tagline-onwhite` | transparent, ink text | Docs with tagline |
| `rightsli-lockup-mono-ink` / `-parchment` | transparent | Single-color contexts |

Each lockup PNG ships at `@1x`, `@2x`, `@3x`.

## Icon PNG sizes

16, 32, 48, 64, 128, 180, 192, 256, 512, 1024 px — square, ink rounded.
`favicon.ico` bundles 16/32/48. `apple-touch-icon.png` is 180.

## Web favicon snippet

Drop the icon files at your web root and add to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/rightsli-icon-32.png" sizes="32x32">
<link rel="icon" type="image/png" href="/rightsli-icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="/rightsli-social-og.png">
```

## Colors

| Name | Hex |
|------|-----|
| Ink | `#14201C` |
| Covenant green | `#1D9E75` |
| Brass | `#C9A24B` |
| Parchment | `#F4F1E9` |
| Slate | `#5F6B64` |

## Clear space & minimum size

- Keep clear space around the mark equal to the width of the brass rule on all sides.
- Minimum icon size: 16px. Minimum lockup height: 24px (drop the tagline below ~40px height).
- Don't recolor the mark outside the palette, stretch it, add effects, or separate the rule from the R.

Typeface: **Inter Display** (SemiBold for the wordmark, Medium for the tagline). Text in these files is already outlined, so the font isn't needed to use them — install Inter only if you're recreating or extending the logo.
