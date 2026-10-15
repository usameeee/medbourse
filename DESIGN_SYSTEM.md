# MEDBOURSE — Design System

## Brand positioning

MEDBOURSE presents as an established international consultancy: **trust**, **human support**, **operational clarity**, and **privacy**. Visual tone: calm authority—not startup neon, not generic AI SaaS.

## Design rationale

- **Public marketing:** editorial layout, generous whitespace, authentic photography (when licensed).
- **Operational UI:** information density, scannable tables, clear status semantics, minimal decoration.
- **One brand:** shared tokens across public site, customer portal, staff, and Super Admin.

## Color palette (semantic tokens)

Implement as CSS custom properties in `apps/web/src/styles/tokens.css`.

| Token | Role | Value (initial) |
|-------|------|-----------------|
| `--color-brand-primary` | Primary actions, key links | `#0B4F4A` (deep teal — trust, health, travel) |
| `--color-brand-secondary` | Accents, highlights | `#C4A962` (muted gold — quality, warmth) |
| `--color-brand-accent` | Focus rings, subtle emphasis | `#1A6B64` |
| `--color-surface-base` | Page background | `#F7F6F3` (warm off-white) |
| `--color-surface-raised` | Cards, panels | `#FFFFFF` |
| `--color-surface-sunken` | Inset areas | `#EEEDE8` |
| `--color-text-primary` | Body emphasis | `#1C1B19` |
| `--color-text-secondary` | Supporting text | `#5C5954` |
| `--color-text-muted` | Placeholders, hints | `#8A8680` |
| `--color-border-default` | Dividers | `#D8D5CE` |
| `--color-border-strong` | Table headers | `#B8B4AB` |
| `--color-success` | Approved, complete | `#2D6A4F` |
| `--color-warning` | Pending, attention | `#B8860B` |
| `--color-danger` | Rejected, errors | `#9B2C2C` |
| `--color-info` | Informational | `#2C5282` |

Dark mode: deferred to Phase 8; structure tokens for future `--color-*-dark` aliases.

## Typography

- **Latin (en, fr, tr):** `"Source Sans 3"`, system-ui fallback — readable, professional.
- **Arabic:** `"Noto Sans Arabic"`, `"Source Sans 3"` fallback for mixed content.
- **Scale:** `--text-xs` 0.75rem · `--text-sm` 0.875rem · `--text-base` 1rem · `--text-lg` 1.125rem · `--text-xl` 1.25rem · `--text-2xl` 1.5rem · `--text-3xl` 2rem · `--text-4xl` 2.5rem (display/marketing only).
- **Line height:** body 1.5 · headings 1.25.
- **Weights:** 400 regular, 500 medium, 600 semibold, 700 bold (headings).

## Spacing & layout

- Base unit: **4px**. Scale: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16 (×4px).
- Max content width: `--layout-max` 72rem (public); `--layout-dashboard` 90rem (operations).
- Breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.

Use **logical properties** (`margin-inline`, `padding-block`, `border-inline-start`) for RTL.

## Radii & elevation

- `--radius-sm` 4px · `--radius-md` 8px · `--radius-lg` 12px (cards, modals).
- Shadows: restrained — `--shadow-sm` for cards only; avoid stacked glows.

## Components (naming & behavior)

| Component | Notes |
|-----------|--------|
| `Button` | primary, secondary, ghost, danger; loading + disabled states |
| `Input`, `Select`, `Textarea` | label, hint, error; associate `aria-describedby` |
| `FormField` | wraps control + validation message |
| `PageShell` | header, nav slot, main, optional sidebar |
| `DataTable` | sort, filter, pagination; sticky header on desktop |
| `StatusBadge` | maps workflow/payment/document enums to color + label |
| `Timeline` | case workflow stages |
| `Modal`, `Drawer` | focus trap, ESC close, confirm for destructive actions |
| `Toast` | success/error; auto-dismiss with pause on hover |
| `EmptyState`, `ErrorState`, `LoadingState` | required on all data views |

## Motion

- Duration: 150–200ms for micro-interactions.
- Respect `prefers-reduced-motion: reduce` — disable nonessential transitions.

## Accessibility

- WCAG 2.1 AA target for completed features.
- Visible focus: 2px `--color-brand-accent` outline offset 2px.
- Minimum touch target 44×44px on mobile.
- Do not use color alone for status — include text/icon.

## Imagery

- Real destinations, campuses, care settings when licensed.
- Consistent crop (16:9 hero, 4:3 cards), neutral color grade aligned with warm surfaces.
- No stock clichés as fake “partners.”

## Localization

- All UI strings via i18n keys.
- Arabic: `dir="rtl"` on `html`; test layout independently per locale.
- Numbers/dates via `Intl`; currency display via locale + ISO 4217 code.

## Anti-patterns (avoid)

Purple-blue AI gradients, glassmorphism stacks, emoji icons, fake metrics, placeholder data labeled as live, decorative blobs without purpose.
