# How the page is drawn, and what's inferred

The visual conventions and the sprite naming rules, so a new run reproduces the same look. "Verified" means checked against the data or the rendered result; "inferred" means a reasonable reading nobody confirmed in the game.

## Per unit (top to bottom)

1. **Stars** - `StarLevel` 0-14 drawn on five slots. Levels 1-5 gold (`stars.png`), 6-10 red (`star_epic.png`), 11-13 blue (`star_legendary.png`), 14 the mythic wings. Only the current colour's stars are drawn: level 8 = three red stars, level 9 = four. *Inferred* from the sprites and the user's "three or four red stars" description. Levels 11-13 draw 1-3 blue stars. **Level 14 is the mythic wings emblem** (`ui_icon_star_mythic_large_01.png`) in place of four blue stars - the user's correction after seeing four blue stars on the Nubari quest's mythic units. The rest of the ladder (gold, red, blue) is still unconfirmed against the game.
2. **Round portrait** - `sprites/ui_image_RoundPortrait_<avatarId>.png` where the avatar id comes from `clientGameConfig.avatars` (`{"avatarId": "ultra_inceptor_01", "condition": "hasUnit", "value": "ultraInceptorSgt"}`, premium variants skipped, as `extract_character_data.ts` does). Unit ids and portrait names don't always line up (`ultraInceptorSgt` -> `ultra_inceptor_01`, `ultraEliminatorSgt` -> `ultra_eliminator_01`), so the name heuristic (lower-case, drop punctuation, prefer the plain file over `..._01 1.png` copies) is only the fallback. *Verified* on the 12 units of the Nubari quest, the 6 Death Guard-run units and the 10 shard bosses.
3. **Rarity halo** around every portrait, on every kind of page: the unit's `Rarity` (0-5) picks the colour, the same palette as the quest tiers - Common brown `#8d6e63`, Uncommon bronze `#cd7f32`, Rare silver `#c0c0c0`, Epic gold `#ffc107`, Legendary cyan `#00e5ff`, Mythic orange `#e8833a` (user-specified; originally only Epic and Legendary had one). Uncommon bronze and Mythic orange are fairly close.
4. **Rank badge** - overlaps the portrait's bottom-left corner and hangs ~12px past its left edge (the in-game look; 34x31px with a soft shadow; the ability row starts just below it, so a unit is compact). `sprites/Rank_<n>.png`: 0-2 Stone I-III, 3-5 Iron, 6-8 Bronze, 9-11 Silver, 12-14 Gold, 15-17 Diamond, 18-20 a red/gold set (name unconfirmed; ranks 19 and 20 appear on the Nubari quest's mythic units and render correctly). **There is no `Rank_11.png`**: Silver III is `IdunTextRRank_11.png`. *Verified* by eye on the sprite sheet and by the progression table (each rarity's max rank lands on a tier-I icon).
5. **Ability icons with levels** - active on the left, passive on the right. Ability ids from the GameConfig (`units.lineup.<unit>.activeAbilities[0]`, `.passiveAbilities[0]`), sprite `sprites/ui_icon_ability2_<abilityId>.png` (matched case-insensitively). Level from the replay (`ActiveAbilityLevel`, `PassiveAbilityLevel`).

## Repeatable reward (right side of the card's title line)

From `loot.chanceOf` (`references/battle-sources.md`):

- `shards_<unit>` - the gold laurel `ui_icon_character_shard_default.png` with the unit's round portrait on top.
- `mythicShards_<unit>` - same with the orange laurel `ui_icon_character_shard_mythic.png`.
- `upg<Hp|Arm|Dmg><C|U|R|E|L|M><n>` - `ui_underlay_upgrades.png`, then `ui_icon_upgrade_<id>.png`, then the frame `ui_frame_upgrades_<common|uncommon|rare|epic|legendary|mythic>.png` chosen by the rarity letter.
- Anything else falls back to the plain id as text and is reported by the script. Tooltip: raw id and odds.

The sprites are small (about 52-60 px) and the common/rare frames are hard to tell apart at that size - an open point the user may want to iterate on.

## Bonus requirements (quests)

A card shows one entry per `Objectives` entry, flowing horizontally in a row that wraps only when it runs out of width (so several restrictions don't add height; checked: two fit on one line at 1200px and wrap at 380px): icon, `+100`, the short name (`No-Flying lineup`), tooltip with the full in-game sentence. Wording and sources: `battle-sources.md`. Icons (`objective_icon` in `build_gallery.py`), drawn 28 px; **restrictions get a small red cross badge at the bottom right** of the icon of the thing that is banned:

| Objective | Icon |
|---|---|
| `NotTrait` | `ui_icon_trait_<snake_case>_01` + cross. Exceptions: TerminatorArmour -> `..._terminator_amour_01` (the game's spelling); Psyker -> `ui_icon_trait_psychic_01` (the *trait*'s icon; confirmed by the user on Rare 5) and FinalJustice -> `ui_icon_uniteffect_final_vengeance` (*inferred*: no icon carries the trait's own name). Psyker (a trait) and Psychic (a damage type, `ui_icon_damage_profile2_Psychic`) are different things - keep them on separate paths |
| `NotDamageType` / `DamageType` | `ui_icon_damage_profile2_<Type>` (+ cross only for `Not`) |
| `NotFaction` | `ui_icon_trait_faction_<name>_01`, matched loosely on the name (`Ultramarines` ~ `ultramarine`) + cross |
| `UseNoSummons` | `ui_icon_trait_summon_01` + cross |
| `DoNoHealOrRepair` | `ui_icon_trait_healer_01` + cross (untested) |
| `MaxHits` / `MinHits` | `ui_icon_quest_score_hits` (inferred) |
| `HasRangedAttack` | `ui_icon_stat_rangedattack_01` (untested) |
| `NoDamageTakenByAnyHero` | `damage.png` (the golden damage burst, pointed out by the user) + cross |

### Is the bonus met? (`check_objective`)

Each bonus is checked against the units deployed in *that card's replay*, using `clientGameConfig.units` the way `extract_character_data.ts` reads it (the replay's own resolved traits, faction and weapons agree with it - checked on 74 units, the only difference being an extra `Imperial` alliance trait):

| Objective | Unmet when a deployed unit... |
|---|---|
| `NotTrait` | has the trait (`traits`) |
| `NotFaction` | is of that faction (`FactionId`) |
| `NotDamageType` | deals that damage type: its melee weapon, its ranged weapon, or an ability whose `constants` has a `damageProfile*` of that type (active and passive abilities) |
| `DamageType` | does **not** deal that type (same sources) |
| `HasRangedAttack` | has no ranged weapon (`weapons[1]`) |
| `MaxHits` / `MinHits` | has more / fewer hits than the target - the ranged attack's hits if it has one, else the melee attack's (the game's own wording) |
| `UseNoSummons`, `DoNoHealOrRepair`, `NoDamageTakenByAnyHero` | never: they depend on what happens in the battle and would need the replay's event log, so they are **assumed met** (the tooltip says so) |

An unmet bonus is struck through with the offending units named in red, and the card gets a "bonus not met" chip under its title. The checker only knows what the lineup *could* do (a unit with an ability that deals Melta fails a no-Melta bonus even if the ability was never cast) - the game scores it the same way ("only deploying Characters without an attack or ability that deals..."). Verified on the Nubari quest: 15 bonuses met, 1 unmet (No-Flying with Dante in the "300 out of 500" Mythic 1 run), 4 assumed.

The game also has `ui_icon_quest_win_without_trait_*` / `..._damage_type_*` / `..._using_summons` icons, but those belong to the mythic-journey quest tasks; the user asked for the trait/damage icons with a red mark instead.

## Battle maps

Each card has a map thumbnail left of its title; clicking it shows the full map in a lightbox.

- **Which map:** the source battle's `BoardId` and `SpawnPointsSet` (campaigns and quests both have them). `scripts/render_boards.ts` draws it with the datamine repo's own `hex_map_core.ts` (the code behind the tacops board export): the board texture cropped to the playable hexes with the hex grid, **blue = the player's deploy tiles, yellow = the enemy spawns** of that spawn set. All the set's tiles are drawn, not just the lineup's size, so the blue area is where you may deploy. Boards come from `extracted_assets*/{texture2d,monobehaviour}/<BoardId>_*`; the 1.43.94 marketing dump had all 19 Death Guard and 17 quest boards. If a board isn't in the dump the builder reports it and the card has no map; extract it from a build that has it (`asset_extract.py`; `BOARD_SOURCE_HINT` in `extract_all.ts` says which builds). There is no separate board-extraction skill.
- **Calibration:** `hex_map_core.ts` knows 7x9 and 7x10 boards well and marks **5x7 as "checked by eye only"**, so the overlay on 5x7 boards (4 of these 36) can be a few pixels off.
- **Size:** maps are re-encoded as WebP (quality 72) at 0.4 scale: ~1 MB for 17 maps. The same map used by several cards (e.g. two takes of one battle) is embedded once.
- **Card structure (why it isn't one big `<a>`):** a link can't contain another interactive element, so the title is the link and a `::after` stretches it over the whole card, while the thumbnail (a `<label>` at a higher z-index) opens the lightbox. The lightbox is a CSS-only checkbox hack (`.map-open:checked ~ .lb`), so the page still needs no JavaScript; clicking the overlay closes it.
- **Testing it without a mouse:** headless Chrome can't click, so (1) render a copy with `checked` added to the first `.map-open` input to see the lightbox, and (2) inject a script that calls `document.elementFromPoint` at the card body and at the thumbnail and writes the answer into `document.title`, read back with `--dump-dom`: the body must resolve to the title link and the thumbnail to its label.

## Page structure

- Header (title, "by author"), a summary panel of each unit's **best** rank/rarity/stars/ability levels across the replays shown (each field's maximum taken independently) plus the user's intro text, then battle cards. With `roster_boost` the panel shows normal -> arrow -> boosted pairs (`config.md`); a long roster wraps into evenly filled rows.
- Quest pages (`"tiers": "quest"`) list one battle per row, as the in-game quest screen does; campaign pages use a two-column grid. Both share the card: a header strip on top (a 3-column grid: title left, the "bonus not met" chip truly centred, reward right; below ~640px the chip drops to its own centred line), then a body with the team and the bonuses underneath it. Cards must be free to shrink: test narrow layouts in a ~380px **iframe** (headless Chrome won't go below ~500px with --window-size, which silently clips the page and looks like an overflow bug).
- Cards are one `<a>` each (whole card clickable), grouped under tier headings with a coloured outline when `tiers` are given.
- Style follows tacticus-raidman.com's theme tokens (dark zinc surfaces, faint white borders, 10 px radius, blue accent, Chakra Petch) as read from its stylesheet. The rendered site itself could not be seen, so this is a resemblance, not a copy.

## Why the output is one file

Every image becomes an `<i>` with a CSS class whose `background-image` is a data URI, defined **once** per distinct image. The same portraits and ability icons repeat on every card; inlining each `<img>` would have been ~10x bigger. Images are shrunk to about 2x their display size (Pillow) and the four latin weights of Chakra Petch are embedded as woff2. Result: 2-4 MB for 18-24 cards including their maps, no external requests except the links.

## Known gaps

- No equipment (not in replays).
- Not checked: Safari/Firefox. Layouts were checked in headless Chrome at 1200, 700 and 380px.
- The star colour ladder (gold, red, blue) is inferred except that level 14 is the wings (user-confirmed); the rank names above 17 and the Psyker/Final Vengeance/hits icons are the other inferences, marked where they occur.
- Bonus checks only know what a lineup could do, not what happened in the battle (see above).
