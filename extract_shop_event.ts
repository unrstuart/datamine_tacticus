import * as fs from 'fs';

function globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
}

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

    let match = type.match(/^abilityToken(\w+?)_(\w+)$/);
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

function formatLockId(lockId: string, data: any): string {
    const characters = data.clientGameConfig.units.lineup;
    const items = data.clientGameConfig.items;

    if (lockId === 'lock_mythic_shop_tier_high') return 'PL>=20 AND BLUE STAR';
    if (lockId === 'lock_mythic_shop_tier_medium') return 'PL>=20 AND NO BLUE STAR';
    if (lockId === 'lock_mythic_shop_tier_low') return 'PL<20';

    let match = lockId.match(/^lock_below_max_legendary_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `NOT BLUE STAR ${unit ? unit.name : match[1]}`;
    }

    match = lockId.match(/^lock_max_legendary_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `BLUE STAR ${unit ? unit.name : match[1]}`;
    }

    match = lockId.match(/^lock_not_unlocked_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `NOT UNLOCKED ${unit ? unit.name : match[1]}`;
    }

    if (lockId.startsWith('lock_june_2026_shop_relic_')) {
        let relic = lockId.substring('lock_june_2026_shop_relic_'.length);
        if (relic.endsWith('_fallback')) relic = relic.substring(0, relic.length - '_fallback'.length);
        const item = items[relic];
        return `NOT OWN MAX ${item ? item.name : relic}`;
    }

    console.error('Unknown lock condition: ', lockId);
    return lockId;
}

function formatCondition(conditions: ShopEventConditions | undefined, data: any): string {
    if (!conditions || Object.keys(conditions).length === 0) return '(none)';

    const parts: string[] = [];
    if (conditions.minPowerLevel) parts.push(`PL>=${conditions.minPowerLevel}`);
    if (conditions.maxPowerLevel) parts.push(`PL<=${conditions.maxPowerLevel}`);
    if (conditions.lockId) parts.push(formatLockId(conditions.lockId, data));

    return parts.join(' AND ');
}

// ---------------------------------------------------------------------------
// I2 term lookup (event title / week subtitle)
// ---------------------------------------------------------------------------

function loadTerms(i2Path: string): Map<string, string> {
    const raw = fs.readFileSync(i2Path, 'utf-8');
    const data = JSON.parse(raw);
    const allTerms: { Term: string; Languages: string[] }[] = data.mSource.mTerms;
    const terms = new Map<string, string>();
    for (const term of allTerms) {
        terms.set(term.Term, term.Languages?.[0] ?? '');
    }
    return terms;
}

// ---------------------------------------------------------------------------
// Shop event discovery
// ---------------------------------------------------------------------------

const WEEKLY_EVENT_SHOP_RE = /^(.+)Week(\d+)EventShop$/;
const SINGLE_EVENT_SHOP_RE = /^(.+)EventShop$/;

export interface ShopEventWeekRef {
    week: number;
    merchant: string;
}

export interface ShopEventSummary {
    name: string;
    weeks: ShopEventWeekRef[];
}

export function discoverShopEvents(data: any): Map<string, ShopEventSummary> {
    const merchants = data.clientGameConfig.shop.merchants;
    const events = new Map<string, ShopEventSummary>();

    for (const key of Object.keys(merchants)) {
        let name: string;
        let week: number;

        const weeklyMatch = key.match(WEEKLY_EVENT_SHOP_RE);
        if (weeklyMatch) {
            name = weeklyMatch[1];
            week = parseInt(weeklyMatch[2], 10);
        } else {
            const singleMatch = key.match(SINGLE_EVENT_SHOP_RE);
            if (!singleMatch) continue;
            name = singleMatch[1];
            week = 1;
        }

        let summary = events.get(name);
        if (!summary) {
            summary = { name, weeks: [] };
            events.set(name, summary);
        }
        summary.weeks.push({ week, merchant: key });
    }

    for (const summary of events.values()) {
        summary.weeks.sort((a, b) => a.week - b.week);
    }
    return events;
}

export function formatShopEventFindResults(data: any, globPattern?: string): string {
    const events = discoverShopEvents(data);
    const regex = globPattern ? globToRegex(globPattern) : undefined;

    const names = [...events.keys()].filter((name) => !regex || regex.test(name)).sort();

    if (names.length === 0) {
        return globPattern ? `No shop events matched pattern: ${globPattern}` : 'No shop events found.';
    }

    const lines: string[] = [];
    for (const name of names) {
        const summary = events.get(name)!;
        const count = summary.weeks.length;
        lines.push(`${name}  (${count} week${count === 1 ? '' : 's'})`);
    }
    return lines.join('\n');
}

function findSeasonalEventConfig(data: any, merchantId: string): any | undefined {
    const liveEvents = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    return liveEvents.find((event) => event.eventType === 'seasonalEvent' && event.merchantId === merchantId);
}

