// render_hex_tiles.tsx

import * as fs from 'fs';
import * as path from 'path';
import { file } from 'zod';
import { addHexesToMap, ConfigVisualJson, LevelJson } from './hex_map_core';
import { createCanvas, loadImage } from 'canvas';

/**
 * Finds pairs of JSON files where both a base file and a
 * _Config_Visual.json file exist (case-insensitive).
 * * @param targetDir The directory to search in.
 */
function findJsonPairs(targetDir: string, texturesDir): string[] {
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

async function main() {
    // Run the script (defaults to current directory '.')
    const targetPath = process.argv[2] || '.';
    const texturesPath = process.argv[3] || '.';
    const outputPath = process.argv[4] || '.';
    const gameConfigPath = process.argv[5] || null;

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

        const canvas = createCanvas(image.width, image.height);

        addHexesToMap(canvas, level, config, image);

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
