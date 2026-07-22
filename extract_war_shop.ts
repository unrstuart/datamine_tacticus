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

export function formatWarShopCsv(shop: any, data: any): string {
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const lines: string[] = ['slot,day,condition,cost,maxPurchases,item'];

    let slot = 0;
    for (const product of shop.products) {
        ++slot;
        for (let day = 0; day < 7; ++day) {
            for (const offer of product) {
                if (!isCronScheduleMatchDay(offer.cronSchedule, day)) continue;
                const condition = formatCondition(offer.conditions);

                if (offer.freeOffer) {
                    const freeItem = convertReward(offer.freeOffer, data);
                    lines.push(`${slot},${DAYS[day]},${condition},FREE,1,${freeItem}`);
                }

                if (offer.reward && offer.cost) {
                    const cost = offer.cost.amount;
                    const maxPurchases = offer.maxPurchases ?? '-';
                    const item = convertReward(offer.reward, data);
                    lines.push(`${slot},${DAYS[day]},${condition},${cost},${maxPurchases},${item}`);
                }
            }
        }
    }

    return lines.join('\n');
}

export interface GetWarShopDataParams {
    gameconfigPath: string;
}

export function getWarShopData({ gameconfigPath }: GetWarShopDataParams): any {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    return data.clientGameConfig.shop.merchants.guildWars;
}