// ---------------------------------------------------------------------------
// Shop event extraction
// ---------------------------------------------------------------------------

export interface ShopEventConditions {
    lockId?: string;
    minPowerLevel?: number;
    maxPowerLevel?: number;
}

export interface ShopEventOfferVariant {
    conditions: ShopEventConditions;
    cronSchedule: string;
    cost?: { type: string; amount: number };
    maxPurchases?: string;
    reward?: string;
    freeOffer?: string;
}

export interface ShopEventSlot {
    slot: number;
    variants: ShopEventOfferVariant[];
}

export interface ShopEventWeek {
    week: number;
    merchant: string;
    subtitle?: string;
    slots: ShopEventSlot[];
}

export interface ShopEventData {
    event: string;
    title?: string;
    weeks: ShopEventWeek[];
}

export type Level = 'L' | 'M' | 'H';

const LEVEL_LOCK_IDS: Record<Level, string> = {
    L: 'lock_mythic_shop_tier_low',
    M: 'lock_mythic_shop_tier_medium',
    H: 'lock_mythic_shop_tier_high',
};

const LEVEL_DESCRIPTIONS: Record<Level, string> = {
    L: 'PL<20',
    M: 'PL>=20 AND NO BLUE STAR',
    H: 'PL=80, every hero/MoW at BLUE STAR or higher (assumed)',
};

// --level H simulates an endgame account: PL 80, every hero and machine of war at blue
// star (max legendary) or better. This is only asserted for H - L and M make no
// assumption beyond the tier lock itself.
const ASSUMED_POWER_LEVEL_FOR_HIGH = 80;

export function parseLevel(raw: string | undefined): Level | null {
    if (raw === undefined) return null;
    const normalized = raw.toUpperCase();
    if (normalized !== 'L' && normalized !== 'M' && normalized !== 'H') {
        throw new Error(`Invalid --level: ${raw} (expected L, M, or H)`);
    }
    return normalized;
}

const TIER_LOCK_IDS: Set<string> = new Set(Object.values(LEVEL_LOCK_IDS));

// Returns true if `conditions` is guaranteed to exclude a player at the assumed state for
// `level`, so the variant should be dropped entirely from --level output.
function variantExcludedByLevel(conditions: ShopEventConditions, level: Level): boolean {
    if (conditions.lockId) {
        if (TIER_LOCK_IDS.has(conditions.lockId)) {
            if (conditions.lockId !== LEVEL_LOCK_IDS[level]) return true;
        } else if (level === 'H') {
            if (conditions.lockId.startsWith('lock_below_max_legendary_')) return true;
            if (conditions.lockId.startsWith('lock_not_unlocked_')) return true;
            // lock_max_legendary_* and anything else (e.g. relic locks) aren't addressed by
            // the "high" assumption, so they're left alone rather than guessed at.
        }
    }
    if (level === 'H') {
        if (conditions.maxPowerLevel !== undefined && conditions.maxPowerLevel < ASSUMED_POWER_LEVEL_FOR_HIGH) return true;
        if (conditions.minPowerLevel !== undefined && conditions.minPowerLevel > ASSUMED_POWER_LEVEL_FOR_HIGH) return true;
    }
    return false;
}

// Returns true if every clause in `conditions` is guaranteed satisfied by the assumed
// state for `level`, so printing the [condition] bracket for it would be redundant.
function conditionRedundantForLevel(conditions: ShopEventConditions, level: Level): boolean {
    if (conditions.lockId) {
        if (TIER_LOCK_IDS.has(conditions.lockId)) {
            if (conditions.lockId !== LEVEL_LOCK_IDS[level]) return false;
        } else if (level === 'H' && conditions.lockId.startsWith('lock_max_legendary_')) {
            // covered by the "every hero/MoW blue star" assumption
        } else {
            return false;
        }
    }
    if (conditions.minPowerLevel !== undefined && !(level === 'H' && conditions.minPowerLevel <= ASSUMED_POWER_LEVEL_FOR_HIGH)) {
        return false;
    }
    if (conditions.maxPowerLevel !== undefined && !(level === 'H' && conditions.maxPowerLevel >= ASSUMED_POWER_LEVEL_FOR_HIGH)) {
        return false;
    }
    return true;
}

