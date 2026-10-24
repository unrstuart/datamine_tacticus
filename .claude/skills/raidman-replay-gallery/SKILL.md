---
name: raidman-replay-gallery
description: Turn a folder of Tacticus battle replay files into a published walkthrough page - upload the replays to tacticus-raidman.com, then build a single HTML page showing, per battle, the player's characters (portrait, rarity halo, stars, rank, ability levels), the battle's repeatable reward, its bonus requirements (for quests, checked against the lineup) and a link to the replay, and deploy it to Cloudflare Pages. Use this whenever the user has Tacticus replay files (.txt, often named *.replay.txt) and wants them uploaded to Raidman, listed in a "replaylist"/playlist, written up as a walkthrough or guide for an event (campaign events, Extremis, quests / linear hero events, legendary events, survival, etc.), or wants such a page posted to Cloudflare Pages - even if they only mention one part (just the upload, just the page, just the deploy).
---

# Raidman replay gallery

Takes replay files recorded in Tacticus and produces a shareable walkthrough page. The pipeline:

1. **Inspect** the replays and find where their battles are defined in the game data.
2. **Upload** them to tacticus-raidman.com and get a URL per replay (CSV out).
3. **Build** one HTML page from the replays, the CSV and the game data (images and font shared in the site's `assets/` folder; a standalone `index.html` with everything embedded if no `site_dir` is set).
4. **Deploy** it to Cloudflare Pages (preview first, then production).

Tested end to end on two real jobs, both with example configs in `examples/`: the **Death Guard Extremis campaign event** (published) and the **Nubari quest** from battle pass 1.43 (a quest / linear hero event, built as a local draft). Legendary events and survival are supported by the config and finder only as far as `references/battle-sources.md` says - they have not been run with real replays, so read it before promising anything for those.

## Before anything public happens

Steps 2 and 4 publish to public sites and can't be undone. Treat them as separate decisions the user makes:

- **Check for an embargo.** This repo can hold datamined content from an unreleased patch. If `EMBARGO` exists in the repo root, do not upload replays or deploy; tell the user and ask them to remove it first. Also compare the replays' `MetaData.GameVersion` (and the version of the dump you build from) with the builds the user says are public.
- **Dry-run, then confirm.** Show the user the file list (and the upload mode) and get a yes before `--upload`. Get a separate yes before a production deploy.
- Never publish the raw replay files, the CSV, or the repo - only the pages and assets in `kharnage_replays_site/`.

## Step 1 - Inspect the replays and find their source

```bash
python3 -I scripts/find_battle_source.py "<replays_dir>" "<extracted_assets_dir>/text_assets/GameConfig"
```

Replays are base64 -> gzip -> JSON (`references/replay-format.md`). The script tries every `*.txt` in the folder (skipping non-replays), lists each replay's title, game mode, players and enemies, then searches the GameConfig for the battle list the enemies match. It prints the `"source"` config snippet to paste (campaign, quest or battle set), tells you how title numbers map to list positions (`battle_index_regex`, plus `battle_index_offset` when titles are 1-based, as for quests), and names replays that don't fit the winning source - those usually belong to a different event and should be left out. `references/battle-sources.md` covers non-campaign sources, ties, and what to do when nothing matches.

Use the extracted dump that matches the replays' game version; unit ids, ability ids and sprites must all come from the same build.

## Step 2 - Upload to Raidman (or build a draft first)

```bash
python3 -I scripts/upload_replays.py "<replays_dir>" "<replays_dir>/replays.csv"            # dry run
python3 -I scripts/upload_replays.py "<replays_dir>" "<replays_dir>/replays.csv" --upload   # after the user says yes
```

Uploads are **unlisted** unless the user names a guild tag (`--guild-tag`). The CSV (`title,filename,url`) is what the gallery links from. If the user only wants the upload, stop here and give them the CSV. `references/raidman-api.md` has the API details and what to do if the endpoint moves.

**Iterating on the page before publishing:** a replay's URL contains a server-assigned hash that can't be computed offline, so the links can't be known without uploading. Instead write the CSV yourself with `url` left blank: cards link to `#` and the builder says so. Design the page against that, and only upload (with the user's yes) once they are happy; then run the upload to fill in the CSV and rebuild. This is how the Nubari draft was built.

Several replays can share one title. By default only the most recently recorded one per title is shown; replays the user deliberately made as alternatives (e.g. a normal run and a score-chasing one of the same battle) are kept with `variant_labels`.

