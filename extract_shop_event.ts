import * as fs from 'fs';
import * as path from 'path';
import {
    convertReward,
    resolveTieredProgressRewards,
    extractSeasonalMissions,
    deriveEventPrefix,
    ProgressRewardTier,
    SeasonalMissions,
} from './seasonal_event_shared';
import { extractEventTitle } from './extract_homescreen_events';
import { loadSpriteFilesByLowercaseName, resolveSpriteCaseInsensitive } from './sprite_lookup';

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
// Lock/condition formatting
// ---------------------------------------------------------------------------
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
    // Progress toward the event's own maxPoints bar (rewardProgressId), paid out in the event's
    // seasonalEventCurrency or, near the top, a bonus resource. Always present on a seasonalEvent.
    milestoneRewards?: ProgressRewardTier[];
    // A separate, optional purchase-progress ladder (merchantProgressRewardId) - not every week has
    // one (e.g. season_may_2026_event has none).
    progressChests?: ProgressRewardTier[];
    // Missions (daily/free/premium/battle-pass) that pay xp_seasonal into the milestone bar above.
    missions?: SeasonalMissions;
    // Where the event currency comes from for a free-to-play player, and what the Bonus Shipment adds on top.
    earnings?: ShopEventEarnings;
    bonusShipment?: ShopEventBonusShipment;
}

export interface ShopEventEarningsSource {
    /** The maxPayouts.ec key (or "<hse id>" for a home screen event). */
    id: string;
    label: string;
    /** Max event currency this source pays a free-to-play player. */
    amount: number;
    /** "shop" = the event itself (milestones, free offers); "heroQuest"/"quest" = a quest event; "homeScreenEvent" = an HSE. */
    kind: 'shop' | 'heroQuest' | 'quest' | 'homeScreenEvent';
}

export interface ShopEventEarnings {
    currency: string;
    /** Sum of every source (the game's own maxPayouts.ec, minus real-money offers). */
    f2pTotal: number;
    /** Sum of the sources of kind "shop" only. */
    f2pShopOnly: number;
    sources: ShopEventEarningsSource[];
    /** Tooltip markup: one line per row separated by "\n"; <b>..</b> bold, <i>..</i> italic. No other tags. */
    tooltip: string;
}

export interface ShopEventBonusPayoutSource {
    id: string;
    label: string;
    /** How many separate currency payouts this source makes (each earns the per-payout bonus). */
    payouts: number;
    /** Whether the Bonus Shipment tooltip text lists this payout type as earning the bonus. */
    listedInGame: boolean;
}

export interface ShopEventBonusShipment {
    currency: string;
    /** Currency paid immediately on purchase. */
    instantAmount: number;
    /** Currency from the premium mission chain, which the pass unlocks. */
    premiumMissionsAmount: number;
    /** Extra currency per payout (the pass's seasonalEcBonus). */
    bonusPerPayout: number;
    payoutSources: ShopEventBonusPayoutSource[];
    /** instant + premium missions + bonus * payouts the game's tooltip lists (milestones, missions, offers, quest). */
    total: number;
    /** Same, if home screen event payouts also earn the bonus (the tooltip does not list them). */
    totalWithHomeScreenEvents: number;
    /** Tooltip markup: one line per row separated by "\n"; <b>..</b> bold, <i>..</i> italic. No other tags. */
    tooltip: string;
}

export interface ShopEventOffer {
    /** The raw shop.offers entry. */
    offer: any;
    /** The shop.realMoneyProducts entry the offer points at (price, rewards). */
    realMoneyProduct?: any;
}

