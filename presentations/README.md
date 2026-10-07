# Presentation pages - style and behavior guide

A single static page, `index.html`, that is clicked through live while talking. Follow this so new
pages match the existing ones. `index.html` is the source of truth; if this file and the code
disagree, the code wins - update this file.

## Files
The page is **not in this repo**. It lives in a session scratchpad folder, currently
`/private/tmp/claude-501/-Users-cpunerd-src-datamine-tacticus/62f47fe1-5398-4e29-a139-6fef571f4990/scratchpad/tierlist/`
(temp storage, may be cleared). If it's gone, rebuild it from this guide; the portraits and map
come from `extracted_assets_143_94_marketing/` (`sprites/`, and `texture2d/crescendo_01_Visual.png`).
Paths below are relative to that folder.
- `index.html` - the whole page (inline CSS + JS, no libraries, no build step).
- `img/map.png` - background: the Terminus (`crescendo_01`) map texture, **no hex overlay**.
- `img/<name>.png` - character portraits (copied from the datamine's `sprites/`, files named
  `ui_image_RoundPortrait_<id>_01.png`; copied to a short name like `adept_hospitaller.png`).
- Opened locally as a `file://` URL in Chrome.

## Look
- **Background (always visible, behind every page):** `#bg`, a fixed square image
  `max(100vw,100vh)` on a side so the smaller page dimension is filled ("cover"), scaled up an extra
  1.15x so the blur's soft edges fall off-screen, with `filter: blur(var(--blur))`.
  `--blur` is `20px` (CSS variable at the top of the stylesheet); change it there, not inline.
- **Text:** white, `system-ui`, weight 800, `6.5vh`, centered, with a heavy black text-shadow
  (`0 0 1.5vh #000, 0 0 1.5vh #000, 0 .4vh .8vh #000`) so it reads over the busy map. No panels or
  boxes behind plain text pages.
- **Sizes are in `vh`/`vw`** so everything scales with the window. Don't use px for layout.
- **Sub-points** (indented lines under a header): `5vh`, weight 700, pulled up `1.5vh` toward
  their header. Only on `.left` pages is the indent applied (`margin-left: 4vw`).
- **Left-aligned page** (`.text.left`): content starts 10vw from the left edge, flush-left text.
  Default text pages are centered. Left/center is a per-page choice - only the first page is left.
- **Headers on list-style pages have no trailing colon.**
- **Arrows in text:** use `→` (never `->`), with two spaces either side: `Clear Waves  →  Crusade Points`.
  Use an en dash `–` rather than a hyphen for "label – value" lines where it's a range/value split
  (the "From Crate 15  –  1K+" line); plain hyphens are fine inside phrases.
- **Numbers:** abbreviate to `1K+`, `2K : 1` - lines must stay on one line (no wrapping), so
  prefer shortening wording over shrinking the font.
- **Tier list page:** three rows, S / A / B and nothing else. Each row is a dark translucent panel
  (`rgba(0,0,0,.45)`, 12px radius) with a colored letter tab (S `#ff5a5a`, A `#ffae3d`,
  B `#f2e24a`, dark letter) and round portraits (`15vh`) with the character name under each
  (`2.4vh`, bold white, black glow).

## Behavior
- The page is a sequence of "pages"; each page has "items". Order: text pages in the order of
  `TEXT_PAGES`, then the tier list last.
- **Every item starts at 10% opacity** and fades to 100% over 1 second (`--fade: 1s`,
  `transition: opacity`) when revealed. Untalked-about things stay faint but visible.
- **Right arrow (or space)** reveals the next item; once a page is fully revealed the next press
  moves to the next page (all its items back at 10%). **Left arrow** hides the last item, and from
  the first item of a page returns to the previous page fully revealed.
- On the tier list, items are the characters in order S row, then A, then B, left to right. Items
  on earlier pages stay "on" when going back.
- A leading space on a `TEXT_PAGES` string marks it as a sub-point (see above).

## Adding a text page
1. Add an empty `<div class="text page"></div>` in `index.html` at the position you want it, among
   the other `.text.page` divs (add the class `left` for the left-aligned variant).
2. Add the matching array of strings at the **same index** in `TEXT_PAGES` (the Nth `.text.page`
   div gets the Nth array). Order of the divs = order on screen.
3. Reload in Chrome and click through with the right arrow. Check that no line wraps at a typical
   window width and that the page fits without scrolling (`html,body` are `overflow:hidden`).

## Adding a character
Copy the portrait into `img/` with a short name, then add `['<file stem>', 'Display Name']` to the
right tier in `TIERS`. Keep the order the user dictates - it's the order they're revealed.

## Checklist before saying "done"
- Syntax-check the inline script (extract it and run `node --check`).
- Be clear that you haven't visually verified it unless you actually opened it in a browser.
