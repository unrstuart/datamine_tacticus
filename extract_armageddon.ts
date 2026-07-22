import * as fs from 'fs';

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

function armageddonWeeks(data: any): any[] {
    return [
        data.clientGameConfig.shop.merchants.June2026Week1EventShop,
        data.clientGameConfig.shop.merchants.June2026Week2EventShop,
        data.clientGameConfig.shop.merchants.June2026Week3EventShop,
    ];
}

export function formatArmageddonCsv(data: any): string {
    const weeks = armageddonWeeks(data);
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const lines = [
        'week,day,slot,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item,condition,cost,maxPurchases,item',
    ];
    let week = 0;
    for (const shop of weeks) {
        ++week;
        for (let day = 0; day < 7; ++day) {
            let slot = 0;
            for (const product of shop.products) {
                let line = `${week},${DAYS[day]},${++slot},`;
                for (const offer of product) {
                    if (!isCronScheduleMatchDay(offer.cronSchedule, day)) {
                        continue;
                    }
                    line += formatCondition(offer.conditions, data) + ',';
                    if (offer.freeOffer) {
                        line += 'FREE,1,';
                        line += convertReward(offer.freeOffer, data) + ',';
                    } else {
                        line += offer.cost.amount + ',';
                        line += offer.maxPurchases + ',';
                        line += convertReward(offer.reward, data) + ',';
                    }
                }
                lines.push(line);
            }
        }
    }
    return lines.join('\n');
}

export interface ExtractArmageddonParams {
    gameconfigPath: string;
}

export function extractArmageddon({ gameconfigPath }: ExtractArmageddonParams): any {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    return armageddonWeeks(data);
}