export interface ShopEventData {
    event: string;
    /** The event's own name as the game shows it ("Skull Harvest"), from SeasonalEvents/name_<theme>. Falls back to shopTabTitle. */
    title?: string;
    /** The name of the event's shop tab ("Boons of Blood"), from the live event's shopTabLocaKey. */
    shopTabTitle?: string;
    /** The live event's `theme` (e.g. "november_2026"); the stem of the event's art, like its interstitial. */
    theme?: string;
    /**
     * File name of the event's interstitial sprite (e.g. "ui_interstitial_november_2026.png", on-disk casing).
     * GameConfig never names it - it is the `ui_interstitial_<theme>` convention - so it is only set when an
     * assetsDir is given and that sprite exists in <assetsDir>/sprites.
     */
    interstitial?: string;
    weeks: ShopEventWeek[];
    /**
     * Real-money offers sold alongside the event (the Bonus Shipment "pass", special bundles, webstore
     * exclusives, final push), keyed by offerId. Segment variants (_SHD/_HD/_MD/_LD) are separate entries.
     * The per-day calendar offers are not included - they live in the product calendar data.
     */
    offers?: Record<string, ShopEventOffer>;
}

// "November2026" -> "november_2026" - the infix of the event's offer ids (offer_seasonal_event_november_2026_pass).
function eventOfferInfix(eventName: string): string {
    return eventName.replace(/([a-z])([0-9])/gi, '$1_$2').toLowerCase();
}

const EVENT_OFFER_KINDS = /^(pass|special_bundle|webstore_exclusive|final_push)/;

