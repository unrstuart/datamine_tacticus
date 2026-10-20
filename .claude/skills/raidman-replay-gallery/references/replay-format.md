# Replay file format

A `*.replay.txt` file is **base64 -> gzip -> one JSON object**:

```python
import base64, gzip, json
data = json.loads(gzip.decompress(base64.b64decode(open(path).read())))
```

Everything below was read from Death Guard Extremis campaign replays and Nubari quest (linear hero event) replays, all game version 1.43.94 - the format was the same for both. Quest replays differ only in the title and mode fields: `BattleConfiguration.Id` is `LinearHeroEvent_<battleNr>` (1-based), `GameMode` is `LinearHeroEvent`, and `MetaData.Data` is `encounterId: [LinearHeroEventEncounterId:"N"]`. Other modes (legendary events, survival) are unchecked - look before assuming.

## What is in it

| Need | Where |
|---|---|
| Battle title | `BattleConfiguration.Id`, e.g. `CampaignEvent_Extremis_7` (this is also what Raidman shows as the title) |
| Mode | `BattleConfiguration.GameMode` (`CampaignEvent`); `MetaData.Data` is a short label such as `Extremis_7 normal` / `Extremis_32 boss` |
| Game version | `MetaData.GameVersion` (e.g. `1.43.94.5464`) |
| Whose replay | `RecordedPlayerIds` (a list; `11` in every file seen) |
| Player's units | `Messages[].Message.MessageJson` entries with `"Name":"AddUnitMessage"` and `PlayerId` in `RecordedPlayerIds`. In order of addition; `SpawnSource` 5 = the initial deployment. Enemies and summons are added by other players/sources, so filter on `PlayerId`. |
| Per-unit stats | `BattleConfiguration.Units[]` - resolved stats for every unit in the battle, keyed by `ConfigId.PureId`: `Level`, `Rarity`, `Rank`, `StarLevel`, `ActiveAbilityLevel`, `PassiveAbilityLevel`, `TertiaryAbilityLevel`, `Health`, `Damage`, `FixedArmor`, `Power`, ... For the player's own units there is exactly one entry each and it agrees with `MetaData.UnitMetaData.<id>.rank`. |
| Enemy line-up | `Units[]` entries that aren't the player's, plus `BattleConfiguration.PredefinedUnits` (ids look like `deathNpc3Nurglings:22`, `id:N`, N being a progression index) |
| When recorded | `StartingTimestamp` is **0** in these files. Use the first `Messages[].Timestamp` (.NET ticks) to order replays - filenames like `17.10.2026-0807` don't sort across days. |
| Board | `BoardId` is often null. The Raidman upload response carries `mapId` (e.g. `C6_06`) |

## Value meanings

- **Rarity** enum 0-5: Common, Uncommon, Rare, Epic, Legendary, Mythic. `BattleConfiguration.UnitProgression.HeroProgressionSteps` lists the 20 progression steps (rarity, max rank, max ability level, max stars): rarity 3 (Epic) tops out at rank 12 (Gold I), rarity 4 (Legendary) at rank 17 (Diamond III).
- **Rank** 0-20; see `design.md` for the sprite mapping.
- **StarLevel** 0-14; see `design.md` for how it is drawn.
- **Abilities**: the replay's `ActiveAbilities` is a number (e.g. `1014`) and only the passive has a name, so ability *ids* for icons come from the GameConfig (`clientGameConfig.units.lineup.<unit>.activeAbilities[0]` / `passiveAbilities[0]`). Tertiary level was 0 for every unit seen.

## What is not in it

**Equipment (items, their levels) is not recorded** - only its effect on the final stats. Say so instead of guessing from stat deltas. Relics weren't seen either.

## Quirks

- Within one replay each of the player's units had exactly one `Units[]` entry (checked across all 27 Death Guard replays). Don't pool entries *across* replays before reading a unit's stats - a unit's rarity, rank and ability levels change between replays as the player upgrades it; that is why the gallery shows both per-battle stats and a best-of summary.
- Unit-id spelling is camelCase (`adeptCanoness`); portrait sprites are snake_case (`adept_canoness_01`).
