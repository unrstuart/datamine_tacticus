// Renders battle map images for the replay gallery: the board texture cropped to the playable hexes, the hex grid drawn
// on it, the player's deploy tiles in blue and the enemy spawns in yellow, for the spawn-point set a battle uses.
//
// Usage (from the datamine repo root, which has node_modules with tsx and canvas):
//   npx tsx .claude/skills/raidman-replay-gallery/scripts/render_boards.ts <extracted_assets_dir> <out_dir> <boards.json> [scale]
//
// boards.json is a list of {"board": "C6_06", "spawnSet": 3}. Each is written to <out_dir>/<board>_s<spawnSet>.png at
// `scale` (default 0.5) of the 2048px texture after cropping - the repo's own PVP export uses 0.25. A board whose level
// file, Config_Visual file or texture isn't in the dump, or whose size isn't calibrated in hex_map_core, is skipped and
// reported on stdout as a JSON object {"rendered": [...], "problems": [{"board", "why"}]}. Boards missing from the dump
// need extracting from a build that has them (see BOARD_SOURCE_HINT in extract_all.ts; asset_extract.py).
//
// This reuses hex_map_core.ts (the code behind the tacops board export and add_hexes_to_map.ts), so its calibration
// applies: 5x7 boards are marked "checked by eye only" there, so their overlay can be a few px off.
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { addHexesToMap, ConfigVisualJson, IMG_SIZE, LevelJson } from '../../../../hex_map_core';

interface Request {
    board: string;
    spawnSet: number;
}

async function main() {
    const [assetsDir, outDir, requestsPath, scaleArg] = process.argv.slice(2);
    if (!assetsDir || !outDir || !requestsPath) {
        console.error('usage: render_boards.ts <extracted_assets_dir> <out_dir> <boards.json> [scale]');
        process.exit(2);
    }
    const scale = scaleArg ? parseFloat(scaleArg) : 0.5;
    const requests: Request[] = JSON.parse(fs.readFileSync(requestsPath, 'utf-8'));
    fs.mkdirSync(outDir, { recursive: true });

    const rendered: string[] = [];
    const problems: Array<{ board: string; why: string }> = [];
    for (const { board, spawnSet } of requests) {
        const levelPath = path.join(assetsDir, 'monobehaviour', `${board}.json`);
        const configPath = path.join(assetsDir, 'monobehaviour', `${board}_Config_Visual.json`);
        const imagePath = path.join(assetsDir, 'texture2d', `${board}_Visual.png`);
        const missing = [levelPath, configPath, imagePath].filter((f) => !fs.existsSync(f)).map((f) => path.relative(assetsDir, f));
        if (missing.length > 0) {
            problems.push({ board, why: `not in the dump: ${missing.join(', ')}` });
            continue;
        }
        try {
            const level: LevelJson = JSON.parse(fs.readFileSync(levelPath, 'utf-8'));
            const config: ConfigVisualJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const set = level.SpawnPointSets[spawnSet] ? spawnSet : 0; // a battle's set index should exist; fall back to the first
            const canvas = createCanvas(IMG_SIZE, IMG_SIZE);
            const image = await loadImage(imagePath);
            addHexesToMap(canvas, level, config, image, { blueDeploy: true, spawnPointsSetIndex: set, downsampleFactor: scale });
            fs.writeFileSync(path.join(outDir, `${board}_s${spawnSet}.png`), canvas.toBuffer('image/png'));
            rendered.push(`${board}_s${spawnSet}`);
            if (set !== spawnSet) problems.push({ board, why: `spawn set ${spawnSet} doesn't exist, drew set 0` });
        } catch (error: any) {
            problems.push({ board, why: error.message });
        }
    }
    console.log(JSON.stringify({ rendered, problems }));
}

main();
