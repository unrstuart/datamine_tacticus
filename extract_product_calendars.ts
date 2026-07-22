import * as fs from 'fs';

function globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
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

function mergeRewards(rewards: string[]): { type: string; quantity: number }[] {
    const order: string[] = [];
    const totals = new Map<string, number>();
    for (const reward of rewards) {
        const colon = reward.lastIndexOf(':');
        const type = colon === -1 ? reward : reward.slice(0, colon);
        const quantity = colon === -1 ? 1 : parseInt(reward.slice(colon + 1), 10);
        if (!totals.has(type)) order.push(type);
        totals.set(type, (totals.get(type) ?? 0) + quantity);
    }
    return order.map((type) => ({ type, quantity: totals.get(type)! }));
}

function formatPrice(priceCents: number | null): string {
    if (priceCents === null || priceCents === 0) return 'FREE';
    return `$${(priceCents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// I2 term lookup (offer titles/banners shown in the UI)
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

function getParam(parameters: string[], key: string): string | undefined {
    const prefix = key + '=';
    const found = parameters.find((p) => p.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

function extractTermKey(paramValue: string): string | null {
    // Some banner_term values in the game config have a stray trailing "]" (data typo), so
    // match non-greedily and allow (and ignore) any extra "]" characters after the term key.
    const match = paramValue.match(/^\[term:(.+?)\]+$/);
    return match ? match[1] : null;
}

function resolveOfferLabels(
    offerId: string,
    day: number,
    productViewConfigs: Record<string, any[]>,
    terms: Map<string, string> | null
): { title?: string; banner?: string } {
    if (!terms) return {};
    const views = productViewConfigs[offerId];
    if (!views) return {};

    for (const view of views) {
        const params: string[] = view.Parameters ?? [];
        const headerParam = getParam(params, 'header_term');
        const bannerParam = getParam(params, 'banner_term');
        if (!headerParam && !bannerParam) continue;

        const result: { title?: string; banner?: string } = {};
        if (headerParam) {
            const key = extractTermKey(headerParam)?.replace('{DAY}', String(day));
            if (key && terms.has(key)) result.title = terms.get(key);
        }
        if (bannerParam) {
            const key = extractTermKey(bannerParam)?.replace('{DAY}', String(day));
            if (key && terms.has(key)) result.banner = terms.get(key);
        }
        if (result.title || result.banner) return result;
    }
    return {};
}

// ---------------------------------------------------------------------------
// Calendar discovery
// ---------------------------------------------------------------------------

export interface CalendarSummary {
    name: string;
    days: number[];
    variantsByDay: Map<number, string[]>;
}

export function discoverCalendars(data: any): Map<string, CalendarSummary> {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const calendars = new Map<string, CalendarSummary>();

    for (const event of events) {
        const offerId: string | undefined = event.offerId;
        if (!offerId) continue;
        const match = offerId.match(/^offer_(.+)_day_(\d+)(?:_(.+))?$/);
        if (!match) continue;
        const [, name, dayStr, variant] = match;
        const day = parseInt(dayStr, 10);

        let calendar = calendars.get(name);
        if (!calendar) {
            calendar = { name, days: [], variantsByDay: new Map() };
            calendars.set(name, calendar);
        }
        if (!calendar.days.includes(day)) calendar.days.push(day);
        const variants = calendar.variantsByDay.get(day) ?? [];
        variants.push(variant ?? '(default)');
        calendar.variantsByDay.set(day, variants);
    }

    for (const calendar of calendars.values()) {
        calendar.days.sort((a, b) => a - b);
    }
    return calendars;
}

export function formatCalendarFindResults(data: any, globPattern?: string): string {
    const calendars = discoverCalendars(data);
    const regex = globPattern ? globToRegex(globPattern) : undefined;

    const names = [...calendars.keys()].filter((name) => !regex || regex.test(name)).sort();

    if (names.length === 0) {
        return globPattern ? `No calendars matched pattern: ${globPattern}` : 'No calendars found.';
    }

    const lines: string[] = [];
    for (const name of names) {
        const calendar = calendars.get(name)!;
        const totalOffers = [...calendar.variantsByDay.values()].reduce(
            (sum, variants) => sum + variants.filter((v) => v !== 'closed' && v !== 'expired').length,
            0
        );
        lines.push(`${name}  (${calendar.days.length} days, days ${calendar.days[0]}-${calendar.days[calendar.days.length - 1]}, ${totalOffers} offers)`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Calendar extraction
// ---------------------------------------------------------------------------

export interface CalendarOffer {
    variant: string;
    title?: string;
    banner?: string;
    free: boolean;
    priceCents: number | null;
    rewards: string[];
}

export interface CalendarDay {
    day: number;
    offers: CalendarOffer[];
}

export interface CalendarData {
    calendar: string;
    days: CalendarDay[];
}

function variantRank(variant: string): number {
    if (variant === 'free') return -1;
    if (variant.endsWith('_fallback') || variant === 'fallback') return 1000;
    const tierOrder = ['SHD', 'HD', 'MD', 'LD'];
    for (let i = 0; i < tierOrder.length; i++) {
        if (variant === tierOrder[i] || variant.endsWith('_' + tierOrder[i])) return i;
    }
    return 500;
}

function resolveOfferContent(
    event: any,
    data: any
): { free: boolean; priceCents: number | null; rawRewards: string[] } | null {
    if (event.realMoneyProductId) {
        const product = data.clientGameConfig.shop.realMoneyProducts[event.realMoneyProductId];
        if (!product) return null;
        return { free: false, priceCents: product.price ?? null, rawRewards: product.rewards ?? [] };
    }
    if (event.productId) {
        const product = data.clientGameConfig.shop.products[event.productId];
        if (!product) return null;
        return { free: true, priceCents: product.cost?.amount ?? 0, rawRewards: product.rewards ?? [] };
    }
    return null;
}

function extractCalendarData(data: any, name: string, terms: Map<string, string> | null): CalendarData {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const productViewConfigs = data.clientGameConfig.shop.productViewConfigs;
    const prefix = `offer_${name}_day_`;
    const byDay = new Map<number, CalendarOffer[]>();

    for (const event of events) {
        const offerId: string | undefined = event.offerId;
        if (!offerId || !offerId.startsWith(prefix)) continue;
        const rest = offerId.slice(prefix.length);
        const match = rest.match(/^(\d+)(?:_(.+))?$/);
        if (!match) continue;
        const day = parseInt(match[1], 10);
        const variant = match[2] ?? '(default)';
        if (variant === 'closed' || variant === 'expired') continue;

        const resolved = resolveOfferContent(event, data);
        if (!resolved) continue;

        const labels = resolveOfferLabels(offerId, day, productViewConfigs, terms);

        const offers = byDay.get(day) ?? [];
        offers.push({
            variant,
            ...labels,
            free: resolved.free,
            priceCents: resolved.priceCents,
            rewards: resolved.rawRewards,
        });
        byDay.set(day, offers);
    }

    const days = [...byDay.keys()]
        .sort((a, b) => a - b)
        .map((day) => ({
            day,
            offers: byDay.get(day)!.sort((a, b) => variantRank(a.variant) - variantRank(b.variant)),
        }));

    return { calendar: name, days };
}

export function printCalendarText(calendarData: CalendarData, data: any): string {
    const lines: string[] = [];
    lines.push(`=== ${calendarData.calendar} (${calendarData.days.length} days) ===\n`);
    for (const { day, offers } of calendarData.days) {
        lines.push(`Day ${day}:`);
        for (const offer of offers) {
            const label = [offer.title, offer.banner].filter(Boolean).join(' - ');
            const suffix = label ? `  (${label})` : '';
            lines.push(`  [${offer.variant}] ${formatPrice(offer.priceCents)}${suffix}`);
            for (const { type, quantity } of mergeRewards(offer.rewards)) {
                lines.push(`    - ${convertReward(`${type}:${quantity}`, data)}`);
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public extraction API
// ---------------------------------------------------------------------------

export interface ExtractCalendarParams {
    gameconfigPath: string;
    calendarName: string;
    i2Path?: string;
}

export function extractCalendar({ gameconfigPath, calendarName, i2Path }: ExtractCalendarParams): CalendarData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractCalendarData(data, calendarName, terms);
}
