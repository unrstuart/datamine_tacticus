import * as fs from 'fs';

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

function getRewardDescription(reward: string): string {
    const lastColon = reward.lastIndexOf(':');
    if (lastColon === -1) return reward;
    const desc = reward.substring(0, lastColon);
    if (desc === 'seasonalEventCurrencyApril2026') return 'Survival Event Currency';
    if (desc === 'ShardsAll') return 'Random Shards of Any Character';
    if (desc === 'stamina') return 'Energy';
    if (desc === 'raidTicket') return 'Raid Ticket';
    if (desc === 'summoningToken') return 'Normal Req Order';
    if (desc === 'specialSummoningToken') return 'Blessed Req Order';
    if (desc.startsWith('xp')) {
        return desc.substr(2) + ' XP Book';
    }
    if (desc.startsWith('ascensionOrbs')) {
        return desc.substr(14) + ' Orb (Random Alliance)';
    }
    if (desc.startsWith('heroAscensionOrb')) {
        const orbType = desc.substr(16);
        const alliance = orbType.substr(orbType.indexOf('_') + 1);
        const rarity = orbType.substr(0, orbType.indexOf('_'));
        return `${rarity} ${alliance} Orb`;
    }
    if (desc.startsWith('abilityToken')) {
        const tokenType = desc.substr(12);
        const alliance = tokenType.substr(tokenType.indexOf('_') + 1);
        const rarity = tokenType.substr(0, tokenType.indexOf('_'));
        return `${rarity} ${alliance} Badge`;
    }
    if (desc === 'ShardsMoW') return 'Random MoW Shards';
    if (desc === 'machinesOfWarAmmo') return 'Munitions';
    if (desc.startsWith('itemAscensionResource')) {
        return desc.substr(22) + ' Forge Badge';
    }
    if (desc === 'gems') return 'Blackstone';
    if (desc === 'gold') return 'Gold';
    if (desc === 'dust') return 'Salvage';
    if (desc === 'mythicDust') return 'Mythic Salvage';
    if (desc === 'ShardsIfUnlocked') return 'Shards of Unlocked Character';
    console.log('unknown reward desc: ', desc);
    return desc;
}

function getRewardQuantity(reward: string): string {
    const parts = reward.split(':');
    return parts[parts.length - 1];
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;
    const outputPath = flags.output;

    if (!inputPath || !outputPath) {
        console.error('Usage: npx ts-node extract_survival_offers.ts --input <file.json> --output <result.json>');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        console.log(`Reading: ${inputPath}...`);
        const offers = data.clientGameConfig.shop.realMoneyProducts;

        for (const day of [1, 2, 3, 4, 5, 6, 7, 0]) {
            console.log('day ', day);
            for (const key of Object.keys(data.clientGameConfig.shop.realMoneyProducts)) {
                const match = key.match(/day_(\d+)/);
                if (!match || parseInt(match[1], 10) !== day) {
                    if (day !== 0) continue;
                    if (match !== undefined) continue;
                }
                if (key.includes('product_calendar_seasonal_event_april_2026')) {
                    const offer = offers[key];
                    const priceDollars = (offer.price / 100).toFixed(2);
                    console.log(`  Offer: ${key} - $${priceDollars}`);
                    for (const reward of offer.rewards) {
                        console.log(`    ${getRewardQuantity(reward)}x ${getRewardDescription(reward)}`);
                    }
                }
            }
        }
        for (const key of Object.keys(data.clientGameConfig.shop.realMoneyProducts)) {
            const offer = data.clientGameConfig.shop.realMoneyProducts[key];
            if (key.includes('playmore')) {
                console.log('key: ', key, ' - ', (Math.ceil(offer.price / 100)).toFixed(2));
                for (const reward of offer.rewards) {
                    console.log('  ', reward);
                }
                console.log('');
            }
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
