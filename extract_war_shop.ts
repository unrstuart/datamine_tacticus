import * as fs from 'fs';

function getArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
            } else {
                args[key] = 'true';
            }
        }
    });
    return args;
}

function isCronScheduleMatchDay(cronSchedule: string, day: number): boolean {
    const parts = cronSchedule.split(' ');
    if (parts.length < 6) return false;
    const daysOfWeek = parts[5];
    const daysArray = daysOfWeek.split(',');
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return daysArray.includes(DAYS[day]) || daysOfWeek === '*';
}

function convertReward(reward: string, data: any): string {
    const characters = data.clientGameConfig.units.lineup;
    const upgrades = data.clientGameConfig.upgrades;
    const equipment = data.clientGameConfig.items;

    if (reward in equipment) return equipment[reward].name;
    if (reward.startsWith('upg')) return upgrades[reward].name;

    if (reward.startsWith('shards_')) {
        const match = reward.match(/shards_(\w+)/);
        if (match) {
            const quantity = reward.split(':')[1];
            const unit = characters[match[1]];
            const name = unit ? unit.name : match[1];
            return `${quantity}x ${name} Shards`;
        }
    }

    if (reward.startsWith('draft_abilityTokens')) {
        const rarity = reward.replace('draft_abilityTokens', '');
        const quantity = reward.split(':')[1] ?? '1';
        return `${quantity}x ${rarity} Ability Tokens (Draft)`;
    }

    if (reward.startsWith('draft_machinesOfWarTokens')) {
        const quantity = reward.split(':')[1] ?? '1';
        return `${quantity}x Machines of War Tokens (Draft)`;
    }

    if (reward.startsWith('draft_ascensionOrbs')) {
        const rarity = reward.replace('draft_ascensionOrbs', '');
        const quantity = reward.split(':')[1] ?? '1';
        return `${quantity}x ${rarity} Ascension Orbs (Draft)`;
    }

    if (reward.startsWith('itemAscensionResource_')) {
        const match = reward.match(/itemAscensionResource_(\w+)/);
        if (match) {
            const rarity = match[1];
            const quantity = reward.split(':')[1];
            return `${quantity}x ${rarity} Forge Badges`;
        }
    }

    if (reward.startsWith('dust:')) {
        const quantity = reward.split(':')[1];
        return `${quantity}x Salvage`;
    }

    if (reward.startsWith('gold:')) {
        const quantity = reward.split(':')[1];
        return `${quantity}x Gold`;
    }

    if (reward.startsWith('xp')) {
        const [base, qty] = reward.split(':');
        const rarity = base.substring(2);
        return qty ? `${qty}x ${rarity} XP Book` : `${rarity} XP Book`;
    }

    console.error('Unknown reward type: ', reward);
    return reward;
}

function formatCondition(conditions: any): string {
    if (conditions === undefined || Object.keys(conditions).length === 0) return '(none)';

    const parts: string[] = [];

    if (conditions.minPowerLevel) parts.push(`PL>=${conditions.minPowerLevel}`);
    if (conditions.maxPowerLevel) parts.push(`PL<=${conditions.maxPowerLevel}`);

    if (conditions.lockId) {
        const lockId: string = conditions.lockId;
        const seasonMatch = lockId.match(/lock_valid_(until|after)_bp_season_(\d+)_start/);
        if (seasonMatch) {
            const dir = seasonMatch[1] === 'until' ? 'BEFORE' : 'AFTER';
            parts.push(`${dir} BP Season ${seasonMatch[2]}`);
        } else {
            console.error('Unknown lock condition: ', lockId);
            parts.push(lockId);
        }
    }

    return parts.join(' AND ');
}

function emitCsv(data: any) {
    const shop = data.clientGameConfig.shop.merchants.guildWars;
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    console.log('slot,day,condition,cost,maxPurchases,item');

    let slot = 0;
    for (const product of shop.products) {
        ++slot;
        for (let day = 0; day < 7; ++day) {
            for (const offer of product) {
                if (!isCronScheduleMatchDay(offer.cronSchedule, day)) continue;
                const condition = formatCondition(offer.conditions);

                if (offer.freeOffer) {
                    const freeItem = convertReward(offer.freeOffer, data);
                    console.log(`${slot},${DAYS[day]},${condition},FREE,1,${freeItem}`);
                }

                if (offer.reward && offer.cost) {
                    const cost = offer.cost.amount;
                    const maxPurchases = offer.maxPurchases ?? '-';
                    const item = convertReward(offer.reward, data);
                    console.log(`${slot},${DAYS[day]},${condition},${cost},${maxPurchases},${item}`);
                }
            }
        }
    }
}

function emitJson(data: any) {
    const shop = data.clientGameConfig.shop.merchants.guildWars;
    console.log(JSON.stringify(shop, null, 2));
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;

    if (!inputPath) {
        console.error('Usage: npx ts-node extract_war_shop.ts --input <file.json> [--json]');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        if ('json' in flags) {
            emitJson(data);
        } else {
            emitCsv(data);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
