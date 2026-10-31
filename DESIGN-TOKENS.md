# Jaderoo design tokens

The tokens in `public/style.css` are the day theme (K1 v4) and the night theme (N2 Neutral). Component rules read the short color variables (`--accent`, `--bg`, and the rest). Those names alias the `--color-*` tokens, so light and dark stay in one place.

Change a color by editing the token and its dark override. Leave the alias in place. Do not fold a nearby literal into a token whose value is different — that would move type, spacing, or timing.

Day follows K1 v4: cream page, white surfaces, deep jade actions, forest type. Night follows N2: `#121614` page, `#1C2220` surfaces, `#252C29` tints, `#323B37` borders, `#ECEFED` text, `#AEB8B3` secondary text. The bottom bar stays deep jade `#0B6E4F` in both themes. `prefers-color-scheme` selects the theme, and the existing night-mode toggle also turns dark on from 9pm to 6am.

## Palette

| Token | Light | Dark | Alias |
|---|---|---|---|
| `--color-accent` | `#0B6E4F` | `#3CCB8A` | `--accent` |
| `--color-accent-strong` | `#0F4D3A` | `#8FE0B8` | `--accent-dark` |
| `--color-on-accent` | `#fff` | `#0F4D3A` | ink on accent fills |
| `--color-bg` | `#FFFBF2` | `#121614` | `--bg` |
| `--color-surface` | `#FFFFFF` | `#1C2220` | `--surface` |
| `--color-surface-soft` | `#F4FBF7` | `#252C29` | `--surface-soft` |
| `--color-border` | `#D6E6DD` | `#323B37` | `--border` |
| `--color-text` | `#0F4D3A` | `#ECEFED` | `--text` |
| `--color-text-soft` | `#4A6358` | `#AEB8B3` | `--text-soft` |
| `--color-chrome` | `#EFE8D8` | `#0C0F0D` | `--chrome-bg` |
| `--color-success` | `#0B6E4F` | `#3CCB8A` | `--success` |
| `--color-danger` | `#8E2430` | `#F0B4B6` | `--danger` (text) |
| `--color-danger-fill` | `#8E2430` | `#8E2430` | delete button fill |
| `--color-overlay` | `rgba(18,22,20,.45)` | `rgba(8,10,9,.62)` | sheet scrim (`.overlay`) |
| `--color-nav` | `#0B6E4F` | `#0B6E4F` | bottom bar |
| `--color-nav-inactive` | `#D2EEDF` | `#D2EEDF` | inactive tab |
| `--color-nav-active` | `#FFFFFF` | `#FFFFFF` | active tab |
| `--color-wordmark` | `#0B6E4F` | `#3CCB8A` | JADEROO |
| `--color-display` | `#0F4D3A` | `#3CCB8A` | screen titles |
| `--color-jade` | `#0B6E4F` | `#0B6E4F` | deep jade, both themes |
| `--color-jade-bright` | `#3CCB8A` | `#3CCB8A` | light accent |
| `--color-yellow` | `#FFD23F` | `#F2C94C` | tonight chip / time badges only |
| `--color-on-yellow` | `#0F4D3A` | `#0F4D3A` | ink on yellow |
| `--color-coral` | `#FF5A5F` | `#FF5A5F` | non-text fill only; not used for type |
| `--shadow-card` | `0 8px 24px rgba(15,77,58,.07)` | `0 10px 28px rgba(0,0,0,.35)` | `--shadow` |
| `--shadow-soft` | `0 6px 16px rgba(15,77,58,.08)` | `0 6px 18px rgba(0,0,0,.32)` | buttons, rows |
| `--shadow-nav` | `0 -10px 28px rgba(11,70,50,.18)` | `0 -10px 28px rgba(0,0,0,.4)` | bottom bar |
| `--shadow-accent` | same as `--shadow-soft` | same | primary button |

`--color-accent` is deep jade in the day theme and bright jade at night, with `--color-on-accent` kept dark on the night fill so chip and button text stay above 4.5:1. `--color-accent-strong` is forest by day and a lighter jade by night (real-place names, friend-pick badges).

`--color-on-photo` and `--color-ink` sit on photographs and do not flip. The photo card title, tiles, and credit use `--color-on-photo`. The category pill uses `--color-ink` (`#0F4D3A`) on white.

`--color-coral` is `#FF5A5F`. It is not applied to text. The Discover distance thumb uses it, with a white ring.

`--color-yellow` is reserved for a "Happening tonight" chip and time badges. Those controls are not in the current screens, so the token is unused. Stat tiles are not yellow.

`--color-danger` is text. The delete row uses `--color-danger-fill` with white type so the control does not turn pale at night and does not use coral.

Shadows are soft blurs. There is no hard offset shadow.

### Tints that are not the overlay

These are separate paints. Do not point them at `--color-overlay`.

| Where | Value |
|---|---|
| Category chip on card art | `#fff` with `--color-ink` |
| Real-place badge | `rgba(255,255,255,.94)` |
| Real-place badge shadow | `rgba(20,20,26,.12)` |
| Open-now badge | `--color-accent` with `--color-on-accent`, dot `--color-open-dot` |
| Conditions line on a photo | `#D2EEDF` |
| Photo scrim | `rgba(14,15,18,…)` held constant |
| Tutorial dot (inactive) | `color-mix` of the text color at 28% |
| Active nav pill | `rgba(255,255,255,.16)` |
| Toggle knob shadow | `0 1px 3px rgba(0,0,0,.25)` |

The phone bezel is `#1c1c1e` with a `#3a3a3c` edge. It is chrome, not a theme color.

Cover-art palettes live in `app.js` (`getCoverArtStyle`). They are illustration colors, not UI tokens.

Body type is Nunito. The wordmark and one screen title (the top bar, and the Filters sheet) use Bungee, flat, rotated about −5 degrees, with no shadow.

## Type scale

Body: `"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Display and the wordmark: `"Bungee", "Nunito", sans-serif`.

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
