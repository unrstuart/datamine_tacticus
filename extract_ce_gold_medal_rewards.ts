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

    if (!inputPath) {
        console.error('Usage: npx ts-node extract_ce_gold_medal_rewards.ts --input <file.json>');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        console.log(`Reading: ${inputPath}...`);
        for (const campaign of data.clientGameConfig.liveEvents.idunLiveEventConfigs[1095].campaigns) {
            console.log('campaign: ', campaign.factionId);
            console.log(' standard:');
            for (const battle of campaign.standardBattles) {
                console.log('  ', battle.campaignBattleId, ": ", battle.loot.goldMedal);
            }
            console.log(' extremis:');
            for (const battle of campaign.extremisBattles) {
                console.log('  ', battle.campaignBattleId, ": ", battle.loot.goldMedal);
            }
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
