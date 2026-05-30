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
    if (reward in equipment) {
        return equipment[reward].name;
    }
    if (reward.startsWith('upg')) {
        return upgrades[reward].name;
    }
    if (reward.startsWith('itemAscensionResource')) {
        const match = reward.match(/itemAscensionResource_(\w+)/);
        if (match) {
            const rarity = match[1];
            const quantity = reward.split(':')[1];
            return `${quantity}x ${rarity} Forge Badges`;
        }
    }
    if (reward.startsWith('abilityToken')) {
        const match = reward.match(/abilityToken(\w+)_(\w+)/);
        if (match) {
            const rarity = match[1];
            const alliance = match[2];
            const quantity = reward.split(':')[1];
            return `${quantity}x ${rarity} ${alliance} Badges`;
        }
    }
    if (reward.startsWith('heroAscensionOrb')) {
        const match = reward.match(/heroAscensionOrb(\w+)_(\w+)/);
        if (match) {
            const rarity = match[1];
            const alliance = match[2];
            const quantity = reward.split(':')[1];
            return `${quantity}x ${rarity} ${alliance} Badges`;
        }
    }
    if (reward.startsWith('shards_')) {
        const match = reward.match(/shards_(\w+)/);
        if (match) {
            const type = characters[match[1]].name;
            const quantity = reward.split(':')[1];
            return `${quantity}x ${type} Shards`;
        }
    }
    if (reward.startsWith('mythicShards_')) {
        const match = reward.match(/mythicShards_(\w+)/);
        if (match) {
            const type = characters[match[1]].name;
            const quantity = reward.split(':')[1];
            return `${quantity}x ${type} Mythic Shards`;
        }
    }
    if (reward.startsWith('mythicDust')) {
        const quantity = reward.split(':')[1];
        return `${quantity}x Mythic Salvage`;
    }
    if (reward.startsWith('dust')) {
        const quantity = reward.split(':')[1];
        return `${quantity}x Salvage`;
    }
    if (reward.startsWith('gold:')) {
        const quantity = reward.split(':')[1];
        return `${quantity}x Gold`;
    }
    if (reward.startsWith('eventSummoningToken_')) {
        const faction = reward.split('_')[1];
        return faction + ' Req';
    }
    if (reward.startsWith('seasonalEventCurrencyJune2026')) {
        const quantity = reward.split(':')[1];
        return `${quantity}x Armageddon Currency`;
    }
    if (reward === 'summoningToken') return 'Req Order';
    if (reward === 'specialSummoningToken') return 'Blessed Req';
    if (reward.startsWith('xp')) {
        return `${reward.substring(2)} XP Book`;
    }
    console.error('Unknown reward type: ', reward);
    return reward;
}

function formatCondition(conditions: any, data: any): string {
    const characters = data.clientGameConfig.units.lineup;
    let minPowerLevel = undefined;
    let maxPowerLevel = undefined;
    let lock = undefined;
    if (conditions === undefined || Object.keys(conditions).length === 0) {
        return '(none)';
    }
    if (conditions.lockId) {
        if (conditions.lockId === 'lock_mythic_shop_tier_high') {
            lock = 'PL>=20 AND BLUE STAR';
        } else if (conditions.lockId === 'lock_mythic_shop_tier_medium') {
            lock = 'PL>=20 AND NO BLUE STAR';
        } else if (conditions.lockId === 'lock_mythic_shop_tier_low') {
            lock = 'PL<20 AND NO BLUE STAR';
        } else if (conditions.lockId.startsWith('lock_below_max_legendary')) {
            const unit = conditions.lockId.substring('lock_below_max_legendary_'.length);
            lock = 'NOT BLUE STAR ' + characters[unit].name;
        } else if (conditions.lockId.startsWith('lock_max_legendary')) {
            const unit = conditions.lockId.substring('lock_max_legendary_'.length);
            lock = 'BLUE STAR ' + characters[unit].name;
        } else if (conditions.lockId.startsWith('lock_not_unlocked_')) {
            const unit = conditions.lockId.substring('lock_not_unlocked_'.length);
            lock = 'NOT UNLOCKED ' + characters[unit].name;
        } else if (conditions.lockId.startsWith('lock_june_2026_shop_relic_')) {
            let relic = conditions.lockId.substring('lock_june_2026_shop_relic_'.length);
            if (relic.endsWith('_fallback')) relic = relic.substring(0, relic.length - '_fallback'.length);
            const relicName = data.clientGameConfig.items[relic].name;
            lock = 'NOT OWN MAX ' + relicName;
        } else {
            console.error('Unknown lock condition: ', conditions.lockId);
            lock = conditions.lockId;
        }
    }
    if (conditions.minPowerLevel) {
        minPowerLevel = `PL>=${conditions.minPowerLevel}`;
    }
    if (conditions.maxPowerLevel) {
        maxPowerLevel = `PL<=${conditions.maxPowerLevel}`;
    }
    const conditionsArray = [];
    if (minPowerLevel) conditionsArray.push(minPowerLevel);
    if (maxPowerLevel) conditionsArray.push(maxPowerLevel);
    if (lock) conditionsArray.push(lock);
    return conditionsArray.join(' AND ');
}

function emitShopSlots(data: any) {
    const weeks = [
        data.clientGameConfig.shop.merchants.June2026Week1EventShop,
        data.clientGameConfig.shop.merchants.June2026Week2EventShop,
        data.clientGameConfig.shop.merchants.June2026Week3EventShop,
    ];
    console.log(
        'week,day,slot,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item'
    );
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    let week = 0;
    for (const shop of weeks) {
        ++week;
        for (let day = 0; day < 7; ++day) {
            let slot = 0;
            for (const product of shop.products) {
                process.stdout.write(`${week},${DAYS[day]},${++slot},`);
                for (const offer of product) {
                    // console.log(offer);
                    // console.log(offer.cronSchedule);
                    if (!isCronScheduleMatchDay(offer.cronSchedule, day)) {
                        continue;
                    }
                    process.stdout.write(formatCondition(offer.conditions, data) + ',');
                    if (offer.freeOffer) {
                        process.stdout.write('FREE,1,');
                        process.stdout.write(convertReward(offer.freeOffer, data) + ',');
                    } else {
                        process.stdout.write(offer.cost.amount + ',');
                        process.stdout.write(offer.maxPurchases + ',');
                        process.stdout.write(convertReward(offer.reward, data) + ',');
                    }
                }
                process.stdout.write('\n');
            }
        }
    }
}

function emitShopJson(data: any) {
    const weeks = [
        data.clientGameConfig.shop.merchants.June2026Week1EventShop,
        data.clientGameConfig.shop.merchants.June2026Week2EventShop,
        data.clientGameConfig.shop.merchants.June2026Week3EventShop,
    ];
    console.log(JSON.stringify(weeks, null, 2));
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;

    if (!inputPath) {
        console.error('Usage: npx ts-node extract_armageddon.ts --input <file.json>');
        process.exit(1);
    }

    try {
        console.log(`Reading: ${inputPath}...`);
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        // emitShopSlots(data);
        emitShopJson(data);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
