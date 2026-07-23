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

// Every current legendary event uses this same shard-threshold ladder for unlock/ascension
// milestones (confirmed identical across Farsight/Uthar/Lucius's hand-maintained data) - it isn't
// present anywhere in GameConfig as a per-event field, so it's hardcoded here rather than chased
// through the extractor.
export const LE_PROGRESSION = {
    unlock: 400,
    fourStars: 120,
    fiveStars: 180,
    blueStar: 200,
    twoBlueStars: 150,
    mythic: 250,
};

const LE_EVENT_RE = /^legendary_hero_event_(\d+)$/;

// ---------------------------------------------------------------------------
// Legendary event discovery
// ---------------------------------------------------------------------------

export interface LeEventSummary {
    id: string;
    unitSnowprintId: string;
    name: string;
    hasBattleData: boolean;
}

export function discoverLegendaryEvents(data: any): Map<string, LeEventSummary> {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const battleSets: Record<string, any> = data.clientGameConfig.battles.battleSets;
    const characters = data.clientGameConfig.units.lineup;
    const summaries = new Map<string, LeEventSummary>();

    for (const event of events) {
        if (event.eventType !== 'legendaryHeroEvent') continue;
        const match = (event.eventName as string).match(LE_EVENT_RE);
        if (!match) continue;

        const id = match[1];
        const heroId = event.trackingFeaturedHero;
        summaries.set(id, {
            id,
            unitSnowprintId: heroId,
            name: characters[heroId]?.name ?? heroId,
            hasBattleData: `legendary_event_${id}_lane_1` in battleSets,
        });
    }
    return summaries;
}

