import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';
import {
    ConfigVisualJson,
    IMG_SIZE,
    LevelJson,
    classify,
    deriveMetrics,
    renderBareBoard,
    tileCenter,
    toOutputPixels,
    visualDims,
} from './hex_map_core';

// Guild raid (guild boss) boards for the raid planner: every board used by guild_boss.json's encounters, as a plain
// cropped background image plus a JSON description of its hexes.
//
//   npx tsx extract_raid_boards.ts <guild_boss.json> <boards-assets-dir> <out-dir> [scale] [--live-config=<liveconfig.N.json>]
//
// <boards-assets-dir> is an extracted-assets root with monobehaviour/<BoardId>.json, ..._Config_Visual.json and
// texture2d/<BoardId>_Visual.png (the 1.43.94 marketing dump has all 107). Writes
//   <out-dir>/boards/<BoardId>.jpg     the board texture cropped to the drawn hexes, downsampled by `scale` (default 0.4)
//   <out-dir>/boards.json              { [BoardId]: Board }
//   <out-dir>/bosses.json              [{ bossType, encounters: [{ type, boardId, unitId, icon? }] }]
//   <out-dir>/bosses/<unitId>.png      the encounter boss's round portrait (when the dump has one)
//   <out-dir>/enemies.json             { [unitId]: [{ rarity, stars, rank, armor, health }] } for every boss and minion of those
//                                      encounters: the game's stat rows (one per rarity / star / rank step; rank is the planner's
//                                      1-based index, Stone I = 1)
//   <out-dir>/raid-tiers.json          [{ tier, set, label, level }]: the raid tiers (Common 1 .. Mythic 3) and the stat row (1-based,
//                                      the ":n" on the encounters' unit ids) each one fights at
//
// Hex adjacency is defined on the visual grid (vCol, vRow): vRow grows northward and ODD columns are staggered half a
// hex SOUTH. The logical (column, row) is what the game addresses units and spawn points by; it is kept for reference.
// Every logical cell is exported, with `passable: false` for the ones that can't be stood on (rocks / blocked / forced
// unplayable) - fliers cross those.
//
// `elevation` is the gameplay elevation (the level's own Elevation; a bridge deck sits level with the land at its
// ends), while the pixel position uses the drawn elevation. `trench` marks Trench tiles. A Bridge tile is a narrow ramp:
// it connects only along its axis, given by the tile's Rotation. The mapping (screen angle = 210 - 60 * rotation, an axis
// being a pair of opposite directions) was read off GB_Magnus_03 and checked against all 90 bridges on the raid boards:
// the predicted ends are land on both sides for every bridge that has a usable axis.

interface Hex {
    column: number;
    row: number;
    vCol: number;
    vRow: number;
    /** Gameplay elevation. */
    elevation: number;
    tile: string;
    passable: boolean;
    trench: boolean;
    /** For a bridge: the two directions it connects (flat-topped names, N/NE/SE/S/SW/NW). */
    bridge?: [string, string];
    /** Pixel centre in the exported image. */
    x: number;
    y: number;
}

interface BossPlatform {
    size: number;
    hexes: Array<{ column: number; row: number }>;
}

