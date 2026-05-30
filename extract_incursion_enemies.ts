import * as fs from 'fs';
import { string } from 'zod';

function getArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
            }
        }
    });
    return args;
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;
    const outputPath = flags.output;

    if (!inputPath || !outputPath) {
        console.error('Usage: npx ts-node extract_incursion_enemies.ts --input <file.json> --output <result.json>');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        console.log(`Reading: ${inputPath}...`);
        console.log('mow,tier,battleId,enemies');
        for (const key of Object.keys(data.clientGameConfig.liveEvents.idunLiveEventConfigs[1094].mows)) {
            const incursion = data.clientGameConfig.liveEvents.idunLiveEventConfigs[1094].mows[key];
            for (const tier of incursion.tiers) {
                for (const battle of tier.battles) {
                    const hasMow = battle.enemies.some((enemy: string) => enemy.includes(incursion.unitId));
                    console.log(incursion.unitId, ',', tier.index, ',', battle.battleId, ',', battle.enemies.length - (hasMow ? 1 : 0));
                }
            }
        }

    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