function resolveShopEventOffers(data: any, eventName: string): Record<string, ShopEventOffer> | undefined {
    const prefix = `offer_seasonal_event_${eventOfferInfix(eventName)}_`;
    const realMoneyProducts = data.clientGameConfig.shop.realMoneyProducts;
    const offers: Record<string, ShopEventOffer> = {};
    for (const offer of data.clientGameConfig.shop.offers as any[]) {
        if (!offer.offerId.startsWith(prefix) || !EVENT_OFFER_KINDS.test(offer.offerId.slice(prefix.length))) continue;
        offers[offer.offerId] = { offer, realMoneyProduct: realMoneyProducts[offer.realMoneyProductId] };
    }
    return Object.keys(offers).length > 0 ? offers : undefined;
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

function findInterstitial(theme: string | undefined, assetsDir: string | undefined): string | undefined {
    if (!theme || !assetsDir) return undefined;
    const spritesDir = path.join(assetsDir, 'sprites');
    if (!fs.existsSync(spritesDir)) return undefined;
    return resolveSpriteCaseInsensitive(loadSpriteFilesByLowercaseName(spritesDir), `ui_interstitial_${theme}.png`);
}

const DAYS_PER_WEEK = 7;

const currencyAmount = (text: string | undefined, currency: string): number => {
    const match = text?.match(new RegExp(`${currency}:(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
};
const sumCurrency = (value: unknown, currency: string): number =>
    [...JSON.stringify(value ?? '').matchAll(new RegExp(`${currency}:(\\d+)`, 'g'))].reduce((sum, m) => sum + parseInt(m[1], 10), 0);

function tierPayouts(data: any, rewardProgressId: string | undefined, currency: string): number {
    const tiers: { chestRewardId?: string }[] = data.clientGameConfig.loot.tieredProgressRewards[rewardProgressId ?? ''] ?? [];
    return tiers.filter((tier) => currencyAmount(tier.chestRewardId, currency) > 0).length;
}

// "Grubak Zapspitta" -> "Grubak's Hero Quest"
function heroQuestLabel(unitId: string | undefined, terms: Map<string, string> | null): string {
    const first = (unitId && terms?.get(`Units/${unitId}_Name`)?.split(' ')[0]) || undefined;
    return first ? `${first}'s Hero Quest` : 'Hero Quest';
}

function homeScreenEventConfig(data: any, id: string): any | undefined {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const candidates = new Set([id, `hse_${id}`]);
    return events.find((e) => e.eventType === 'homeScreenEvent' && candidates.has(e.eventName.replace(/_tier_(high|mid|low)$/, '')));
}

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * Per-week earnings and Bonus Shipment figures, built from the seasonal event's own `maxPayouts` (the game's
 * totals) plus a count of the individual payouts behind each total.
 */
function resolveEarnings(
    data: any,
    seasonalConfig: any,
    missions: SeasonalMissions | undefined,
    terms: Map<string, string> | null
): { earnings?: ShopEventEarnings; bonusShipment?: ShopEventBonusShipment } {
    const ec = seasonalConfig.maxPayouts?.ec;
    const currency: string | undefined = seasonalConfig.resourceId;
    if (!ec || !currency) return {};

    const sources: ShopEventEarningsSource[] = [];
    const payoutSources: ShopEventBonusPayoutSource[] = [];
    const liveEvents = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const chests = data.clientGameConfig.loot.chests;

    // Milestones.
    if (ec.milestones > 0) {
        sources.push({ id: 'milestones', label: 'Event milestones', amount: ec.milestones, kind: 'shop' });
        payoutSources.push({
            id: 'milestones',
            label: 'Event milestones',
            payouts: tierPayouts(data, seasonalConfig.rewardProgressId, currency),
            listedInGame: true,
        });
    }

    // Free offers: the daily free claim in the shop, plus any free product of this event that pays the currency.
    if (ec.freeOffers > 0) {
        sources.push({ id: 'freeOffers', label: 'Free daily offers', amount: ec.freeOffers, kind: 'shop' });
        const merchant = data.clientGameConfig.shop.merchants[seasonalConfig.merchantId];
        const dailyClaims = (merchant?.products ?? []).filter((variants: any[]) =>
            variants.some((v) => currencyAmount(v.freeOffer, currency) > 0)
        ).length;
        const freeProducts = Object.entries<any>(data.clientGameConfig.shop.products).filter(
            ([key, product]) => key.includes(seasonalConfig.theme) && /free/.test(key) && sumCurrency(product.rewards, currency) > 0
        ).length;
        payoutSources.push({
            id: 'freeOffers',
            label: 'Free daily offers',
            payouts: dailyClaims * DAYS_PER_WEEK + freeProducts,
            listedInGame: true,
        });
    }

    // Quest event (hero quest, sync PvP, ...): a linear hero event whose chests pay this currency, or a plain key.
    for (const [key, amount] of Object.entries<number>(ec)) {
        if (typeof amount !== 'number' || amount <= 0) continue;
        if (['milestones', 'freeOffers', 'premiumOffers', 'leaderboardDailyPayouts', 'leaderboardFinalPayout'].includes(key)) continue;
        if (key === 'linearHeroEvent') {
            const hero = liveEvents.find(
                (e) =>
                    e.eventType === 'linearHeroEvent' &&
                    (e.milestones ?? []).some((m: any) => currencyAmount(JSON.stringify(chests[m.chestId] ?? ''), currency) > 0)
            );
            const label = heroQuestLabel(hero?.unitId, terms);
            sources.push({ id: key, label, amount, kind: 'heroQuest' });
            payoutSources.push({
                id: key,
                label,
                payouts: (hero?.milestones ?? []).filter((m: any) => currencyAmount(JSON.stringify(chests[m.chestId] ?? ''), currency) > 0).length,
                listedInGame: true,
            });
        } else {
            const label = key === 'syncPvp' ? 'Sync PvP' : key;
            sources.push({ id: key, label, amount, kind: 'quest' });
            payoutSources.push({ id: key, label, payouts: 0, listedInGame: true });
        }
    }

    // Home screen events.
    let hsePayouts = 0;
    for (const [id, amount] of Object.entries<number>(ec.homeScreenEvents ?? {})) {
        if (amount <= 0) continue;
        const hse = homeScreenEventConfig(data, id);
        const label = (terms && extractEventTitle(terms.get(hse?.previewTitleLocaKey))) || id;
        sources.push({ id, label, amount, kind: 'homeScreenEvent' });
        const payouts = tierPayouts(data, hse?.rewardProgressId, currency);
        hsePayouts += payouts;
        payoutSources.push({ id, label, payouts, listedInGame: false });
    }

    const f2pTotal = sources.reduce((sum, s) => sum + s.amount, 0);
    const f2pShopOnly = sources.filter((s) => s.kind === 'shop').reduce((sum, s) => sum + s.amount, 0);

    const earningsLines = [
        `<b>Free-to-play currency per week</b>`,
        ...sources.map((s) => `${s.label}: <b>${fmt(s.amount)}</b>`),
        `<b>Total: ${fmt(f2pTotal)}</b>`,
        `<i>Maximum; home screen events only pay while they run.</i>`,
    ];
    const earnings: ShopEventEarnings = { currency, f2pTotal, f2pShopOnly, sources, tooltip: earningsLines.join('\n') };

    // Bonus Shipment: the pass product, which carries the instant payout and the per-payout bonus.
    const passOfferId: string | undefined = (seasonalConfig.initialOfferIds ?? [])[0];
    const passOffer = passOfferId && (data.clientGameConfig.shop.offers as any[]).find((o) => o.offerId === passOfferId);
    const passProduct = passOffer && data.clientGameConfig.shop.realMoneyProducts[passOffer.realMoneyProductId];
    if (!passProduct) return { earnings };

    const rewards: string[] = passProduct.rewards ?? [];
    const instantAmount = rewards.reduce((sum, r) => sum + currencyAmount(r, currency), 0);
    const bonusPerPayout = rewards.reduce((sum, r) => sum + (r.startsWith('seasonalEcBonus:') ? parseInt(r.split(':')[1], 10) : 0), 0);
    const premiumMissionsAmount = sumCurrency(missions?.premium, currency);
    const premiumPayouts = (missions?.premium ?? []).filter((q) => currencyAmount(JSON.stringify(q.rewards), currency) > 0).length;
    payoutSources.splice(1, 0, { id: 'premiumMissions', label: 'Premium missions', payouts: premiumPayouts, listedInGame: true });

    const listed = payoutSources.filter((p) => p.listedInGame).reduce((sum, p) => sum + p.payouts, 0);
    const total = instantAmount + premiumMissionsAmount + bonusPerPayout * listed;
    const totalWithHomeScreenEvents = total + bonusPerPayout * hsePayouts;

    const bonusLines = [
        `<b>Bonus Shipment</b>`,
        `Paid up front: <b>${fmt(instantAmount)}</b>`,
        `Premium missions: <b>${fmt(premiumMissionsAmount)}</b>`,
        `Bonus: <b>+${bonusPerPayout}</b> on each payout`,
        ...payoutSources.map((p) => `  ${p.label}: ${p.payouts} × ${bonusPerPayout} = <b>${fmt(p.payouts * bonusPerPayout)}</b>${p.listedInGame ? '' : ' <i>(may not count)</i>'}`),
        `<b>Total: ${fmt(total)}</b> <i>(${fmt(totalWithHomeScreenEvents)} if home screen events count)</i>`,
    ];
    const bonusShipment: ShopEventBonusShipment = {
        currency,
        instantAmount,
        premiumMissionsAmount,
        bonusPerPayout,
        payoutSources,
        total,
        totalWithHomeScreenEvents,
        tooltip: bonusLines.join('\n'),
    };
    return { earnings, bonusShipment };
}

function extractShopEventData(
    data: any,
    eventName: string,
    terms: Map<string, string> | null,
    level: Level | null,
    assetsDir?: string
): ShopEventData {
    const summary = discoverShopEvents(data).get(eventName)!;
    const merchants = data.clientGameConfig.shop.merchants;

    let shopTabTitle: string | undefined;
    let theme: string | undefined;
    const weeks: ShopEventWeek[] = [];

    for (const { week, merchant: merchantKey } of summary.weeks) {
        const merchant = merchants[merchantKey];
        if (!merchant) continue;

        const seasonalConfig = findSeasonalEventConfig(data, merchantKey);
        if (!theme && seasonalConfig?.theme) theme = seasonalConfig.theme;
        let subtitle: string | undefined;
        if (terms && seasonalConfig) {
            if (!shopTabTitle && seasonalConfig.shopTabLocaKey && terms.has(seasonalConfig.shopTabLocaKey)) {
                shopTabTitle = terms.get(seasonalConfig.shopTabLocaKey);
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

        let milestoneRewards: ProgressRewardTier[] | undefined;
        let progressChests: ProgressRewardTier[] | undefined;
        let missions: SeasonalMissions | undefined;
        if (seasonalConfig) {
            if (seasonalConfig.rewardProgressId) {
                milestoneRewards = resolveTieredProgressRewards(data, seasonalConfig.rewardProgressId);
            }
            if (seasonalConfig.merchantProgressRewardId) {
                progressChests = resolveTieredProgressRewards(data, seasonalConfig.merchantProgressRewardId);
            }
            if (seasonalConfig.questGroups) {
                const prefix = deriveEventPrefix(seasonalConfig.theme, week);
                missions = extractSeasonalMissions(data, prefix, seasonalConfig.questGroups);
                const isEmpty = (m: SeasonalMissions) => !m.daily.length && !m.free.length && !m.premium.length && !m.battlePass.length;
                // Single-week shop events (e.g. October 2026) name their quests without a "_week{N}" suffix.
                if (isEmpty(missions) && summary.weeks.length === 1) {
                    missions = extractSeasonalMissions(data, deriveEventPrefix(seasonalConfig.theme), seasonalConfig.questGroups);
                }
            }
        }

        const { earnings, bonusShipment } = seasonalConfig ? resolveEarnings(data, seasonalConfig, missions, terms) : {};

        weeks.push({ week, merchant: merchantKey, subtitle, slots, milestoneRewards, progressChests, missions, earnings, bonusShipment });
    }

    // The event's own name lives under SeasonalEvents/name_<theme>; the shop tab name is only a fallback.
    const eventTitle = theme && terms ? terms.get(`SeasonalEvents/name_${theme}`) : undefined;
    const title = eventTitle || shopTabTitle;
    const interstitial = findInterstitial(theme, assetsDir);
    const offers = resolveShopEventOffers(data, eventName);
    return {
        event: eventName,
        title,
        shopTabTitle,
        theme,
        interstitial,
        weeks,
        ...(offers ? { offers } : {}),
    };
}

function formatProgressTier(tier: ProgressRewardTier, data: any): string {
    if (tier.chest) {
        const variants = tier.chest
            .map((v) => `${v.type ? `${v.type}: ` : ''}${v.rewards.map((r) => convertReward(r, data)).join(', ')}`)
            .join(' | ');
        return `  ${tier.requiredProgress}: ${variants}`;
    }
    return `  ${tier.requiredProgress}: ${convertReward(tier.reward!, data)}`;
}

function formatMissionLines(missions: SeasonalMissions, data: any): string[] {
    const lines: string[] = [];
    const section = (heading: string, list: SeasonalMissions['daily']) => {
        if (list.length === 0) return;
        lines.push(`${heading}:`);
        for (const m of list) {
            lines.push(`  ${m.name}: ${m.rewards.map((r) => convertReward(r, data)).join(', ')}`);
        }
        lines.push('');
    };
    section('Daily Missions', missions.daily);
    section('Free Missions', missions.free);
    section('Premium Missions', missions.premium);
    // Battle-pass dailies pay xp_seasonal alongside their normal battle-pass rewards - they're not
    // part of this event's own questGroups, but have long contributed to the same milestone bar.
    section('Battle Pass Missions (also feed seasonal points)', missions.battlePass);
    return lines;
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

        if (week.milestoneRewards && week.milestoneRewards.length > 0) {
            lines.push('Milestone Rewards:');
            lines.push(...week.milestoneRewards.map((t) => formatProgressTier(t, data)));
            lines.push('');
        }
        if (week.progressChests && week.progressChests.length > 0) {
            lines.push('Progress Chests:');
            lines.push(...week.progressChests.map((t) => formatProgressTier(t, data)));
            lines.push('');
        }
        if (week.missions) {
            lines.push(...formatMissionLines(week.missions, data));
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
    /** Extracted-assets root; lets the extraction check that the event's interstitial sprite exists. */
    assetsDir?: string;
}

export function extractShopEvent({ gameconfigPath, eventName, i2Path, level = null, assetsDir }: ExtractShopEventParams): ShopEventData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractShopEventData(data, eventName, terms, level, assetsDir);
}
