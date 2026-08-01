# Splooshly — brand handoff

Kitchen & home inventory. Fresh, clean, quietly playful. The name is the only
joke; everything the user has to *read* stays literal.

## Files

    assets/logo/splooshly-wordmark.svg           mono, currentColor
    assets/logo/splooshly-wordmark-two-tone.svg  Deep letters + Sprout mark
    assets/logo/splooshly-mark.svg               the "oo" loop alone, currentColor
    assets/logo/splooshly-appicon.svg            180x180 rounded tile, ready to export
    assets/icons.svg                             sprite: all 16 icons + logo symbols
    assets/icons/*.svg                           the same icons as standalone files
    brand.css                                    tokens as CSS custom properties

Sprite usage:

    <svg width="24" height="24" style="color: var(--sprout)">
      <use href="/assets/icons.svg#ico-meat" />
    </svg>

## Color

| Token | Hex | Use |
|---|---|---|
| Sprout | `#17A45E` | the mark, category icons, active nav, primary buttons |
| Sprout Light | `#4ED28C` | the same accent, but only on dark surfaces |
| Deep | `#123528` | all body text; dark app surface |
| Zest | `#FFC43D` | restock state ONLY — pill fill on light, text on dark |
| Mist | `#E9F6EE` | selected row, section header band |
| Paper | `#FCFCFA` | app background |
| Line | `#E7E5DD` | hairlines and card borders |

Two rules: Zest never appears on anything that isn't a restock signal, and no
gradients anywhere.

## Type — Gabarito

Google Fonts, weights 400/500/600/700.

| Role | Size | Weight |
|---|---|---|
| Screen title | 24 | 700, letter-spacing -0.02em |
| Item name | 15 | 600 |
| Metadata (counts, weights, location) | 13 | 400, Muted |
| Pill / button | 13 | 600 |
| Section label | 10 | 500, uppercase, 0.14em, Muted |

Numbers inside metadata are plain Gabarito. DM Mono is for the brand guide only
— do not ship it in the app.

## Logo

- Two-tone (Deep letters, Sprout mark) is the default on Paper.
- On Deep: white letters with a Sprout Light mark, or all white.
- **Below 120px wide the wordmark goes mono** — the mark takes the letter color.
- The mark alone holds down to 20px wide; the tangent point keeps the two
  circles reading as one shape.
- Clear space on all sides = the radius of one circle.
- Never rotate the mark, never split the pair, never re-color one circle.

## Icons

16 icons, 24px grid, 1.75 stroke, round caps and joins, **no fills**, single
contour per shape. Categories render in Sprout; system/nav icons render in Deep
(active nav in Sprout).

Categories: `meat` (chicken bone), `fish`, `seasoning`, `oils`, `home`
(home essentials), `produce`, `pantry`, `other`.
System: `home` (nav), `search`, `cart` (shopping list), `chart` (usage),
`barcode` (scan), `camera`, `plus`, `chevron`, `back`, `check`.

New icons must be drawn on the same grid at the same weight — silhouette first,
no interior detail that dies below 24px.

## Components

**Item row** — Paper card, 1px Line border, 12px radius, 13px/15px padding,
13px gap. Left: 24px category icon in Sprout. Center: name (15/600) over
metadata (13/400 Muted). Right: chevron in `#A6A395`, or the restock pill.

**Restock pill** — Zest fill, Deep text, 13/600, 6px 13px padding, full radius.
On dark surfaces it becomes Zest text with no fill. The label is always
"Restock".

**Dark row** — `#0E2620` fill, no border, Sprout Light icon, `#F2F7F4` name,
`#8B9791` metadata.

**Tab bar** — 24px icons, inactive `#A6A395`, active Sprout. Minimum 44px tap
target everywhere.

## Motion

One beat, ~200ms, ease-out. No sound, no bounce, no repeat on double tap.

- Removing an item: the row's category icon briefly dips like the mark's fill
  level dropping, then the row collapses.
- Marking purchased: the check draws in over 200ms.
- Everything else: plain cross-fade or slide.

## Voice

Literal in the UI, warm in the empty states.

- Yes: "Restock", "3 packages", "Last bought Apr 12", "Nothing in Oils yet."
- No: "Splooshed!", "Uh oh, your pantry is thirsty", exclamation marks in
  anything that reports data.

Numbers, weights, dates and analytics are never dressed up — that's where trust
is won.