function extractShopEventData(
    data: any,
    eventName: string,
    terms: Map<string, string> | null,
    level: Level | null
): ShopEventData {
    const summary = discoverShopEvents(data).get(eventName)!;
    const merchants = data.clientGameConfig.shop.merchants;

    let title: string | undefined;
    const weeks: ShopEventWeek[] = [];

    for (const { week, merchant: merchantKey } of summary.weeks) {
        const merchant = merchants[merchantKey];
        if (!merchant) continue;

        const seasonalConfig = findSeasonalEventConfig(data, merchantKey);
        let subtitle: string | undefined;
        if (terms && seasonalConfig) {
            if (!title && seasonalConfig.shopTabLocaKey && terms.has(seasonalConfig.shopTabLocaKey)) {
                title = terms.get(seasonalConfig.shopTabLocaKey);
            }
            if (seasonalConfig.subtitleLocaKey && terms.has(seasonalConfig.subtitleLocaKey)) {
                subtitle = terms.get(seasonalConfig.subtitleLocaKey);
            }
        }

        const slots: ShopEventSlot[] = merchant.products
            .map((variants: any[], index: number) => {
                const mapped = variants.map((variant) => ({
                    conditions: variant.conditions ?? {},
                    cronSchedule: variant.cronSchedule,
                    cost: variant.cost,
                    maxPurchases: variant.maxPurchases,
                    reward: variant.reward,
                    freeOffer: variant.freeOffer,
                }));

                const filtered = level
                    ? mapped.filter((variant: ShopEventOfferVariant) => !variantExcludedByLevel(variant.conditions, level))
                    : mapped;

                return { slot: index + 1, variants: filtered };
            })
            .filter((slot: ShopEventSlot) => slot.variants.length > 0);

        weeks.push({ week, merchant: merchantKey, subtitle, slots });
    }

    return { event: eventName, title, weeks };
}

export function printShopEventText(shopEventData: ShopEventData, data: any, level: Level | null): string {
    const lines: string[] = [];
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const weekCount = shopEventData.weeks.length;
    const titleSuffix = shopEventData.title ? `  (${shopEventData.title})` : '';
    const levelSuffix = level ? `  [Level: ${level} - ${LEVEL_DESCRIPTIONS[level]}]` : '';
    lines.push(
        `=== ${shopEventData.event} (${weekCount} week${weekCount === 1 ? '' : 's'})${titleSuffix}${levelSuffix} ===\n`
    );

    for (const week of shopEventData.weeks) {
        if (weekCount > 1) {
            const subtitleSuffix = week.subtitle ? `  (${week.subtitle})` : '';
            lines.push(`--- Week ${week.week}${subtitleSuffix} ---\n`);
        }

        for (let day = 0; day < 7; day++) {
            const dayLines: string[] = [];
            for (const slot of week.slots) {
                for (const variant of slot.variants) {
                    if (!isCronScheduleMatchDay(variant.cronSchedule, day)) continue;

                    // Once --level narrows things down, a variant's condition is only worth
                    // printing if it says something the header's "[Level: ...]" note doesn't
                    // already guarantee (e.g. --level H assumes every hero/MoW is blue star, so
                    // a "BLUE STAR <hero>" bracket would be pure noise there).
                    const conditionBracket =
                        level !== null && conditionRedundantForLevel(variant.conditions, level)
                            ? ''
                            : ` [${formatCondition(variant.conditions, data)}]`;

                    // A single variant can carry both a free offer and a paid reward at once
                    // (confirmed in real data) - render both rather than treating them as
                    // mutually exclusive.
                    if (variant.freeOffer) {
                        const freeLabel = convertReward(variant.freeOffer, data);
                        if (level) {
                            dayLines.push(`  Slot ${slot.slot}${conditionBracket}: FREE -> ${freeLabel}`);
                        } else {
                            const condition = formatCondition(variant.conditions, data);
                            dayLines.push(`  Slot ${slot.slot} [${condition}]  FREE`);
                            dayLines.push(`    - ${freeLabel}`);
                        }
                    }
                    if (variant.reward && variant.cost) {
                        const costLabel = convertReward(`${variant.cost.type}:${variant.cost.amount}`, data);
                        const rewardLabel = convertReward(variant.reward, data);
                        const maxSuffix = variant.maxPurchases ? `  (max ${variant.maxPurchases}/day)` : '';
                        if (level) {
                            dayLines.push(`  Slot ${slot.slot}${conditionBracket}: ${costLabel} -> ${rewardLabel}${maxSuffix}`);
                        } else {
                            const condition = formatCondition(variant.conditions, data);
                            dayLines.push(`  Slot ${slot.slot} [${condition}]  ${costLabel}`);
                            dayLines.push(`    - ${rewardLabel}${maxSuffix}`);
                        }
                    }
                }
            }
            if (dayLines.length === 0) continue;
            lines.push(`${DAYS[day]}:`);
            lines.push(...dayLines);
            lines.push('');
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public extraction API
// ---------------------------------------------------------------------------

export interface ExtractShopEventParams {
    gameconfigPath: string;
    eventName: string;
    i2Path?: string;
    level?: Level | null;
}

export function extractShopEvent({ gameconfigPath, eventName, i2Path, level = null }: ExtractShopEventParams): ShopEventData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractShopEventData(data, eventName, terms, level);
}
