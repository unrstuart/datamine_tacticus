import * as fs from 'fs';

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

function extractChests(data: any, theme: string): SurvivalEventChest[] {
    const products = data.clientGameConfig.shop.products;
    const chestDefs = data.clientGameConfig.loot.chests;
    const prefix = `product_seasonal_event_${theme}_progress_chest_`;

    return Object.keys(products)
        .filter((key) => key.startsWith(prefix))
        .map((key) => {
            const level = parseInt(key.slice(prefix.length), 10);
            const product = products[key];
            const chestDef: any[] = chestDefs[product.chestId] ?? [];
            const rewards = chestDef.flatMap((entry) => entry.rewards ?? []);
            return { level, cost: product.cost, rewards };
        })
        .sort((a, b) => a.level - b.level);
}

// ---------------------------------------------------------------------------
// Quest groups - questGroups[] names the quest chains that pay survivalBoost_stats (the featured
// hero's stat-boost currency) for completing missions, including ones in other game modes entirely.
// Same join as extract_le_metadata.ts's parseQuestGroup, split into regular/premium by questType.
// ---------------------------------------------------------------------------

export interface SurvivalEventQuestTask {
    name: string;
    target?: number;
    locaKey?: string;
    taskParameters?: Record<string, string>;
}

export interface SurvivalEventQuest {
    name: string;
    rewards: string[];
    tasks: SurvivalEventQuestTask[];
}

function parseQuestGroup(group: any): SurvivalEventQuest[] {
    return (group?.quests ?? []).map((q: any) => ({
        name: q.name,
        rewards: q.rewards ?? [],
        tasks: (q.tasks ?? []).map((t: any) => ({
            name: t.name,
            target: t.target,
            locaKey: t.locaKey,
            taskParameters: t.taskParameters,
        })),
    }));
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
    milestoneRewards: any[];
    chests: SurvivalEventChest[];
    offers?: Record<string, SurvivalEventOffer>;
    quests: { regular: SurvivalEventQuest[]; premium: SurvivalEventQuest[] };
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

    const rewardProgressId = config.rewardProgressId;
    const milestoneRewards = data.clientGameConfig.loot.tieredProgressRewards[rewardProgressId];
    if (!milestoneRewards) {
        throw new Error(
            `Survival event "${eventName}" references rewardProgressId "${rewardProgressId}", which was not found in loot.tieredProgressRewards`
        );
    }

    const offersById = new Map<string, any>(data.clientGameConfig.shop.offers.map((o: any) => [o.offerId, o]));
    const offers = resolveOffers(config, offersById, data.clientGameConfig.shop.realMoneyProducts);

    const quests = { regular: [] as SurvivalEventQuest[], premium: [] as SurvivalEventQuest[] };
    for (const { groupName } of config.questGroups ?? []) {
        const group = data.clientGameConfig.quests.groups[groupName];
        if (!group) continue;
        const parsed = parseQuestGroup(group);
        if (group.questType === 'premium') quests.premium.push(...parsed);
        else quests.regular.push(...parsed);
    }

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
        chests: extractChests(data, config.theme),
        offers: Object.keys(offers).length > 0 ? offers : undefined,
        quests,
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
