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
//   npx tsx extract_raid_boards.ts <guild_boss.json> <boards-assets-dir> <out-dir> [scale]
//
// <boards-assets-dir> is an extracted-assets root with monobehaviour/<BoardId>.json, ..._Config_Visual.json and
// texture2d/<BoardId>_Visual.png (the 1.43.94 marketing dump has all 107). Writes
//   <out-dir>/boards/<BoardId>.jpg     the board texture cropped to the drawn hexes, downsampled by `scale` (default 0.4)
//   <out-dir>/boards.json              { [BoardId]: Board }
//   <out-dir>/bosses.json              [{ bossType, encounters: [{ type, boardId }] }]
//
// Hex adjacency is defined on the visual grid (vCol, vRow): vRow grows northward and ODD columns are staggered half a
// hex SOUTH. The logical (column, row) is what the game addresses units and spawn points by; it is kept for reference.
// Every logical cell is exported, with `passable: false` for the ones that can't be stood on (rocks / blocked / forced
// unplayable) - fliers cross those.

interface Hex {
    column: number;
    row: number;
    vCol: number;
    vRow: number;
    elevation: number;
    tile: string;
    passable: boolean;
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
}

const round2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
    const [guildBossPath, assetsDir, outDir, scaleArg] = process.argv.slice(2);
    if (!guildBossPath || !assetsDir || !outDir) {
        console.error('usage: extract_raid_boards.ts <guild_boss.json> <boards-assets-dir> <out-dir> [scale]');
        process.exit(2);
    }
    const scale = scaleArg ? Number(scaleArg) : 0.4;
    const guildBoss = JSON.parse(fs.readFileSync(guildBossPath, 'utf-8'));

    // bossType -> encounter type -> board ids, in first-seen order.
    const bosses = new Map<string, Map<string, Set<string>>>();
    for (const season of Object.values<any>(guildBoss.guildBossSeasonDataConfigsGDTO)) {
        for (const tier of season.tiers) {
            for (const set of tier.sets) {
                for (const enc of set.encounters) {
                    const types = bosses.get(enc.bossType) ?? new Map<string, Set<string>>();
                    const boards = types.get(enc.guildBossEncounterType) ?? new Set<string>();
                    boards.add(enc.boardId);
                    types.set(enc.guildBossEncounterType, boards);
                    bosses.set(enc.bossType, types);
                }
            }
        }
    }
    const boardIds = [...new Set([...bosses.values()].flatMap((t) => [...t.values()].flatMap((b) => [...b])))].sort();

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
                const elevation = result.draw ? result.elevation : vis.Configuration.Elevation;
                const centre = toOutputPixels(render.rect, tileCenter(render.metrics, vCol, vRow, elevation));
                hexes.push({
                    column: vis.LogicalColumn,
                    row: vis.LogicalRow,
                    vCol,
                    vRow,
                    elevation,
                    tile: lvl.TileId,
                    passable: result.draw,
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
            bossPlatforms: (level.BossPlatforms ?? []).map((p) => ({
                size: p.Size,
                hexes: p.Tiles.map((t) => ({ column: t.Column, row: t.Row })),
            })),
        };
    }

    fs.writeFileSync(path.join(outDir, 'boards.json'), JSON.stringify(boards, null, 1));
    const bossList = [...bosses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bossType, types]) => ({
            bossType,
            encounters: [...types.entries()].flatMap(([type, ids]) => [...ids].filter((id) => boards[id]).map((boardId) => ({ type, boardId }))),
        }));
    fs.writeFileSync(path.join(outDir, 'bosses.json'), JSON.stringify(bossList, null, 1));

    console.log(`${Object.keys(boards).length}/${boardIds.length} boards -> ${outDir}`);
    for (const problem of problems) console.log('PROBLEM', problem);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
