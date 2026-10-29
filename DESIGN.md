# DESIGN.md

Visual direction for **Project Sovereign**. This is the style source of truth:
`antislop` reads it for direction, `apps/frontend/src/app/globals.css`
implements it.

## Direction

**Light airy frosted glass** for an internal project-management dashboard: calm,
modern, readable. The interface reads as panes of frosted glass floating over a
soft ambient colour wash.

Dials: **ENERGY 2 / RHYTHM 2 / MOTION 1** — balanced, consistent app layout with
a few deliberate breaks, hover states only (no looping animation).

## Palette

Two core colours (deep blue + cool neutral) plus one accent (sky). Tokens live in
`globals.css` (`:root` = light, `.dark` = dark).

| Role             | Light     | Dark      |
| ---------------- | --------- | --------- |
| background       | `#eef1f6` | `#0b1220` |
| foreground       | `#0e1a26` | `#e8eef7` |
| primary          | `#1668c9` | `#4d8ffd` |
| accent (sky)     | `#38b6e6` | `#4cc3ee` |
| muted-foreground | `#4d5b6e` | `#93a4bd` |
| radius           | `1rem`    | `1rem`    |

The palette keeps the original NodeWave soul (deep blue + sky accent) but opens
the neutrals so frosted glass has somewhere bright to sit.

## Glass system

CSS classes in `globals.css`, driven by CSS variables so they flip with the
theme:

- `.glass` — content surfaces (cards): translucent fill + backdrop blur + edge
  + a top "lip" highlight.
- `.glass-chrome` — sidebar and top bar: more opaque so text stays crisp over
  whatever scrolls behind it.
- `.glass-panel` — dialogs, select menus, toasts: most opaque, for crisp text.
- `.glass-deep` — task cards: thinner fill + deeper blur (stronger refraction).
- `.glass-float` — extra elevation for modals and floating panels.
- **Ambient wash** — a soft blurred gradient on `body` that shows through every
  frosted pane. This is the product's identity motif. It is static (no loop),
  per MOTION 1.

### Recorded override (R-10)

The user chose **full-immersion glass**: blur on the chrome, cards, panels, and
modals together. This is a deliberate **override of antislop R-10** (the glass
dose cap), recorded here and in `globals.css`. Contrast is protected by keeping
the fills opaque enough that body text clears WCAG AA in both themes (R-25 /
R-34); the rendered-pixel contrast check is part of the delivery gate.

## Typography

Geist Sans for UI/copy and Geist Mono for identifiers — one family, hierarchy
from size, weight, and spacing. No display face.

## Motion

Hover states only (MOTION 1): card hover-lift, progress-bar width transition,
soft modal fades, and the theme transition. No looping animation — the ambient
wash does not drift.
