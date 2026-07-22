import * as fs from 'fs';

function isCronScheduleMatchDay(cronSchedule: string, day: number): boolean {
    const parts = cronSchedule.split(' ');
    if (parts.length < 6) return false;
    const daysOfWeek = parts[5];
    const daysArray = daysOfWeek.split(',');
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return daysArray.includes(DAYS[day]) || daysOfWeek === '*';
}

// ---------------------------------------------------------------------------
// Reward formatting
// ---------------------------------------------------------------------------

function niceLabel(id: string): string {
    // Splits a camelCase/PascalCase identifier into words, e.g. "TreasureBeach" -> "Treasure Beach".
    return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function convertReward(reward: string, data: any): string {
    const characters = data.clientGameConfig.units.lineup;
    const upgrades = data.clientGameConfig.upgrades;
    const equipment = data.clientGameConfig.items;

    const colon = reward.lastIndexOf(':');
    const type = colon === -1 ? reward : reward.slice(0, colon);
    const quantity = colon === -1 ? '1' : reward.slice(colon + 1);

    if (type in equipment) return `${quantity}x ${equipment[type].name}`;

    if (type === 'crusadeCurrency') return `${quantity}x Crusade Credits`;

    let match = type.match(/^items(Common|Uncommon|Rare|Epic|Legendary|Mythic)_I_(\w+)$/);
    if (match) {
        const [, rarity, category] = match;
        return `${quantity}x ${rarity} ${category.replace(/_/g, ' ')} Equipment (Random)`;
    }

    if (type.startsWith('upgrades')) {
        const rarity = type.substring('upgrades'.length);
        return `${quantity}x ${rarity} Upgrade Material (Random)`;
    }
    if (type.startsWith('upg')) {
        const upgrade = upgrades[type];
        if (upgrade) return `${quantity}x ${upgrade.name}`;
    }

    if (type.startsWith('draft_abilityTokens')) {
        const rarity = type.substring('draft_abilityTokens'.length);
        return `${quantity}x ${rarity} Ability Badges (Draft)`;
    }
    if (type.startsWith('draft_ascensionOrbs')) {
        const rarity = type.substring('draft_ascensionOrbs'.length);
        return `${quantity}x ${rarity} Ascension Orb (Draft)`;
    }
    if (type === 'draft_machinesOfWarTokens') {
        return `${quantity}x Machines of War Tokens (Draft)`;
    }

    if (type.startsWith('itemAscensionResource_')) {
        const rarity = type.substring('itemAscensionResource_'.length);
        return `${quantity}x ${rarity} Forge Badges`;
    }

    match = type.match(/^abilityToken(\w+?)_(\w+)$/);
    if (match) {
        const [, rarity, alliance] = match;
        return `${quantity}x ${rarity} ${alliance} Ability Badges`;
    }
    if (type.startsWith('abilityTokens')) {
        const rarity = type.substring('abilityTokens'.length);
        return `${quantity}x ${rarity} Ability Badges (Any Alliance)`;
    }

    match = type.match(/^heroAscensionOrb(\w+?)_(\w+)$/);
    if (match) {
        const [, rarity, alliance] = match;
        return `${quantity}x ${rarity} ${alliance} Ascension Orb`;
    }
    if (type.startsWith('ascensionOrbs')) {
        const rarity = type.substring('ascensionOrbs'.length);
        return `${quantity}x ${rarity} Ascension Orb (Any Alliance)`;
    }

    if (type === 'machinesOfWarAmmo') return `${quantity}x Munitions`;
    match = type.match(/^machinesOfWarToken_(\w+)$/);
    if (match) return `${quantity}x ${match[1]} Machines of War Token`;

    if (type.startsWith('items')) {
        const rarity = type.substring('items'.length);
        if (['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'].includes(rarity)) {
            return `${quantity}x ${rarity} Equipment (Random)`;
        }
    }

    match = type.match(/^mythicShards_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `${quantity}x ${unit ? unit.name : match[1]} Mythic Shards`;
    }
    match = type.match(/^shards_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `${quantity}x ${unit ? unit.name : match[1]} Shards`;
    }

    if (type === 'ShardsAll') return `${quantity}x Random Shards (Any Character)`;
    if (type === 'ShardsIfUnlocked') return `${quantity}x Shards of Unlocked Character`;
    if (type === 'ShardsMoW') return `${quantity}x Random MoW Shards`;
    match = type.match(/^Shards(\w+)$/);
    if (match) return `${quantity}x Random ${match[1]} Shards`;

    if (type === 'mythicDust') return `${quantity}x Mythic Salvage`;
    if (type === 'dust') return `${quantity}x Salvage`;
    if (type === 'gold') return `${quantity}x Gold`;
    if (type === 'gems') return `${quantity}x Blackstone`;
    if (type === 'raidTicket') return `${quantity}x Raid Ticket`;
    if (type === 'summoningToken') return `${quantity}x Req Order`;
    if (type === 'specialSummoningToken') return `${quantity}x Blessed Req Order`;
    if (type === 'intel') return `${quantity}x Intel`;
    if (type === 'crusadeBomb') return `${quantity}x Ordnance`;
    if (type === 'crusadeNpc') return `${quantity}x Forces`;

    match = type.match(/^[Ss]tamina(?:_(\w+))?$/);
    if (match) {
        return match[1] ? `${quantity}x Energy (${niceLabel(match[1])})` : `${quantity}x Energy`;
    }

    match = type.match(/^seasonalEventCurrency(\D+?)(\d{4})$/);
    if (match) {
        const [, month, year] = match;
        return `${quantity}x ${month} ${year} Event Currency`;
    }

    if (type.startsWith('xp')) {
        const rarity = type.substring(2);
        return `${quantity}x ${rarity} XP Book`;
    }

    console.error('Unknown reward type: ', reward);
    return reward;
}

// ---------------------------------------------------------------------------
// Lock/condition formatting
// ---------------------------------------------------------------------------

const TIER_LOCK_RE = /^lock_crusade_shop_slot\d+_(relic|mythic_item|legendary_item|epic_item|rare_item|fallback)$/;

const TIER_LABELS: Record<string, string> = {
    relic: 'RELIC TIER',
    mythic_item: 'MYTHIC TIER',
    legendary_item: 'LEGENDARY TIER',
    epic_item: 'EPIC TIER',
    rare_item: 'RARE TIER',
    fallback: 'FALLBACK TIER',
};

function formatLockId(lockId: string): string {
    const tierMatch = lockId.match(TIER_LOCK_RE);
    if (tierMatch) return TIER_LABELS[tierMatch[1]];

    if (lockId === 'lock_crusade_shop_owns_unit_at_mythic') return 'OWNS MYTHIC-RANK UNIT';
    if (lockId === 'lock_crusade_shop_does_not_own_unit_at_mythic') return 'NO MYTHIC-RANK UNIT';

    console.error('Unknown lock condition: ', lockId);
    return lockId;
}

function formatCondition(conditions: any): string {
    if (conditions === undefined || Object.keys(conditions).length === 0) return '(none)';

    const parts: string[] = [];

    if (conditions.minPowerLevel) parts.push(`PL>=${conditions.minPowerLevel}`);
    if (conditions.maxPowerLevel) parts.push(`PL<=${conditions.maxPowerLevel}`);
    if (conditions.lockId) parts.push(formatLockId(conditions.lockId));

    return parts.join(' AND ');
}

// ---------------------------------------------------------------------------
// Player-state filtering (--pl, --mythic)
// ---------------------------------------------------------------------------

export function parsePlayerLevel(raw: string | undefined): number | null {
    if (raw === undefined) return null;
    const level = Number(raw);
    if (!Number.isInteger(level) || level < 1) {
        throw new Error(`Invalid --pl: ${raw} (expected a positive integer)`);
    }
    return level;
}

export function parseHasMythic(raw: string | undefined): boolean | null {
    if (raw === undefined) return null;
    const normalized = raw.toLowerCase();
    if (normalized === 'yes' || normalized === 'true') return true;
    if (normalized === 'no' || normalized === 'false') return false;
    throw new Error(`Invalid --mythic: ${raw} (expected yes or no)`);
}

export type Tier = 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC' | 'RELIC';

// Maps a --tier value to the lock suffix (see TIER_LOCK_RE) it corresponds to. "Fallback"
// isn't selectable here - it's the "you don't qualify for any tier" case, not a tier itself.
const TIER_LOCK_SUFFIX: Record<Tier, string> = {
    RARE: 'rare_item',
    EPIC: 'epic_item',
    LEGENDARY: 'legendary_item',
    MYTHIC: 'mythic_item',
    RELIC: 'relic',
};

export function parseTier(raw: string | undefined): Tier | null {
    if (raw === undefined) return null;
    const normalized = raw.toUpperCase();
    if (normalized !== 'RARE' && normalized !== 'EPIC' && normalized !== 'LEGENDARY' && normalized !== 'MYTHIC' && normalized !== 'RELIC') {
        throw new Error(`Invalid --tier: ${raw} (expected RARE, EPIC, LEGENDARY, MYTHIC, or RELIC)`);
    }
    return normalized;
}

// Returns true if `conditions` is guaranteed to exclude a player at the given power level,
// mythic-unit-ownership state, and item tier, so the offer should be dropped from output.
// Any input may be null (not specified), in which case that dimension isn't filtered.
function offerExcluded(conditions: any, playerLevel: number | null, hasMythic: boolean | null, tier: Tier | null): boolean {
    if (playerLevel !== null) {
        if (conditions.minPowerLevel !== undefined && playerLevel < conditions.minPowerLevel) return true;
        if (conditions.maxPowerLevel !== undefined && playerLevel > conditions.maxPowerLevel) return true;
    }
    if (hasMythic !== null && conditions.lockId) {
        if (conditions.lockId === 'lock_crusade_shop_owns_unit_at_mythic' && !hasMythic) return true;
        if (conditions.lockId === 'lock_crusade_shop_does_not_own_unit_at_mythic' && hasMythic) return true;
    }
    if (tier !== null && conditions.lockId) {
        const tierMatch = conditions.lockId.match(TIER_LOCK_RE);
        if (tierMatch && tierMatch[1] !== TIER_LOCK_SUFFIX[tier]) return true;
    }
    return false;
}

function filterShop(shop: any, playerLevel: number | null, hasMythic: boolean | null, tier: Tier | null): any {
    if (playerLevel === null && hasMythic === null && tier === null) return shop;
    return {
        ...shop,
        products: shop.products.map((slot: any[]) =>
            slot.filter((offer) => !offerExcluded(offer.conditions ?? {}, playerLevel, hasMythic, tier))
        ),
    };
}

// Builds the "condition,cost,maxPurchases,item" rows (everything after "slot,day,") that
// apply to `product`'s offers on the given day, in the same order emitCsv would print them.
function rowsForDay(product: any[], day: number, data: any): string[] {
    const rows: string[] = [];
    for (const offer of product) {
        if (!isCronScheduleMatchDay(offer.cronSchedule, day)) continue;
        const condition = formatCondition(offer.conditions);

        if (offer.freeOffer) {
            const freeItem = convertReward(offer.freeOffer, data);
            rows.push(`${condition},FREE,1,${freeItem}`);
        }

        if (offer.reward && offer.cost) {
            const cost = offer.cost.amount;
            const maxPurchases = offer.maxPurchases ?? '-';
            const item = convertReward(offer.reward, data);
            rows.push(`${condition},${cost},${maxPurchases},${item}`);
        }
    }
    return rows;
}

export function formatCrusadeShopCsv(shop: any, data: any): string {
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const lines: string[] = ['slot,day,condition,cost,maxPurchases,item'];

    let slot = 0;
    for (const product of shop.products) {
        ++slot;

        const rowsByDay: string[][] = [];
        for (let day = 0; day < 7; ++day) {
            rowsByDay.push(rowsForDay(product, day, data));
        }

        // A slot whose offers are gated only by things other than day-of-week (e.g. cost,
        // condition, power level) produces the exact same rows every day - print those once
        // with "(every)" instead of repeating them 7 times.
        const isSameEveryDay = rowsByDay.every(
            (rows) => rows.length === rowsByDay[0].length && rows.every((row, i) => row === rowsByDay[0][i])
        );

        if (isSameEveryDay) {
            for (const row of rowsByDay[0]) lines.push(`${slot},(every),${row}`);
        } else {
            for (let day = 0; day < 7; ++day) {
                for (const row of rowsByDay[day]) lines.push(`${slot},${DAYS[day]},${row}`);
            }
        }
    }

    return lines.join('\n');
}

export interface GetCrusadeShopDataParams {
    gameconfigPath: string;
    playerLevel?: number | null;
    hasMythic?: boolean | null;
    tier?: Tier | null;
}

export function getCrusadeShopData({ gameconfigPath, playerLevel = null, hasMythic = null, tier = null }: GetCrusadeShopDataParams): any {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    return filterShop(data.clientGameConfig.shop.merchants.crusadeShop, playerLevel, hasMythic, tier);
}
