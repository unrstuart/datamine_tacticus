import * as fs from 'fs';
import {
    resolveTieredProgressRewards,
    extractSeasonalMissions,
    deriveEventPrefix,
    ProgressRewardTier,
    SeasonalMissions,
} from './seasonal_event_shared';

function globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
}

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
// Survival isn't its own eventType - it's a "seasonalEvent" idunLiveEventConfigs entry with
// includesSurvival: true and a survival: {...} sub-object (featured hero, stamina rules, medal-wave
// stat-boost thresholds, isMachinesOfWarAllowedInBattle, battleSetId). Most seasonalEvent entries
// don't include survival at all, so discovery filters on that flag.
// ---------------------------------------------------------------------------

export interface SurvivalEventSummary {
    eventName: string;
    theme: string;
    featuredHeroId: string;
    featuredHeroName: string;
}

export function discoverSurvivalEvents(data: any): Map<string, SurvivalEventSummary> {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const lineup = data.clientGameConfig.units.lineup;
    const summaries = new Map<string, SurvivalEventSummary>();

    for (const event of events) {
        if (event.eventType !== 'seasonalEvent' || !event.includesSurvival) continue;
        const heroId = event.survival?.featuredHeroId;
        summaries.set(event.eventName, {
            eventName: event.eventName,
            theme: event.theme,
            featuredHeroId: heroId,
            featuredHeroName: lineup[heroId]?.name ?? heroId,
        });
    }
    return summaries;
}

