# datamine_tacticus

A tool for datamining Snowprint's Tacticus game files.

## Image Miner

This is a Python script that uses the excellent [UnityPy Python library](https://github.com/K0lb3/UnityPy) to extract the game's images.

### Setup

- Ensure you have Python 3 installed
- `pip install -r requirements.txt` to install dependencies

### Usage

The game's files need to be navigable on your system as standard files and folders - APK files can be changed from `.apk` to `.zip` and extracted to achieve this.

Provide the folder path containing the game assets, and a directory path to save the images.

```sh
# Example for macOS game location
python image_miner.py $HOME/Library/Caches/tacticus/games/$GAME_VERSION_HASH/Tacticus.app ./out
```

## Guild boss seasons

Two things about the guild-raid season schedule are easy to get wrong, and both
matter if you want to answer "which boss is live right now?" or "what was in
season N?".

### Seasons are 13 days long, not 14

`guildBoss.misc` carries both halves of the schedule:

| Field                  | Value       | Meaning                              |
| ---------------------- | ----------- | ------------------------------------ |
| `seasonDuration`       | `1209600` s | 14d, the full start-to-start cycle   |
| `bufferAfterSeasonEnd` | `86400` s   | 24h of dead time after a season ends |

So a season is playable for 13 days and is then followed by a 24-hour gap.
`firstSeasonStart` is the epoch of the first _gap_, not the first playable
season. Season 0 opens one buffer later.

Treating seasons as 14 days back-to-back puts every computed window a day early
and, during each gap, advances the rotation slot a season too soon, so the
"active" config names the next boss while the previous season is still closing
out. That's ~7% of every cycle.

`extract_all.ts guild_boss --summary` reports the corrected window, the in-game
season number, and an explicit `inGap` note:

```sh
npx tsx extract_all.ts guild_boss --global-config live_config.json --summary
```

Note that the raw cycle index and the season number the game _displays_ differ
by a fixed calibration offset (`IN_GAME_SEASON_NUMBER_OFFSET` in
`extract_guild_boss.ts`). Both offsets in that file are empirical. If a future
game epoch shift moves them, recalibrate against the live game.

### The rotation is a sliding window, so keep every capture

`guildBossSeasonConfigRotation` looks like a static 5-entry table, but the game
rolls each `config_N`'s _contents_ forward over time. Any single GlobalConfig
snapshot therefore only describes its own ~5-season neighbourhood.

If you only ever keep the newest snapshot:

- "what bosses were in season 97?" becomes unanswerable once the window moves on
- "what bosses are in season 118?" is wrong, silently, with nothing to catch it
- overwriting `guild_boss.json` on each refresh destroys older windows for good

`merge_season_lineups.ts` accumulates each capture into one season-keyed overlay
instead. Run it on every config refresh and commit the result, since the value is
entirely in the accumulated history:

```sh
npx tsx extract_all.ts season_lineups \
  --global-config live_config.json \
  --overlay season-lineups.json
```

Each run contributes the `rotation.length` seasons it can see. Overlapping
seasons resolve by newest `capturedAt`, so an in-game rebalance wins over a
stale capture and an older capture can still backfill history it uniquely
covers. Re-running the same capture is idempotent.