export function formatLegendaryEventFindResults(data: any, globPattern?: string): string {
    const summaries = discoverLegendaryEvents(data);
    const regex = globPattern ? globToRegex(globPattern) : undefined;

    const ids = [...summaries.keys()].filter((id) => !regex || regex.test(id)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (ids.length === 0) {
        return globPattern ? `No legendary events matched pattern: ${globPattern}` : 'No legendary events found.';
    }

    const lines: string[] = [];
    for (const id of ids) {
        const summary = summaries.get(id)!;
        const battleSuffix = summary.hasBattleData ? '' : '  (retired - no battle data)';
        lines.push(`${id}  ${summary.name} [${summary.unitSnowprintId}]${battleSuffix}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Extraction - everything about a legendary event that lives in GameConfig, EXCEPT the per-battle
// waves/objectives (already covered by extract_le_data.ts) and the two things that never appear
// in any static GameConfig snapshot: the actual start/end scheduling of a given rerun, and the
// "finished" (no more reruns planned) flag. Both stay hand-maintained; heroEventOrdinal /
// heroEventMaxRuns get you close for "finished" but aren't a reliable substitute (e.g. Dante's
// ordinal already equals its maxRuns while its battle data is still present).
// ---------------------------------------------------------------------------

export interface LeLane {
    factionId: string;
}

export interface LeChest {
    level: number;
    cost: { type: string; amount: number };
    rewards: string[];
}

export interface LeQuestTask {
    name: string;
    target?: number;
    locaKey?: string;
    taskParameters?: Record<string, string>;
}

export interface LeQuest {
    name: string;
    rewards: string[];
    tasks: LeQuestTask[];
}

export interface LeMetadata {
    id: string;
    unitSnowprintId: string;
    name: string;
    theme: string;
    eventStage: number;
    heroEventMaxRuns: number;
    unlockableHero: { heroId: string; baseRarity: string; maxRarity: string };
    lanes: { alpha: LeLane; beta: LeLane; gamma: LeLane };
    stamina: {
        max: number;
        start: number;
        regenAmount: number;
        regenTimeSeconds: number;
        maxDailyRefreshAttempts: number;
    };
    finalConversion: {
        goldPerLegCurrency: number;
        legShardsPerMythicShard: number;
        shardsPerLegShard: number;
        minProgressionIndexToUseMythicConversion: number;
    };
    ohSoCloseOffer: any;
    pointsMilestones: any[];
    chests: LeChest[];
    shardsPerChest: number;
    progression: typeof LE_PROGRESSION;
    quests: { regular: LeQuest[]; premium: LeQuest[] };
    globalUnlockRequirement: Record<string, number>;
    descriptions?: string[];
}

// The early progress chests pay out generic "legendaryEventShards" (later chests switch to
// hero-specific mythicShards instead - see extractChests) - this pulls the flat per-chest amount
// from the first chest that grants them, rather than hardcoding it, since it's cheap to derive and
// stays correct if a future event ever tunes it differently.
function deriveShardsPerChest(chests: LeChest[]): number {
    for (const chest of chests) {
        const reward = chest.rewards.find((r) => r.startsWith('legendaryEventShards:'));
        if (reward) return parseInt(reward.split(':')[1], 10);
    }
    return 0;
}

function parseQuestGroup(group: any): LeQuest[] {
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

function extractChests(data: any, id: string): LeChest[] {
    const products = data.clientGameConfig.shop.products;
    const chestDefs = data.clientGameConfig.loot.chests;
    const prefix = `product_leg_event_${id}_progress_chest_`;

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

function extractLegendaryEventMetadataData(data: any, id: string, terms: Map<string, string> | null): LeMetadata {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const config = events.find((e) => e.eventType === 'legendaryHeroEvent' && e.eventName === `legendary_hero_event_${id}`);
    if (!config) throw new Error(`No legendary event found with id "${id}"`);

    const heroId = config.trackingFeaturedHero;
    const name = data.clientGameConfig.units.lineup[heroId]?.name ?? heroId;

    const laneByIndex = new Map<number, any>((config.lanes ?? []).map((lane: any) => [lane.laneIndex, lane]));
    const lanes = {
        alpha: { factionId: laneByIndex.get(1)?.factionId },
        beta: { factionId: laneByIndex.get(2)?.factionId },
        gamma: { factionId: laneByIndex.get(3)?.factionId },
    };

    const pointsMilestones = data.clientGameConfig.loot.tieredProgressRewards[config.rewardProgressId] ?? [];
    const chests = extractChests(data, id);

    const quests = { regular: [] as LeQuest[], premium: [] as LeQuest[] };
    for (const groupName of config.questGroups ?? []) {
        const group = data.clientGameConfig.quests.groups[groupName];
        if (!group) continue;
        const parsed = parseQuestGroup(group);
        if (group.questType === 'premium') quests.premium.push(...parsed);
        else quests.regular.push(...parsed);
    }

    const descriptions = terms
        ? [config.previewTitleLocaKey, config.previewSubtitleLocaKey, config.longDescriptionLocaKey]
              .map((key) => terms.get(key))
              .filter((text): text is string => !!text)
        : undefined;

    return {
        id,
        unitSnowprintId: heroId,
        name,
        theme: config.trackingFeaturedFaction,
        eventStage: config.heroEventOrdinal,
        heroEventMaxRuns: config.heroEventMaxRuns,
        unlockableHero: config.unlockableHero,
        lanes,
        stamina: {
            max: config.maxStamina,
            start: config.startStamina,
            regenAmount: config.staminaRegenerationAmount,
            regenTimeSeconds: config.staminaRegenerationTime,
            maxDailyRefreshAttempts: config.maxDailyStaminaRefreshAttempts,
        },
        finalConversion: {
            goldPerLegCurrency: config.finalEventGoldPerLegCurrency,
            legShardsPerMythicShard: config.finalEventLegShardsPerMythicShard,
            shardsPerLegShard: config.finalEventShardsPerLegShard,
            minProgressionIndexToUseMythicConversion: config.minProgressionIndexToUseMythicConversion,
        },
        ohSoCloseOffer: config.ohSoCloseOffer,
        pointsMilestones,
        chests,
        shardsPerChest: deriveShardsPerChest(chests),
        progression: LE_PROGRESSION,
        quests,
        globalUnlockRequirement: data.clientGameConfig.globalValues.legendaryEventUnlockRequirements,
        descriptions,
    };
}

export interface ExtractLegendaryEventMetadataParams {
    gameconfigPath: string;
    id: string;
    i2Path?: string;
}

export function extractLegendaryEventMetadata({ gameconfigPath, id, i2Path }: ExtractLegendaryEventMetadataParams): LeMetadata {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractLegendaryEventMetadataData(data, id, terms);
}
