# Tier list presentation page - style and behavior guide

A single static page, `presentation.html`, that is clicked through live while talking. Follow this so new
pages match the existing ones. `presentation.html` is the source of truth; if this file and the code
disagree, the code wins - update this file.

## Files
All in this `presentations/` folder (moved from the repo root).
- `presentation.html` - the whole page (inline CSS + JS, no libraries, no build step).
- `presentation_img/map.png` - background: the Terminus (`crescendo_01`) map texture, **no hex
  overlay** (from `extracted_assets_143_94_marketing/texture2d/crescendo_01_Visual.png`).
- `presentation_img/<name>.png` - character portraits (copied from the datamine's `sprites/`, files
  named `ui_image_RoundPortrait_<id>_01.png`; copied to a short name like `adept_hospitaller.png`).
  Image URLs in the page are `presentation_img/...`.
- Opened locally as a `file://` URL in Chrome. Do not publish it anywhere (and mind the EMBARGO rule in CLAUDE.md before
  committing/pushing): the portraits and map are datamined game assets.

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
- **Page Down** skips the rest of the current page's animations (nothing more on it needs to be
  revealed) and moves to the next page, then plays that page's first item's fade-in. On the last
  page (the tier list) it just reveals everything remaining. The first item must still *fade in*:
  force a style flush (`void el.offsetWidth`) after the page becomes visible and before turning
  the item on, or the browser will show it instantly with no transition.
- On the tier list, items are the characters in order S row, then A, then B, left to right. Items
  on earlier pages stay "on" when going back.
- A leading space on a `TEXT_PAGES` string marks it as a sub-point (see above).

## Adding a text page
1. Add an empty `<div class="text page"></div>` in `presentation.html` at the position you want it, among
   the other `.text.page` divs (add the class `left` for the left-aligned variant).
2. Add the matching array of strings at the **same index** in `TEXT_PAGES` (the Nth `.text.page`
   div gets the Nth array). Order of the divs = order on screen.
3. Reload in Chrome and click through with the right arrow. Check that no line wraps at a typical
   window width and that the page fits without scrolling (`html,body` are `overflow:hidden`).

## Adding a character
Copy the portrait into `presentation_img/` with a short name, then add `['<file stem>', 'Display Name']` to the
right tier in `TIERS`. Keep the order the user dictates - it's the order they're revealed.

## Checklist before saying "done"
- Syntax-check the inline script (extract it and run `node --check`).
- Be clear that you haven't visually verified it unless you actually opened it in a browser.

## powerups.html (card-grid page)
Separate single-page file with the same background, 10%-opacity / 1s fade, and key handling
(right/space reveal, left hides, Page Down reveals everything). Its images are in `powerups_img/`
(its own copy of `map.png` plus the icons from `sprites/ui_icon_uniteffect_<name>_powerup_01.png`;
resurrection uses `ui_icon_power_up_resurrect_01.png`, which has no `uniteffect` variant).
Each powerup is a card: rounded rectangle (`2vh` radius, soft `0 1vh 3vh rgba(0,0,0,.55)` shadow),
a 16%-wide solid-white strip with the icon centered both ways, and a beige (`#efe7d6`) text area with
a bold name over a left-aligned, wrapping description. Two columns, filled row by row in the order
of the `POWERUPS` array, five rows filling the viewport height. Each card is one revealed item.

## 143 lightning/presentation.html (video section pages, outside this repo)
Lives at `~/src/videos/143 lightning/presentation.html` (note the space in the folder name), images in its
`graphics/` folder, background `graphics/ui_interstitial_october_2026.png` blurred 20px in CSS, logo
`../tacticus logo red outline.png`. One page per script section, defined in the `PAGES` array
(`title`, `footage`, `groups`). Differences from the other pages:
- **Fixed 1920x1080 stage in px** (DaVinci Resolve's default), scaled to fit the window. Exact at a 1920x1080
  viewport. Use px here, not vh/vw.
- **No fade/reveal**: everything is fully visible; the user does fades in Resolve. Right/Space/PageDown =
  next page, Left/PageUp = previous, Home/End, `#N` in the URL jumps to page N.
- `footage: true` shrinks the content column to 1056px and leaves the right side empty for in-game footage;
  `G` (or `?guides`) draws a dashed box there. `groups` are separate image groups side by side (Quests uses two).
- Images are auto-scaled to the largest uniform size (max 1.5x) that flow-wraps into the content box.
- HUD (page number, viewport size, resize button) auto-hides at exactly 1920x1080; `H` toggles it. The button
  opens a popup and trims it by `outerSize - innerSize` so the *viewport* is 1920x1080; browsers can't resize a
  normal tab, and the window can't exceed the screen's size.
- Titles only (no bullets); Intro/Outro show the Tacticus logo with centered text.
