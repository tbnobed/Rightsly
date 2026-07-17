# Rightsly — Logo & Asset Package

Logo files for Rightsly, the TBN rights management system. SVGs are the masters (scalable, text already outlined — no font needed to use them). PNGs are ready to drop in.

## The icon

A bold **R** on ink, with the brass **dividing rule** forming the R's full left stem — so the "rightly dividing" idea (2 Timothy 2:15, the root of the name) is built into the letter itself. The brass is flush with the left edge and runs into the parchment bowl. No floating parts, maximum contrast, and it stays legible down to 16px and under both circular and squircle app-icon masks.

Primary is the parchment R (`rightsly-icon.svg`). A green-R variant is included for contexts where you want the covenant green to show.

## Quick pick

| Need | File |
|------|------|
| Web favicon | `png/favicon.ico` |
| iOS home screen | `png/apple-touch-icon.png` |
| Android adaptive icon | `png/rightsly-icon-maskable-512.png` (purpose: maskable) |
| PWA manifest | `site.webmanifest` (+ `rightsly-icon-192/512.png`) |
| App store / high-res | `png/rightsly-icon-1024.png` |
| Top nav (dark bar) | `svg/rightsly-lockup-dark.svg` |
| On white / documents | `svg/rightsly-lockup-onwhite.svg` |
| Social share preview | `png/rightsly-social-og.png` (1200x630) |

## Icon files

| File | Use |
|------|-----|
| `rightsly-icon.svg` | Primary — parchment R + brass stem on ink, rounded |
| `rightsly-icon-green.svg` | Green R variant |
| `rightsly-icon-light.svg` | Ink R on parchment (light backgrounds) |
| `rightsly-icon-maskable.svg` | Full-bleed, extra safe-zone padding for Android adaptive / any mask |
| `rightsly-icon-mono-ink.svg` | Single-color ink, transparent (stamps, embossing) |
| `rightsly-icon-mono-parchment.svg` | Single-color light, transparent (on photos/dark) |

Icon PNGs: 16, 32, 48, 64, 128, 180, 192, 256, 512, 1024. `favicon.ico` bundles 16/32/48. `apple-touch-icon.png` is 180. Maskable ships at 192 and 512.

## Lockups (horizontal: mark + wordmark)

| File | Use |
|------|-----|
| `rightsly-lockup-dark` | Primary — top nav, dark headers |
| `rightsly-lockup-light` | Light-themed headers |
| `rightsly-lockup-onwhite` | Transparent, ink text — documents, PDFs, white pages |
| `rightsly-lockup-reverse` | Transparent, light text — over photos/dark |
| `rightsly-lockup-tagline-dark` | With tagline, on ink — splash/marketing |
| `rightsly-lockup-tagline-onwhite` | With tagline, transparent |
| `rightsly-lockup-mono-ink` / `-parchment` | Single-color contexts |

Each lockup PNG ships at `@1x`, `@2x`, `@3x`.

## Web setup

Place the icon files at your web root and add to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/rightsly-icon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#14201C">
<meta property="og:image" content="/rightsly-social-og.png">
```

`site.webmanifest` is included and pre-filled (name, colors, icon references incl. maskable).

## Colors

| Name | Hex |
|------|-----|
| Ink | `#14201C` |
| Covenant green | `#1D9E75` |
| Brass | `#C9A24B` |
| Parchment | `#F4F1E9` |
| Slate | `#5F6B64` |

## Rules

- Keep clear space around the mark equal to the brass stem's width.
- Minimum icon size 16px; minimum lockup height 24px (drop the tagline below ~40px).
- Don't recolor outside the palette, stretch, add effects, or detach the stem from the R.

Typeface: **Inter Display** — Black for the icon R, SemiBold for the wordmark, Medium for the tagline. Free and open-source (SIL OFL). Text in these files is already outlined, so the font is only needed if you extend the logo.