export function formatSurvivalEventFindResults(data: any, globPattern?: string): string {
    const summaries = discoverSurvivalEvents(data);
    const regex = globPattern ? globToRegex(globPattern) : undefined;

    const names = [...summaries.keys()].filter((name) => !regex || regex.test(name)).sort();

    if (names.length === 0) {
        return globPattern ? `No survival events matched pattern: ${globPattern}` : 'No survival events found.';
    }

    const lines: string[] = [];
    for (const name of names) {
        const summary = summaries.get(name)!;
        lines.push(`${name}  [theme: ${summary.theme}]  featuredHero: ${summary.featuredHeroName} (${summary.featuredHeroId})`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Offers - initialOfferIds (+ offerId, always empty on every survival event seen so far) point into
// shop.offers, which in turn points at a realMoneyProducts entry for price/rewards. Same resolution
// as extract_homescreen_events.ts's resolveTierOffers; duplicated rather than shared, matching this
// codebase's existing convention of copying small per-file helpers (see loadTerms/globToRegex above).
// ---------------------------------------------------------------------------

export interface SurvivalEventOffer {
    offer: any;
    realMoneyProduct?: any;
}

function resolveOffers(config: any, offersById: Map<string, any>, realMoneyProducts: Record<string, any>): Record<string, SurvivalEventOffer> {
    const ids = new Set<string>(config.initialOfferIds ?? []);
    if (config.offerId) ids.add(config.offerId);

    const resolved: Record<string, SurvivalEventOffer> = {};
    for (const offerId of ids) {
        const offer = offersById.get(offerId);
        if (!offer) {
            throw new Error(`Survival event "${config.eventName}" references offerId "${offerId}", which was not found in shop.offers`);
        }
        resolved[offerId] = { offer, realMoneyProduct: realMoneyProducts[offer.realMoneyProductId] };
    }
    return resolved;
}

// ---------------------------------------------------------------------------
// Purchasable chests - "what you buy with the currency". shop.products has one entry per rung
// named product_seasonal_event_<theme>_progress_chest_NN, each with a cost (in the event's own
// resourceId currency) and a chestId that resolves in loot.chests for the actual reward contents.
// Same join as extract_le_metadata.ts's extractChests(), just a different product-key prefix.
// ---------------------------------------------------------------------------

export interface SurvivalEventChest {
    level: number;
    cost: { type: string; amount: number };
    rewards: string[];
}

// Different event families use different product-key templates for their progress-chest ladder
// (all still "product_<...>_progress_chest_NN", just with theme worked in differently):
//   - monthly seasonal events:  product_seasonal_event_<theme>_progress_chest_NN   (theme="may_2026")
//   - Crescendo (a numbered, non-monthly event line): product_crescendo_event_01_progress_chest_NN
//     (theme="crescendo_01" - the trailing _01 iteration number moves in front of "_event_", and
//     "seasonal_" is dropped entirely)
// A hardcoded template broke silently (empty chests, no error) the moment a second convention
// showed up, and shop.products also carries unrelated progress-chest ladders for other event
// families entirely (product_hre_*, product_leg_event_<N>_* for legendary events - the latter has
// its own separate extractChests() in extract_le_metadata.ts). Rather than hardcode a second exact
// template and risk the same silent breakage on the next new naming scheme, this matches on the
// theme's own tokens appearing in the product-key prefix, whatever the surrounding template is.
function findChestProductPrefix(products: Record<string, any>, theme: string): string | undefined {
    const themeTokens = theme.split('_');
    const prefixes = new Set(
        Object.keys(products)
            .filter((key) => /_progress_chest_\d+$/.test(key))
            .map((key) => key.replace(/_progress_chest_\d+$/, ''))
    );
    const matches = [...prefixes].filter((prefix) => themeTokens.every((t) => prefix.split('_').includes(t)));
    if (matches.length !== 1) {
        console.error(
            `Couldn't uniquely resolve a progress-chest product prefix for theme "${theme}" (${matches.length} candidates: ${matches.join(', ') || 'none'}).`
        );
        return undefined;
    }
    return matches[0];
}

function extractChests(data: any, theme: string): SurvivalEventChest[] {
    const products = data.clientGameConfig.shop.products;
    const chestDefs = data.clientGameConfig.loot.chests;
    const prefix = findChestProductPrefix(products, theme);
    if (!prefix) return [];
    const fullPrefix = `${prefix}_progress_chest_`;

    return Object.keys(products)
        .filter((key) => key.startsWith(fullPrefix))
        .map((key) => {
            const level = parseInt(key.slice(fullPrefix.length), 10);
            const product = products[key];
            const chestDef: any[] = chestDefs[product.chestId] ?? [];
            const rewards = chestDef.flatMap((entry) => entry.rewards ?? []);
            return { level, cost: product.cost, rewards };
        })
        .sort((a, b) => a.level - b.level);
}

// ---------------------------------------------------------------------------
// Points that feed the milestone bar directly from playing survival battles, rather than from
// mission chains - rarityCapMilestones (one xp_seasonal payout per character-rarity cap reached
// during a run) and the per-medal-tier rewards. Not every medal reward is xp_seasonal (silver/
// platinum/diamond/adamantine pay XP books instead), so all six are surfaced rather than assumed.
// Matches maxPayouts.points.survivalFree/survivalPremium on the event config. Left raw, same as
// everything else here - see the note on ChestVariant in seasonal_event_shared.ts.
// ---------------------------------------------------------------------------

export interface SurvivalEventPoints {
    rarityCapMilestones: Record<string, string>;
    medalRewards: Record<string, string>;
}

const MEDAL_REWARD_FIELDS = [
    'ironMedalReward',
    'bronzeMedalReward',
    'silverMedalReward',
    'goldMedalReward',
    'platinumMedalReward',
    'diamondMedalReward',
    'adamantineMedalReward',
] as const;

function extractSurvivalPoints(survival: any): SurvivalEventPoints {
    const rarityCapMilestones: Record<string, string> = { ...(survival?.rarityCapMilestones ?? {}) };

    const medalRewards: Record<string, string> = {};
    for (const field of MEDAL_REWARD_FIELDS) {
        if (survival?.[field]) medalRewards[field] = survival[field];
    }

    return { rarityCapMilestones, medalRewards };
}

// ---------------------------------------------------------------------------
// Missions - questGroups[] names the quest chains that pay xp_seasonal (into the milestone bar)
// and survivalBoost_stats (the featured hero's stat-boost currency), including chains in other game
// modes entirely. Resolution (dedup, reward conversion, month/week prefix filtering, and folding in
// battlepass_daily's "bp_se_*" dailies) is shared with extract_shop_event.ts - see
// seasonal_event_shared.ts for why the prefix filter is necessary: quests.groups.seasonal_daily/
// seasonal_seasonal/seasonal_seasonal_premium are reused every event cycle and accumulate every
// month's quests in the same array rather than being replaced.
// ---------------------------------------------------------------------------

// Survival events observed so far are single-week (theme has no week component, e.g. "may_2026"),
// but the eventName pattern used by weekly shop events ("..._week{N}_event") is checked too in case
// a future survival event is split across weeks the same way.
function deriveSurvivalEventWeek(eventName: string): number | undefined {
    const match = eventName.match(/_week(\d+)_event$/i);
    return match ? parseInt(match[1], 10) : undefined;
}

// ---------------------------------------------------------------------------
// Extraction. chestId and ohSoCloseOffer are passed through raw and unresolved: chestId ("hre_astar"
// for the May 2026 event) doesn't match any loot.chests key or other table found during
// investigation - the actual currency-for-chest purchases are the progress-chest ladder above, not
// this field - and extract_le_metadata.ts leaves its own ohSoCloseOffer raw for the same reason.
// ---------------------------------------------------------------------------

export interface SurvivalEventData {
    eventName: string;
    theme: string;
    featuredHero: { id: string; name: string };
    resourceId: string;
    tradeInResourceAmountPerPoint?: number;
    tradeInResourceAmountPerSeasonalCurrency?: number;
    survival: any;
    battle: any;
    milestoneRewards: ProgressRewardTier[];
    survivalPoints: SurvivalEventPoints;
    chests: SurvivalEventChest[];
    offers?: Record<string, SurvivalEventOffer>;
    missions: SeasonalMissions;
    chestId?: string;
    ohSoCloseOffer?: any;
    descriptions?: string[];
}

function extractSurvivalEventData(data: any, eventName: string, terms: Map<string, string> | null): SurvivalEventData {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const config = events.find((e) => e.eventType === 'seasonalEvent' && e.includesSurvival && e.eventName === eventName);
    if (!config) throw new Error(`No survival event found with name "${eventName}"`);

    const heroId = config.survival?.featuredHeroId;
    const heroName = data.clientGameConfig.units.lineup[heroId]?.name ?? heroId;

    const battleSetId = config.survival?.battleSetId;
    const battleSet = data.clientGameConfig.battles.battleSets[battleSetId];
    if (!battleSet || battleSet.length === 0) {
        throw new Error(`Survival event "${eventName}" references battleSetId "${battleSetId}", which was not found in battles.battleSets`);
    }

    if (!config.rewardProgressId || !data.clientGameConfig.loot.tieredProgressRewards[config.rewardProgressId]) {
        throw new Error(
            `Survival event "${eventName}" references rewardProgressId "${config.rewardProgressId}", which was not found in loot.tieredProgressRewards`
        );
    }
    const milestoneRewards = resolveTieredProgressRewards(data, config.rewardProgressId);

    const offersById = new Map<string, any>(data.clientGameConfig.shop.offers.map((o: any) => [o.offerId, o]));
    const offers = resolveOffers(config, offersById, data.clientGameConfig.shop.realMoneyProducts);

    const prefix = deriveEventPrefix(config.theme, deriveSurvivalEventWeek(config.eventName));
    const missions = extractSeasonalMissions(data, prefix, config.questGroups ?? []);

    const descriptions = terms
        ? [config.previewTitleLocaKey, config.previewSubtitleLocaKey, config.shortDescriptionLocaKey, config.longDescriptionLocaKey]
              .map((key) => terms.get(key))
              .filter((text): text is string => !!text)
        : undefined;

    return {
        eventName: config.eventName,
        theme: config.theme,
        featuredHero: { id: heroId, name: heroName },
        resourceId: config.resourceId,
        tradeInResourceAmountPerPoint: config.tradeInResourceAmountPerPoint,
        tradeInResourceAmountPerSeasonalCurrency: config.tradeInResourceAmountPerSeasonalCurrency,
        survival: config.survival,
        battle: battleSet[0],
        milestoneRewards,
        survivalPoints: extractSurvivalPoints(config.survival),
        chests: extractChests(data, config.theme),
        offers: Object.keys(offers).length > 0 ? offers : undefined,
        missions,
        chestId: config.chestId,
        ohSoCloseOffer: config.ohSoCloseOffer,
        descriptions,
    };
}

export interface ExtractSurvivalEventParams {
    gameconfigPath: string;
    eventName: string;
    i2Path?: string;
}

export function extractSurvivalEvent({ gameconfigPath, eventName, i2Path }: ExtractSurvivalEventParams): SurvivalEventData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractSurvivalEventData(data, eventName, terms);
}