interface Board {
    boardId: string;
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
    /** Hex outline size in the exported image (flat-topped: the full corner-to-corner width and the flat-to-flat height). */
    hexWidth: number;
    hexHeight: number;
    hexes: Hex[];
    bossPlatforms: BossPlatform[];
    /** Where the player's characters start: the first 5 player spawn points of spawn-point set 0, as logical cells. */
    deploy: Array<{ column: number; row: number }>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// Bridge rotation -> the pair of directions it connects.
const BRIDGE_AXES: Record<number, [string, string]> = {
    0: ['NE', 'SW'],
    1: ['NW', 'SE'],
    2: ['N', 'S'],
    3: ['NE', 'SW'],
    4: ['NW', 'SE'],
    5: ['N', 'S'],
};

/** The sprite file for a boss encounter's round portrait: exact name, then the Minion spelling the Ork mini bosses use. */
function bossPortrait(spriteFiles: Map<string, string>, unitId: string): string | undefined {
    for (const name of [unitId, unitId.replace('MiniBoss', 'Minion')]) {
        const exact = spriteFiles.get(`ui_image_portraitround_${name}.png`.toLowerCase());
        if (exact) return exact;
        const prefix = [...spriteFiles.keys()].find((k) => k.startsWith(`ui_image_portraitround_${name}`.toLowerCase()));
        if (prefix) return spriteFiles.get(prefix);
    }
    return undefined;
}

async function main() {
    const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
    const [guildBossPath, assetsDir, outDir, scaleArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    // --live-config=<liveconfig.N.json>: take the raid tiers from the live config, which can be newer than guild_boss.json.
    const liveConfigPath = flags.find((f) => f.startsWith('--live-config='))?.slice('--live-config='.length);
    if (!guildBossPath || !assetsDir || !outDir) {
        console.error('usage: extract_raid_boards.ts <guild_boss.json> <boards-assets-dir> <out-dir> [scale] [--live-config=<liveconfig.N.json>]');
        process.exit(2);
    }
    const scale = scaleArg ? Number(scaleArg) : 0.4;
    const guildBoss = JSON.parse(fs.readFileSync(guildBossPath, 'utf-8'));

    // bossType -> encounter type -> board id -> unit id, in first-seen order.
    const bosses = new Map<string, Map<string, Map<string, string>>>();
    // board id -> the unit ids of the minions that fight alongside the boss on it (an encounter's npc1id / npc2id / enemies).
    const minionIds = new Map<string, Set<string>>();
    const enemyUnitIds = new Set<string>();
    for (const season of Object.values<any>(guildBoss.guildBossSeasonDataConfigsGDTO)) {
        for (const tier of season.tiers) {
            for (const set of tier.sets) {
                for (const enc of set.encounters) {
                    const types = bosses.get(enc.bossType) ?? new Map<string, Map<string, string>>();
                    const boards = types.get(enc.guildBossEncounterType) ?? new Map<string, string>();
                    if (!boards.has(enc.boardId)) boards.set(enc.boardId, String(enc.unitId).split(':')[0]);
                    const base = (id: string) => String(id).split(':')[0];
                    enemyUnitIds.add(base(enc.unitId));
                    const minions = minionIds.get(enc.boardId) ?? new Set<string>();
                    for (const id of [enc.npc1id, enc.npc2id, ...(enc.enemies ?? [])]) if (id) minions.add(base(id)), enemyUnitIds.add(base(id));
                    minionIds.set(enc.boardId, minions);
                    types.set(enc.guildBossEncounterType, boards);
                    bosses.set(enc.bossType, types);
                }
            }
        }
    }
    const boardIds = [...new Set([...bosses.values()].flatMap((t) => [...t.values()].flatMap((b) => [...b.keys()])))].sort();

    fs.mkdirSync(path.join(outDir, 'boards'), { recursive: true });
    const boards: Record<string, Board> = {};
    const problems: string[] = [];

    for (const boardId of boardIds) {
        const levelPath = path.join(assetsDir, 'monobehaviour', `${boardId}.json`);
        const configPath = path.join(assetsDir, 'monobehaviour', `${boardId}_Config_Visual.json`);
        const imagePath = path.join(assetsDir, 'texture2d', `${boardId}_Visual.png`);
        const missing = [levelPath, configPath, imagePath].filter((f) => !fs.existsSync(f));
        if (missing.length > 0) {
            problems.push(`${boardId}: missing ${missing.map((f) => path.relative(assetsDir, f)).join(', ')}`);
            continue;
        }
        const level: LevelJson & { BossPlatforms?: Array<{ Size: number; Tiles: Array<{ Column: number; Row: number }> }> } = JSON.parse(fs.readFileSync(levelPath, 'utf-8'));
        const config: ConfigVisualJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        try {
            deriveMetrics(level.Width, level.Height, visualDims(config));
        } catch {
            problems.push(`${boardId}: board size ${level.Width}x${level.Height} isn't calibrated in hex_map_core`);
            continue;
        }

        const canvas = createCanvas(IMG_SIZE, IMG_SIZE);
        const render = renderBareBoard(canvas, level, config, await loadImage(imagePath), { downsampleFactor: scale });
        if (!render) {
            problems.push(`${boardId}: no drawable tiles`);
            continue;
        }
        fs.writeFileSync(path.join(outDir, 'boards', `${boardId}.jpg`), canvas.toBuffer('image/jpeg', { quality: 0.85 }));
        const pxScale = render.rect.outW / render.rect.cropW;

        const hexes: Hex[] = [];
        for (let vCol = 0; vCol < config.VisualTiles.length; vCol++) {
            for (let vRow = 0; vRow < config.VisualTiles[vCol].Tile.length; vRow++) {
                const vis = config.VisualTiles[vCol].Tile[vRow];
                if (!vis.IsPlayable) continue;
                const lvl = level.Tiles[vis.LogicalColumn]?.Tile[vis.LogicalRow];
                if (!lvl) continue;
                const result = classify(vis, lvl);
                const drawnElevation = result.draw ? result.elevation : vis.Configuration.Elevation;
                const centre = toOutputPixels(render.rect, tileCenter(render.metrics, vCol, vRow, drawnElevation));
                hexes.push({
                    column: vis.LogicalColumn,
                    row: vis.LogicalRow,
                    vCol,
                    vRow,
                    elevation: lvl.Elevation,
                    tile: lvl.TileId,
                    passable: result.draw,
                    trench: vis.Configuration.TileId === 'Trench',
                    ...(lvl.TileId === 'Bridge' ? { bridge: BRIDGE_AXES[(lvl as any).Rotation] ?? undefined } : {}),
                    x: round2(centre.x),
                    y: round2(centre.y),
                });
            }
        }
        hexes.sort((a, b) => a.column - b.column || a.row - b.row);

        boards[boardId] = {
            boardId,
            width: level.Width,
            height: level.Height,
            imageWidth: canvas.width,
            imageHeight: canvas.height,
            hexWidth: round2(render.metrics.hexWidth * pxScale),
            hexHeight: round2(render.metrics.hexHeight * pxScale),
            hexes,
            deploy: (level.SpawnPointSets[0]?.SpawnPointGroups.find((g) => g.TeamWithPlayerIndex === 0)?.SpawnPoints ?? [])
                .slice(0, 5)
                .map((p) => ({ column: p.Column, row: p.Row })),
            bossPlatforms: (level.BossPlatforms ?? []).map((p) => ({
                size: p.Size,
                hexes: p.Tiles.map((t) => ({ column: t.Column, row: t.Row })),
            })),
        };
    }

    fs.writeFileSync(path.join(outDir, 'boards.json'), JSON.stringify(boards, null, 1));
    // Round portraits of the encounter bosses, shrunk to 160px.
    const spriteDir = path.join(assetsDir, 'sprites');
    const spriteFiles = new Map(fs.readdirSync(spriteDir).map((f) => [f.toLowerCase(), f]));
    fs.mkdirSync(path.join(outDir, 'bosses'), { recursive: true });
    const icons = new Map<string, string | undefined>();
    for (const unitId of new Set([...bosses.values()].flatMap((t) => [...t.values()].flatMap((b) => [...b.values()])))) {
        const file = bossPortrait(spriteFiles, unitId);
        if (!file) {
            problems.push(`${unitId}: no round portrait sprite`);
            icons.set(unitId, undefined);
            continue;
        }
        const image = await loadImage(path.join(spriteDir, file));
        const size = 160;
        const canvas = createCanvas(size, size);
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        fs.writeFileSync(path.join(outDir, 'bosses', `${unitId}.png`), canvas.toBuffer('image/png'));
        icons.set(unitId, `bosses/${unitId}.png`);
    }
    const bossList = [...bosses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bossType, types]) => ({
            bossType,
            encounters: [...types.entries()].flatMap(([type, ids]) =>
                [...ids.entries()].filter(([id]) => boards[id]).map(([boardId, unitId]) => ({ type, boardId, unitId, icon: icons.get(unitId), minionIds: [...(minionIds.get(boardId) ?? [])] }))
            ),
        }));
    fs.writeFileSync(path.join(outDir, 'bosses.json'), JSON.stringify(bossList, null, 1));

