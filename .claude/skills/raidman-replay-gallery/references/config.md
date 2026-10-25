# gallery.json

Read by `scripts/build_gallery.py`. Relative paths resolve against the config file's folder; `~` is expanded.

```json
{
  "title": "Death Guard Extremis",
  "author": "Kharnage",
  "intro": "Free text shown under the character summary.",
  "replays_dir": "~/src/kharnage-replays/DG CE",
  "csv": "~/src/kharnage-replays/DG CE/replays.csv",
  "assets_dir": "~/src/datamine_tacticus/extracted_assets_143_94_marketing",
  "out_dir": "~/src/videos/DG CE site",
  "source": {"type": "campaign", "id": "eventExtremis4"},
  "battle_index_regex": "_(\\d+)$",
  "number_keys": ["battleId"],
  "label": "{title} Battle {n}",
  "tiers": [
    {"label": "Epic Tier", "last": 11, "color": "#ffc107"},
    {"label": "Legendary Tier", "last": 22, "color": "#00e5ff"},
    {"label": "Mythic Tier", "last": 30, "color": "#e8833a"}
  ]
}
```

| Key | Meaning |
|---|---|
| `title` | Page heading, `<title>` and the `{title}` in card labels. Required. |
| `author`, `intro` | Optional byline ("by X") and paragraph. Use the user's words. |
| `promo_code`, `promo_label` | Optional. A promo code shown prominently at the top of the roster box (large gold dashed pill, click-to-select so it's easy to copy; no JavaScript). `promo_label` defaults to "Promo code". Use the exact code the user gives. |
| `promo_note` | Optional line under the code, e.g. when it's valid ("Live from October 16th through October 22nd, 2026"). Give dates in full with the year. |
| `replays_dir` | Folder with the replay files named in the CSV (any `.txt` name; `c1.txt`, `x.replay.txt`, ...). |
| `csv` | From `upload_replays.py`: `title,filename,url`. One card per distinct `title`; the latest recording wins (see `variant_labels`). A blank `url` is allowed for a draft before uploading: the card links to `#`. |
| `assets_dir` | An `extracted_assets*` folder: `sprites/` for icons and `text_assets/GameConfig` for ability ids and the battle list. Must match the replays' build. |
| `out_dir` | Gets `index.html` (nothing else), with every image and the font embedded (2-4 MB). Keep it separate from the raw replays. Not used when `site_dir` is set. |
| `site_dir`, `page` | Shared-assets mode, used for everything published: the page is written to `<site_dir>/<page>` (e.g. `~/src/kharnage-replays/site` and `kimm-quest.html`) and its images and font to `<site_dir>/assets/` (`img/<content-hash>.png\|webp`, `fonts/`, `fonts.css`), shared by every page in the site. Pages come out at ~100 KB, and an icon used by three pages is stored once. `category` (optional) is the heading the page is listed under on the site's index (default: from the page name, `-quest` -> Quests, `-extremis` -> Extremis, else Other). Rebuilding a page only adds files; it never deletes from `assets/` (see `cloudflare-pages.md`). |
| `source` | `{"type":"campaign","id":...}`, `{"type":"battle_set","id":...}`, `{"type":"linear_hero_event","id":<eventName or unitId>}` (a quest) or `{"type":"none"}`. `find_battle_source.py` suggests one. |
| `battle_index_regex` | First capture group of the replay title = index into the source's battle list (or, with source `none`, the battle number itself). |
| `battle_index_offset` | Added to the number the regex captures to get the list index. `-1` for linear hero events (`LinearHeroEvent_N` is battle N-1). Default 0. |
| `battle_index_map` | Optional `{"<replay title>": <index>}` that overrides the regex, for titles that don't carry the index. `find_battle_source.py` prints one when the title number doesn't match. |
| `number_keys` | Source fields tried in order for the displayed number (digits at the start). Default `["battleNr","battleId"]`; falls back to index + 1. Campaigns want `["battleId"]`. |
| `label` | Card heading template; `{title}`, `{n}` (battle number), `{tier}` (tier name, with `"tiers": "quest"`), `{k}` (position inside the tier). Quests use `"{tier} {k}"` -> "Epic 3". |
| `layout` | `"grid"` (cards in a two-column grid) or `"rows"` (one battle per row: a header strip with the title, any warning and the reward across the top, then the team with the bonus requirements underneath it; the team wraps onto more lines as the card narrows). Default `rows` for `"tiers": "quest"`, which matches the in-game quest list, else `grid`. |
| `maps` | `true` (default) / `false`. A thumbnail of the battle's map on each card that opens the full map when clicked (needs a source with `BoardId`s, the board files in `assets_dir`, the datamine repo's `node_modules` for `tsx`/`canvas`, and Pillow; otherwise the maps are skipped with a message). |
| `map_scale` | Size of the rendered maps as a fraction of the 2048px board texture after cropping to the playable hexes. Default `0.4` (~390x570 px). The repo's own PVP export uses `0.25`. Larger is sharper in the full view but heavier: each distinct map adds ~40-60 KB (WebP, quality 72). |
| `i2_path` | An `I2Languages_en*.json` (the `mSource.mTerms` format, e.g. `I2Languages_en.1.42.json`; the newest repo copy may lag the build the replays came from, so wording can differ slightly). Needed to show a battle's bonus requirements (`Objectives`) as text; without it they are left out and so is the unmet-bonus warning. |
| `variant_labels` | `{"<csv filename>": "label"}`. Replays listed here are never collapsed into "latest per title"; the label is appended to the card heading, e.g. `Mythic 1 (Super juiced)`. |
| `roster_boost` | Optional `{"replays": ["<csv filename>", ...], "label": "Super juiced"}`. Those replays are left out of the top roster's normal stats; for each unit that is better in them, the roster shows its normal version, an arrow, then the boosted version. A unit with identical stats in both gets no arrow; a unit that only appears boosted is shown boosted, with no arrow. A caption explains the arrow. Cards are unaffected. |
| `tiers` | Optional: a list, `"quest"` (a linear hero event's six tiers named Common..Mythic - brown, bronze, silver, gold, cyan, orange - listed highest first, battles high to low) or `"source"` (one section per source tier, labelled Tier 1.., palette colours). A list is ascending by `last` (highest displayed battle number in the tier); each gets a heading and an outline in its `color`. Numbers past the last tier land in it. Omit for a single ungrouped grid. |

**Rewards** come from the source battle's `loot.chanceOf` (campaigns and quests have it; legendary events and survival battles don't); a battle with no such field simply has no reward icon.

The page needs network only at build time (to fetch the Chakra Petch font, which is embedded or written to `assets/fonts/`). Pillow shrinks the images if present. If the font download fails the page links Google Fonts instead and the script says so.
