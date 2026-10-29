# Spark design tokens

The tokens in `style.css` name the palette, type scale, spacing, radii, and durations Spark already renders. They do not restyle it. Component rules still use the short color variables (`--accent`, `--bg`, and the rest) or the literal sizes they had before. Those short color variables are aliases of the `--color-*` tokens, so light and dark resolve to the same computed colors as before.

Change a color by editing the token (and its dark override). Leave the alias in place. Do not fold a nearby literal into a token whose value is different — that would move type, spacing, or timing.

## Palette

| Token | Light | Dark | Alias |
|---|---|---|---|
| `--color-accent` | `#FF6B6B` | `#FF7A7A` | `--accent` |
| `--color-accent-strong` | `#E8555A` | `#FF9393` | `--accent-dark` |
| `--color-on-accent` | `#fff` | `#fff` | — |
| `--color-bg` | `#F6F6F8` | `#17181C` | `--bg` |
| `--color-surface` | `#FFFFFF` | `#1F2126` | `--surface` |
| `--color-surface-soft` | `#F1F1F4` | `#282A31` | `--surface-soft` |
| `--color-border` | `#E7E7EC` | `#33353D` | `--border` |
| `--color-text` | `#1F2328` | `#F1F1F3` | `--text` |
| `--color-text-soft` | `#6B7280` | `#9A9CA5` | `--text-soft` |
| `--color-chrome` | `#EDEDF0` | `#0E0F12` | `--chrome-bg` |
| `--color-success` | `#22A06B` | `#3FBE8C` | `--success` |
| `--color-danger` | `#E5484D` | `#FF6B6B` | `--danger` |
| `--color-overlay` | `rgba(20,20,26,.45)` | same | sheet scrim (`.overlay`) |
| `--shadow-card` | `0 10px 26px rgba(20,20,30,.08)` | `0 10px 26px rgba(0,0,0,.35)` | `--shadow` |
| `--shadow-accent` | `0 6px 16px rgba(255,107,107,.28)` | same | recorded, not applied |

`--color-accent-strong` is the secondary accent (real-place names, friend-pick badges). It is darker than the brand coral in light mode and lighter in dark mode. That is the value `--accent-dark` already had; the alias keeps it.

`--color-on-accent` is the white painted on accent fills (primary buttons, badges, hero text, the toggle knob). Rules still write `#fff`. The token matches that paint in both themes.

`--color-danger` in dark mode is `#FF6B6B`, the same hex as the light accent. Destructive and brand can look alike on a dark surface. Leave that until a deliberate contrast change.

`--shadow-accent` matches the primary-button glow in both themes, including dark mode, where the glow does not follow `#FF7A7A`. Pointing the button at `color-mix()` or at the dark accent would change that screen.

### Tints that are not the overlay

These are separate paints. Do not point them at `--color-overlay`.

| Where | Value |
|---|---|
| Category chip on card art | `rgba(255,255,255,.92)` |
| Real-place badge | `rgba(255,255,255,.94)` |
| Real-place badge shadow | `rgba(20,20,26,.12)` |
| Event badge on card art | `rgba(24,26,32,.82)` with `#fff` text |
| Tutorial dot (inactive) | `rgba(255,255,255,.4)` |
| Toggle knob shadow | `0 1px 3px rgba(0,0,0,.25)` |

The phone bezel is `#1c1c1e` with a `#3a3a3c` edge. It is chrome, not a theme color.

Cover-art palettes live in `app.js` (`getCoverArtStyle`). They are illustration colors, not UI tokens.

## Type scale

One family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. No web font.

Weights: `--fw-regular` 500, `--fw-semi` 600, `--fw-bold` 700, `--fw-heavy` 800, `--fw-black` 900 (swipe stamps only).

Line height: `--lh-tight` 1.2 (card title), `--lh-normal` 1.4, `--lh-snug` 1.45, `--lh-body` 1.5, `--lh-relaxed` 1.6.

| Token | Size | Used for |
|---|---|---|
| `--fs-2xs` | 10.5px | Nav labels, filter badge |
| `--fs-11` | 11px | Category tag, friend-pick badge, attribution |
| `--fs-xs` | 11.5px | Meta pills, field hints |
| `--fs-12` | 12px | Secondary row text, card hint |
| `--fs-sm` | 12.5px | Tags, subtitles, result count |
| `--fs-13` | 13px | Body labels, sheet subtitle |
| `--fs-md` | 13.5px | Chips, toast, profile rows |
| `--fs-14` | 14px | Outline buttons, row titles (some) |
| `--fs-14-5` | 14.5px | Detail description, idea-row title |
| `--fs-base` | 15px | Inputs, secondary buttons, friend name |
| `--fs-15-5` | 15.5px | Primary button |
| `--fs-lg` | 18px | Profile name, subpage title, chevrons |
| `--fs-19` | 19px | Sheet title |
| `--fs-xl` | 22px | Top bar, card title |
| `--fs-2xl` | 24px | Detail title, tutorial title |
| `--fs-stamp` | 26px | SAVE / PASS stamps |
| `--fs-display` | 36px | Wordmark |

`--fs-11` is not `--fs-xs`. `--fs-14` and `--fs-14-5` are not `--fs-base`. `--fs-19` is not `--fs-lg`. Rules still use the literal pixel sizes, so swapping a rule onto the neighboring token is a visible change and belongs in its own pass.

Uppercase labels do not share one tracking. The four values in use are `--ls-label` .4px, `--ls-label-wide` .5px, `--ls-label-em` .02em, and `--ls-label-loose` .05em. The wordmark uses `letter-spacing: -0.5px`. Stamps use `2px`.

## Spacing

Named steps, each already used: `--sp-1` 4px, `--sp-2` 6px, `--sp-3` 8px, `--sp-4` 10px, `--sp-5` 12px, `--sp-6` 14px, `--sp-7` 20px (screen gutter), `--sp-8` 28px.

Also still literal, and not aliased onto those steps: 2, 3, 5, 7, 9, 11, 13, 16, 18, 22, 24, 26, 30, 32, 34, 36, 40, 48, 60.

## Radii

`--r-sm` 10px, `--r-md` 14px, `--r-lg` 18px, `--r-xl` 26px (swipe card and sheet top), `--r-pill` 999px.

Still literal: 4, 5, 12, 16, 20, 24, 30, the 44px phone, and `50%` avatars. A 16px row is not `--r-lg` (18px). A 20px chip is not `--r-pill`.

## Duration

`--dur-fast` .2s (toggle), `--dur-row` .22s (saved-row snap), `--dur-fade` .25s (page background), `--dur-base` .3s (card settle), `--dur-swipe` .35s (card fling). The .22s / .3s / .35s values run from `app.js` inline styles. Those lines were left as literals; the tokens only record them. `.25s` is not `--dur-base`.
