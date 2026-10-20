# Where a replay's battle is defined

The gallery needs two things from the game data: the **ordered list of battles** the replay titles index into (for numbering and the repeatable reward) and nothing else - unit stats come from the replays themselves. `scripts/find_battle_source.py` finds the list by matching enemy units.

## Tested: campaign events

- Path: `clientGameConfig.battles.campaigns.<Standard|Mirror|Elite|EliteMirror|Event>[].battles[]`, each campaign having an `id` (`eventStandard1..7`, `eventExtremis1..7`, ...).
- **Replay id N = zero-based index N** in that `battles` list. Verified for `eventExtremis4`: the enemies of all 27 replays matched `battles[N]`, none contradicted.
- Each battle has `battleId` (`"07"`; bonus battles are `"03B"`, `"13B"`, `"25B"`), `BoardId`, `units` (enemy teams as `"unitId:N"` (N is a progression index, not a level)), `power`, `xp`, `staminaCost`, `lightningVictory`, `requiredUnits` and `loot`.
- The displayed battle number is the `battleId`'s digits. That is why battles 3B/13B/25B shift the index-vs-number mapping, and why nobody should hard-code offsets.
- `loot`: `base` (gold range), `star1/2/3` (one-time rewards for each star), and **`chanceOf` = the repeatable drop**, written `<item>%<a>/<b>`. Items are `upgHp|upgArm|upgDmg` + rarity letter + number, `shards_<unit>`, or `mythicShards_<unit>`. The `a/b` odds aren't decoded - show them only as a tooltip, never as a percentage.
- `eventExtremis<N>`'s `allowedFactions` are the **player's** factions. The "Death Guard Extremis" (enemies: Death Guard) is `eventExtremis4`, whose player factions are Sisterhood/Black Templars - match by enemies, not by the name you expect.
- `starChests` were all empty in 1.43.94.

## Linear hero events ("quests") - checked with 18 real replays (Nubari quest, `linear_hero_event_4`)

The datamine repo's `extract_hero_quests.ts` shows how they work (there is no `extract_quests.ts`). Not to be confused with `extract_mythic_quests.ts`, which covers the *mythic journey* quest chains (task lists under `quests.groups.hero.quests`, no battles).

- Path: `clientGameConfig.liveEvents.idunLiveEventConfigs[]` entries with `eventType: "linearHeroEvent"` (5 in 1.43.94, `eventName` `linear_hero_event_N`, featured hero in `unitId`, enemy faction in `trackingAdditionalData`). That array also holds thousands of unrelated live events - always filter on `eventType`.
- Each has `tiers[]` (`index`, `battles[]`). `linear_hero_event_5` (Votann Champion) has 6 tiers with 3, 3, 5, 3, 2, 1 battles = 17.
- A battle: `battleNr` (a string, "1".."17", continuous across tiers), `BoardId`, `deployedUnit` (`votanChampion_LHE:1` - the fixed unit the player fights with, `id:N` where `extract_hero_quests.ts` calls N the progressionIndex), `enemies` (`"orksNpc2OrkBoy:2"`, same `id:N` form), `lightningVictory`, `Objectives` (e.g. NoDamageTakenByAnyHero), and `loot` with the same `base/star1/star2/star3/chanceOf` as campaigns - so the repeatable reward works unchanged (`star1` is `shards_<hero>` on these).
- Gallery config: `"source": {"type": "linear_hero_event", "id": "linear_hero_event_5"}` (the `unitId` also works), `"number_keys": ["battleNr"]`, and `"tiers": "source"` for one section per quest tier. Battles are flattened in tier order, so replay index k is the k-th battle overall.
- **Replays**: `BattleConfiguration.Id` is `LinearHeroEvent_<N>` with N = the config's `battleNr`, **1-based** (so list index = N - 1: `"battle_index_offset": -1`); `GameMode` is `LinearHeroEvent`; `MetaData.Data` is `encounterId: [LinearHeroEventEncounterId:"N"]`. All 18 replays' enemies matched `linear_hero_event_4`'s battle N-1. The player's units appear under their plain ids (`astarEradicator`, `adeptRetributor`, ...), not `_LHE` ones. The `plain_unit_id` fallback in the builder is therefore a harmless leftover.
- **Tiers = rarities**: the six tiers (3/3/5/3/2/1 battles) are Common, Uncommon, Rare, Epic, Legendary, Mythic, and players name battles by position in the tier (Epic 3, Rare 5, Mythic 1). `"tiers": "quest"` builds that, shown highest first with each tier's battles high to low.
- **Bonus requirements** are the battle's `Objectives[]` (`ObjectiveType`, `ObjectiveTarget`, `Score` = 100): `NotTrait`, `NotFaction`, `NotDamageType`, `DamageType`, `MaxHits`, `MinHits`, `HasRangedAttack`, `UseNoSummons`, `DoNoHealOrRepair`, `NoDamageTakenByAnyHero`. Text comes from the I2 language file (`I2Languages_en.1.42.json`, set `i2_path`): the short name from `UI/LegendaryEvent_Objective_Name_<Type>` ("No-Flying lineup"), the long one from `UI/LinearHeroEvent_BPP_InfoTooltip_<Type>`; targets are looked up as `Traits/<T>_Name`, `UnitDetails/Faction_<F>`, `S/<Type>_Dmg`. `NoDamageTakenByAnyHero` has no term in the dump - the page says "No damage taken" (our wording). `lightningVictory` (e.g. 3) is on every battle but isn't shown; its in-game meaning wasn't checked.
- **Two replays of one battle** can be deliberate (different strategies, e.g. a score-chasing mythic run vs a normal one). The default keeps only the latest per title; list such files in `variant_labels` to keep them all.

## Other modes seen in the config but not tested with replays

- **Legendary events**: `clientGameConfig.battles.battleSets.legendary_event_<N>_lane_<1-3>` (18 battles each). Records have `battleNr`, `boardId`, `tier`, `power`, `waves[].army` (enemy ids), `objectives`, `disallowedFactions` - **no per-battle loot**. LE rewards are elsewhere (points/objectives; see `extract_le_data.ts` and `extract_le_metadata.ts` in the datamine repo). Use `"source": {"type": "battle_set", "id": "<set>"}`; numbering uses `battleNr`; no reward icon will be drawn unless you extend the script with an LE reward source.
- **Survival**: `battleSets.survival_<month>_<year>` / `survival_crescendo_01` - a single battle record with `waves`.
- **Other waves-style modes**: `treasureBeach.tracks[].tiers[].battles`, `onslaught`, `guildBoss` (separate `GlobalGameConfig`).
- Replay titles and `GameMode` values for these modes are unknown until you have a replay. `BattleConfiguration.Id` is the string to look at.

## When the finder finds nothing, or ties

1. Run it against every `text_assets/GameConfig*` and live-config file you have; events appear in the live config before they land in a client build.
2. Ties are normal in campaigns (the same enemy line-up recurs on different boards). If the title number is among the tied candidates for every replay, the index mapping is consistent; spot-check one or two by board id (`mapId` from the upload response vs the record's `BoardId`).
3. If nothing links titles to records, use `"source": {"type": "none"}`: the page still shows the characters and links, just without source-based numbering or rewards. Ask the user for the numbering (or tell them it is the replay number).
4. Write down what you found in this file.

## Dumps in the datamine repo

`extracted_assets*/` hold extractions of different builds. Pick the one matching the replays' `GameVersion`; sprites (`sprites/`) and `text_assets/GameConfig` must come from the same one. The 1.43.94 "marketing" build has the Waves/PVP boards and was fine to use publicly per the user - confirm again for any new publication.