    // The stat rows of every boss and minion: armor and health by rarity, stars and rank (the game's Rank is 0-based).
    const enemies: Record<string, Array<{ rarity: string; stars: number; rank: number; armor: number; health: number }>> = {};
    for (const id of [...enemyUnitIds].sort()) {
        const set = guildBoss.unitSets[id];
        if (!set) {
            problems.push(`${id}: no stats in unitSets`);
            continue;
        }
        enemies[id] = set.stats.map((row: any) => ({ rarity: row.BaseRarity, stars: row.StarLevel, rank: row.Rank + 1, armor: row.FixedArmor ?? 0, health: row.Health ?? 0 }));
    }
    fs.writeFileSync(path.join(outDir, 'enemies.json'), JSON.stringify(enemies));

    // The raid tiers: season config -> tier (a rarity) -> set (1..n within it). Each set's encounters name their stat row by the
    // ":n" after the unit id, and every season config agrees on it.
    const TIER_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
    const levels = new Map<string, number>();
    const tierSource = liveConfigPath ? JSON.parse(fs.readFileSync(liveConfigPath, 'utf-8')).guildBoss : guildBoss;
    for (const [configId, season] of Object.entries<any>(tierSource.guildBossSeasonDataConfigsGDTO)) {
        for (const tier of season.tiers) {
            for (const set of tier.sets) {
                const rows = new Set<number>(set.encounters.map((enc: any) => Number(String(enc.unitId).split(':')[1])));
                const key = `${tier.tier},${set.set}`;
                if (rows.size !== 1) problems.push(`${configId} tier ${tier.tier} set ${set.set}: encounters use rows ${[...rows].join(',')}`);
                const level = [...rows][0];
                if (levels.has(key) && levels.get(key) !== level) problems.push(`${configId} tier ${tier.tier} set ${set.set}: row ${level}, other seasons ${levels.get(key)}`);
                levels.set(key, level);
            }
        }
    }
    const tiers = [...levels.entries()]
        .map(([key, level]) => {
            const [tier, set] = key.split(',').map(Number);
            return { tier, set, label: `${TIER_NAMES[tier] ?? `Tier ${tier}`} ${set + 1}`, level };
        })
        .sort((a, b) => a.tier - b.tier || a.set - b.set);
    fs.writeFileSync(path.join(outDir, 'raid-tiers.json'), JSON.stringify(tiers, null, 1));

    console.log(`${Object.keys(boards).length}/${boardIds.length} boards -> ${outDir}`);
    for (const problem of problems) console.log('PROBLEM', problem);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