## Step 3 - Build the page

Write a `gallery.json` (schema in `references/config.md`, examples in `examples/`), then:

```bash
python3 -I scripts/build_gallery.py gallery.json
```

It writes `<site_dir>/<page>` (~100 KB) plus any new images and the font into `<site_dir>/assets/`, or, without `site_dir`, a single `<out_dir>/index.html` with everything embedded (~2-3 MB). Ask the user for what only they know: title, author line (optional), intro text, tier groupings (campaigns), which replays are variants, and whether the roster should show a boosted version (below). Don't invent claims in the intro (clears, scores, which units were used) - use their wording and tell them any typo you fixed.

What the page shows and why (`references/design.md` has the details and the sprite rules):
- **Per unit:** stars, rarity-haloed portrait with the rank badge hanging off its bottom-left corner, then the active and passive ability icons with levels. Equipment isn't in replays, so it isn't shown.
- **Per battle card:** a header strip (a map thumbnail that opens the full map, the title, a warning chip if a bonus is unmet, the repeatable reward), the team, and for quests the bonus requirements underneath. The whole card links to the replay. Maps come from the battle's `BoardId`/`SpawnPointsSet`, rendered with the repo's `hex_map_core.ts` (`scripts/render_boards.ts`, run through `npx tsx` from the repo root, so the build needs Node, the repo's `node_modules` and Pillow); blue tiles are where you deploy, yellow are enemy spawns. Boards missing from the extracted dump are reported and skipped - see `references/design.md`.
- **Quests** (`"tiers": "quest"`): one battle per row, tiers Mythic first down to Common, battles high to low within a tier ("Epic 3, Epic 2, Epic 1"), each tier outlined in its colour. Every bonus requirement is checked against the units actually deployed: unmet ones are struck through with the offender named; ones that depend on what happens in the battle (damage taken, summons, healing) are assumed met.
- **Top summary panel:** each unit's best stats across the replays. With `roster_boost`, units that were pumped for a special replay (e.g. a "super juiced" final battle) show their normal version, an arrow, then the boosted version; units that only exist boosted are shown boosted.

**Look at the result before showing it.** Render it headless and read the screenshot - layout bugs (overlaps, missing images) don't show up in script output:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --screenshot=/tmp/gallery.png --window-size=1200,1400 "file://<site_dir>/<page>"
```

Headless Chrome won't go below ~500px wide with `--window-size` (it silently clips instead), so check narrow layouts inside a ~380px `<iframe>` in a scratch page. The script prints every unit, ability, rank, reward or bonus icon it couldn't find - report those instead of leaving gaps.

**Lightning check:** for sources whose battles have a `lightningVictory` (quests), the build counts the player's turns in each replay (their `EndTurnMessage`s + 1) and prints `WARNING not a lightning victory: ...` for any replay that took more turns, or didn't end in a win. Relay these warnings to the user. The limit is assumed to count the player's own turns; the page itself doesn't show it.

## Step 4 - Deploy to Cloudflare Pages

Every playlist is one HTML page on the single `kharnage-replays` Pages project, named `<name>-quest.html` for quests and `<enemy-faction>-extremis.html` for campaign-event Extremis playthroughs. The site lives in the repo, in `kharnage_replays_site/` (version controlled): one `.html` per playlist plus a shared `assets/` folder holding every image and the font. Build each playlist with `site_dir` and `page` set in its config (`references/config.md`) and the builder writes the page and its assets straight into that folder. A deploy replaces the whole site, so deploy the whole folder, never one page. Follow `references/cloudflare-pages.md`: deploy a **preview** first, then production once the user approves. Save the page's config as `examples/<name>.json` so it can be rebuilt.

## Changing the scripts

The two example configs are the regression tests. Before editing `build_gallery.py`, build both examples to a scratch `site_dir` (copy the config and change `site_dir`; the examples write into the real site folder); after editing, compare the new output with the old (card titles, links, rewards, tier headings, image count) and look at a render. The Death Guard page must come out the same unless you meant to change it (its maps are the one addition since that example was published). Be careful with large find-and-replace edits on this file - one overreaching replacement once silently deleted the tier and intro code. If you extend it for a new source type, write down what you learned in `references/battle-sources.md` so the next run starts further along.

For anything the scripts don't know, the pipeline degrades instead of failing: `"source": {"type": "none"}` builds the page without rewards, source-based numbering or bonus checks.
