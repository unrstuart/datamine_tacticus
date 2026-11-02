// render_hex_tiles.tsx

import * as fs from 'fs';
import * as path from 'path';
import { file } from 'zod';
import { addHexesToMap, ConfigVisualJson, LevelJson } from './hex_map_core';
import { createCanvas, loadImage } from 'canvas';

const IMG_SIZE = 2048; // must match hex_map_core.ts's IMG_SIZE - the coordinate math is calibrated to it

/**
 * Finds pairs of JSON files where both a base file and a
 * _Config_Visual.json file exist (case-insensitive).
 * * @param targetDir The directory to search in.
 */
function findJsonPairs(targetDir: string, texturesDir: string): string[] {
    const ret: string[] = [];
    try {
        // 1. Get all files in the directory
        const files = fs.readdirSync(targetDir);
        const textureFiles = fs.readdirSync(texturesDir).filter(file => file.toLowerCase().endsWith('.png'));

        // 2. Identify the base .json files (excluding the visual configs themselves)
        const baseJsonFiles = Object.fromEntries(
            files
                .filter(file => {
                    const lower = file.toLowerCase();
                    return lower.endsWith('.json') && !lower.endsWith('_config_visual.json');
                })
                .map(file => [file.substring(0, file.length - '.json'.length), file])
        );
        const allJsonFiles: Record<string, string> = Object.fromEntries(
            files.filter(file => file.toLowerCase().endsWith('.json')).map(f => [f.toLowerCase(), f])
        );
        const allTextureFiles = Object.fromEntries(textureFiles.map(f => [f.toLowerCase(), f]));

        console.log(`Searching for pairs in: ${path.resolve(targetDir)}`);
        console.log('--------------------------------------------------');

        let matchCount = 0;

        for (const [key, file] of Object.entries(baseJsonFiles)) {
            const prefix = key;
            const expectedVisualName = `${prefix}_Config_Visual.json`.toLowerCase();
            const textureName = `${prefix}_Visual.png`.toLowerCase();

            const jsonMatch = allJsonFiles[expectedVisualName];
            const textureMatch = allTextureFiles[textureName];

            if (jsonMatch && textureMatch) {
                ret.push(file.substr(0, file.length - '.json'.length));
                matchCount++;
            }
        }

        if (matchCount === 0) {
            console.log('No matching pairs found.');
        }
    } catch (err) {
        console.error(`Error reading directory: ${err}`);
    }
    return ret;
}

/**
 * Boards that are drawn with the spawn-point set their battles name, and written under a prefix so the
 * generic (set 0) image of the same board is left alone. A battle's own `SpawnPointsSet` (absent = 0)
 * picks the set; a board's other sets belong to other modes and would clutter the map with spawn points
 * the battle never uses. Add an entry here to do the same for quest boards, arena boards and so on.
 */
interface BattleSetRender {
    /** Matches a clientGameConfig.battles.battleSets key; capture group 1 is the id --<flag> filters on. */
    keyPattern: RegExp;
    /** Output file prefix: <prefix><boardId>.jpg. */
    prefix: string;
    /** Name of the flag taking a comma separated id list (or "all"). */
    flag: string;
}
const BATTLE_SET_RENDERS: BattleSetRender[] = [
    { keyPattern: /^legendary_event_(\d+)_lane_\d+$/, prefix: 'legendary_event_', flag: 'legendary-events' },
];

interface BoardRender {
    boardId: string;
    prefix: string;
    spawnPointsSetIndex: number;
}

/** Every board the selected battle sets use, with the spawn-point set they use it with. */
function battleSetBoards(battleSets: Record<string, any[]>, flags: Record<string, string | boolean>): BoardRender[] {
    const renders = new Map<string, BoardRender>();
    for (const { keyPattern, prefix, flag } of BATTLE_SET_RENDERS) {
        const wanted = flags[flag];
        if (wanted === undefined) continue;
        const ids = typeof wanted === 'string' && wanted !== 'all' ? new Set(wanted.split(',')) : undefined;
        for (const [key, battles] of Object.entries(battleSets)) {
            const match = key.match(keyPattern);
            if (!match || (ids && !ids.has(match[1]))) continue;
            for (const battle of battles) {
                const spawnPointsSetIndex: number = battle.SpawnPointsSet ?? 0;
                const render = renders.get(prefix + battle.boardId);
                if (render && render.spawnPointsSetIndex !== spawnPointsSetIndex) {
                    throw new Error(
                        `${battle.boardId} is used with spawn point sets ${render.spawnPointsSetIndex} and ${spawnPointsSetIndex} ` +
                            `(${key}); narrow --${flag} so one image per board is enough.`
                    );
                }
                renders.set(prefix + battle.boardId, { boardId: battle.boardId, prefix, spawnPointsSetIndex });
            }
        }
    }
    return [...renders.values()];
}

