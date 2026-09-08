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

// --no-crop, --scale <factor>, --powerup-colors, --no-deploy, --no-enemy-spawns,
// --no-powerup-spawns, --label-elevation: opt-in flags for addHexesToMap's AddHexesToMapOptions -
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

    const gameConfig = JSON.parse(gameConfigPath ? fs.readFileSync(gameConfigPath, 'utf8') : '{}');
    const battleSets = gameConfig.clientGameConfig?.battles?.battleSets ?? {};
    const boardIds = new Set<string>();
    for (const battleSetKey of Object.keys(battleSets)) {
        if (battleSetKey.startsWith('legendary_event_')) {
            for (const battle of battleSets[battleSetKey]) {
                boardIds.add(battle.boardId);
            }
        }
    }
    for (const file of fs.readdirSync(texturesPath)) {
        if (file.startsWith('GB_') && file.endsWith('_Visual.png')) {
            const boardId = file.substring(0, file.length - '_Visual.png'.length);
            boardIds.add(boardId);
        }
    }
    console.log('boardIds: ', boardIds);
    const jsonPairs = findJsonPairs(targetPath, texturesPath);
    const filteredPairs = jsonPairs.filter(name => boardIds.has(name));
    console.log('jsonPairs: ', jsonPairs);

    for (const file of filteredPairs) {
        const imagePath = texturesPath + `/${file}_Visual.png`;
        const levelPath = targetPath + `/${file}.json`;
        const configPath = targetPath + `/${file}_Config_Visual.json`;
        const imageOutputPath = outputPath + `/${file}.jpg`;

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
