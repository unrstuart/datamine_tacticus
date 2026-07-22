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

// The interstitial header term reads like "<i>Faction Boost: Dark Angels</i> is here" - pull out
// just the event name for display purposes.
function extractEventTitle(term: string | undefined): string | undefined {
    if (!term) return undefined;
    const match = term.match(/<i>(.+?)<\/i>/);
    return match ? match[1] : term;
}

// ---------------------------------------------------------------------------
// Most HSEs ship as three separate idunLiveEventConfigs entries - "<name>_tier_high/mid/low" -
// that are really the same event gated to different account segments (they carry the same
// theme/trackers/modifiers shape, just different tradeInResourceAmountPerPoint etc). Those three
// get grouped into a single HSE keyed by <name>. A handful of events (e.g. conflict_operations,
// global_hse_11th_edition_week1_blood_angels) never had tiers to begin with, so they pass through
// as a single "default" tier.
// ---------------------------------------------------------------------------

export type HomescreenEventTier = 'high' | 'mid' | 'low' | 'default';

const TIER_ORDER: HomescreenEventTier[] = ['high', 'mid', 'low', 'default'];
const TIER_SUFFIX_RE = /^(.+)_tier_(high|mid|low)$/;

function splitEventName(eventName: string): { name: string; tier: HomescreenEventTier } {
    const match = eventName.match(TIER_SUFFIX_RE);
    return match ? { name: match[1], tier: match[2] as HomescreenEventTier } : { name: eventName, tier: 'default' };
}

// ---------------------------------------------------------------------------
// Homescreen event discovery
// ---------------------------------------------------------------------------

export interface HomescreenEventSummary {
    name: string;
    theme: string;
    tiers: HomescreenEventTier[];
    title?: string;
}

export function discoverHomescreenEvents(data: any, terms?: Map<string, string> | null): Map<string, HomescreenEventSummary> {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const summaries = new Map<string, HomescreenEventSummary>();

    for (const event of events) {
        if (event.eventType !== 'homeScreenEvent') continue;
        const { name, tier } = splitEventName(event.eventName);

        let summary = summaries.get(name);
        if (!summary) {
            const title = terms ? extractEventTitle(terms.get(event.previewTitleLocaKey)) : undefined;
            summary = { name, theme: event.theme, tiers: [], title };
            summaries.set(name, summary);
        }
        summary.tiers.push(tier);
    }

    for (const summary of summaries.values()) {
        summary.tiers.sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
    }
    return summaries;
}

export function formatHomescreenEventFindResults(data: any, i2Path?: string, globPattern?: string): string {
    const terms = i2Path ? loadTerms(i2Path) : null;
    const summaries = discoverHomescreenEvents(data, terms);
    const regex = globPattern ? globToRegex(globPattern) : undefined;

    const names = [...summaries.keys()].filter((name) => !regex || regex.test(name)).sort();

    if (names.length === 0) {
        return globPattern ? `No homescreen events matched pattern: ${globPattern}` : 'No homescreen events found.';
    }

    const lines: string[] = [];
    for (const name of names) {
        const summary = summaries.get(name)!;
        const tiersLabel = summary.tiers.length === 1 && summary.tiers[0] === 'default' ? 'single-tier' : summary.tiers.join(', ');
        const titleSuffix = summary.title ? `  (${summary.title})` : '';
        lines.push(`${name}  [theme: ${summary.theme}]  (${tiersLabel})${titleSuffix}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Extraction - a straight join of each tier's raw idunLiveEventConfigs entry with its
// tieredProgressRewards array (looked up via rewardProgressId). No reward-string decoding or
// restructuring here: GameConfig ships no start/end scheduling for these events (see
// investigation notes), so this is raw material for further tooling rather than a finished report.
// ---------------------------------------------------------------------------

export interface HomescreenEventTierData {
    liveEventConfig: any;
    tieredProgressRewards: any[];
}

export interface HomescreenEventData {
    eventName: string;
    tiers: Partial<Record<HomescreenEventTier, HomescreenEventTierData>>;
}

function extractHomescreenEventData(data: any, eventName: string): HomescreenEventData {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const matches = events.filter((e) => e.eventType === 'homeScreenEvent' && splitEventName(e.eventName).name === eventName);
    if (matches.length === 0) throw new Error(`No homescreen event found with name "${eventName}"`);

    const tiers: Partial<Record<HomescreenEventTier, HomescreenEventTierData>> = {};
    for (const liveEventConfig of matches) {
        const { tier } = splitEventName(liveEventConfig.eventName);
        const rewardProgressId = liveEventConfig.rewardProgressId;
        const tieredProgressRewards = data.clientGameConfig.loot.tieredProgressRewards[rewardProgressId];
        if (!tieredProgressRewards) {
            throw new Error(
                `Homescreen event "${liveEventConfig.eventName}" references rewardProgressId "${rewardProgressId}", which was not found in loot.tieredProgressRewards`
            );
        }
        tiers[tier] = { liveEventConfig, tieredProgressRewards };
    }

    return { eventName, tiers };
}

export interface ExtractHomescreenEventParams {
    gameconfigPath: string;
    eventName: string;
}

export function extractHomescreenEvent({ gameconfigPath, eventName }: ExtractHomescreenEventParams): HomescreenEventData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    return extractHomescreenEventData(data, eventName);
}