// --no-crop, --scale <factor>, --powerup-colors, --no-deploy, --no-enemy-spawns,
// --no-powerup-spawns, --label-elevation, --color-elevations, --blue-deploy, --board <ids>, --legendary-events <ids|all>: opt-in flags for addHexesToMap's AddHexesToMapOptions -
// can appear anywhere among the positional args. Defaults match the original
// always-crop-to-25%-with-undifferentiated-spawn-colors-and-no-elevation-labels behavior exactly.
function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(arg);
        }
    }
    return { positional, flags };
}

async function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));

    // Run the script (defaults to current directory '.')
    const targetPath = positional[0] || '.';
    const texturesPath = positional[1] || '.';
    const outputPath = positional[2] || '.';
    const gameConfigPath = positional[3] || null;

    const crop = !flags['no-crop'];
    const downsampleFactor = flags['scale'] ? parseFloat(flags['scale'] as string) : 0.25;
    const distinguishPowerups = !!flags['powerup-colors'];
    const showDeployPoints = !flags['no-deploy'];
    const showEnemySpawns = !flags['no-enemy-spawns'];
    const showPowerupSpawns = !flags['no-powerup-spawns'];
    const labelElevation = !!flags['label-elevation'];
    const colorElevations = !!flags['color-elevations'];
    const blueDeploy = !!flags['blue-deploy'];

    const gameConfig = JSON.parse(gameConfigPath ? fs.readFileSync(gameConfigPath, 'utf8') : '{}');
    const battleSets = gameConfig.clientGameConfig?.battles?.battleSets ?? {};
    const boardIds = new Set<string>();
    // Legendary event boards are rendered below, with the spawn-point set their battles use.
    for (const file of fs.readdirSync(texturesPath)) {
        if (file.startsWith('GB_') && file.endsWith('_Visual.png')) {
            const boardId = file.substring(0, file.length - '_Visual.png'.length);
            boardIds.add(boardId);
        }
    }
    // --board <id[,id...]>: render extra boards (e.g. survival boards) not picked up by the GB_ discovery above.
    if (typeof flags['board'] === 'string') {
        for (const id of (flags['board'] as string).split(',')) boardIds.add(id);
    }
    console.log('boardIds: ', boardIds);
    const jsonPairs = findJsonPairs(targetPath, texturesPath);
    const filteredPairs = jsonPairs.filter(name => boardIds.has(name));
    console.log('jsonPairs: ', jsonPairs);

    const renders: BoardRender[] = filteredPairs.map(boardId => ({ boardId, prefix: '', spawnPointsSetIndex: 0 }));
    for (const render of battleSetBoards(battleSets, flags)) {
        if (jsonPairs.includes(render.boardId)) renders.push(render);
        else console.warn(`No board json / texture for ${render.boardId}; skipped`);
    }

    for (const { boardId: file, prefix, spawnPointsSetIndex } of renders) {
        const imagePath = texturesPath + `/${file}_Visual.png`;
        const levelPath = targetPath + `/${file}.json`;
        const configPath = targetPath + `/${file}_Config_Visual.json`;
        const imageOutputPath = outputPath + `/${prefix}${file}.jpg`;

        const level: LevelJson = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
        const config: ConfigVisualJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Synchronous image loading workaround
        const image = await loadImage(imagePath);

        // Canvas must be IMG_SIZE x IMG_SIZE regardless of the source texture's native
        // resolution - addHexesToMap's internal drawImage always targets IMG_SIZExIMG_SIZE, so a
        // smaller canvas (e.g. survival boards' 1024x1024 textures) would clip the render.
        const canvas = createCanvas(IMG_SIZE, IMG_SIZE);

        addHexesToMap(canvas, level, config, image, {
            crop,
            downsampleFactor,
            distinguishPowerups,
            showDeployPoints,
            showEnemySpawns,
            showPowerupSpawns,
            labelElevation,
            colorElevations,
            blueDeploy,
            spawnPointsSetIndex,
        });

        await new Promise<void>((resolve, reject) => {
            const out = fs.createWriteStream(imageOutputPath);
            const stream = canvas.createJPEGStream();
            stream.pipe(out);
            out.on('finish', resolve);
            out.on('error', reject);
        });
        console.log(`\nWritten to ${imageOutputPath}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
