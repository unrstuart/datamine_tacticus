# Raid planner

Plans one guild raid round for a fixed comp (Abaddon, Ahriman, Abraxas, Archimatos, Neurothrope + Z'kar): searches the
moves, deployment and attack order that apply the most buffs. The rules are in `docs/rules.md`; Z'kar's placement rule is
in `docs/zkar-deployment.md`.

Lives inside datamine_tacticus for now, and has no imports from the rest of the repo, so it can move to its own repo.

## Run

```
npm install
npm run dev      # the app
npm test         # core model tests
```

## Board data

`public/raid/` (the board images and `boards.json` / `bosses.json`) is generated from the game data by
`extract_raid_boards.ts` in the datamine_tacticus root, which needs that repo's `hex_map_core.ts`:

```
npx tsx extract_raid_boards.ts guild_boss.json extracted_assets_143_94_marketing raid-planner/public/raid
```

`bosses.json` lists each boss type with the boards of its encounters (`Boss` = the main fight, `Crystal` = the support
fights). Each board's `bossPlatforms` gives the boss's footprint (1, 3 or 7 hexes) and where it starts.

`public/icons/` (rarity, rank, star and ability icons) and `src/data/units.json` (the six units' base stats, rank-up rows, star
multipliers, weapons and pierce ratios) come from `extract_raid_units.ts`, also in the datamine root:

```
npx tsx extract_raid_units.ts gameconfig.1.42.json extracted_assets_143_94_marketing raid-planner/src/data raid-planner/public
```

## Reading a player's account

The Characters tab takes a player API key (from https://api.tacticusgame.com) and, on Go, reads the units' rarity, stars, rank,
ability levels and relics. The page can't call Snowprint directly, so it calls `/api/player` on its own origin, which forwards the
request with the key in `X-API-KEY` to `https://api.tacticusgame.com/api/v1/player`. In development Vite's proxy does that (see
`vite.config.ts`); in production it is `worker/` (a Cloudflare Worker serving the built app too):

```
npm run build
npx wrangler deploy        # uses wrangler.toml: the worker plus ./dist
```

The key is not stored or logged anywhere. The built app also needs the two cross-origin isolation headers (`public/_headers` sets
them on Cloudflare) so the search's progress counters can use shared memory.

## Layout

- `src/core/hex.ts`: the hex grid (flat-topped, odd columns raised, `row` grows north): neighbours, distance.
- `src/core/board.ts`: a board addressed by visual-grid cells; hex data, boss platforms.
- `src/core/zkar.ts`: the three-hex summon footprint rule.
- `src/core/roster.ts`, `stats.ts`, `damage.ts`, `api.ts`: the units' own stats, the stat and damage formulas, reading an account.
- `src/engine/`, `src/solver/`: the rules engine and the search.
- `src/ui/`, `src/App.tsx`: the board, the Characters tab and the search panel.
- `worker/`: the Cloudflare Worker.
