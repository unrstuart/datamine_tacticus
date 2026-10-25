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

## Layout

- `src/core/hex.ts`: the hex grid (flat-topped, odd columns raised, `row` grows north): neighbours, distance.
- `src/core/board.ts`: a board addressed by visual-grid cells; hex data, boss platforms.
- `src/core/zkar.ts`: the three-hex summon footprint rule.
- `src/ui/`, `src/App.tsx`: the viewer.
