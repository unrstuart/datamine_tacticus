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
// Descriptive text resolution - none of titleLocaKey/subtitleLocaKey/shortDescriptionLocaKey/
// longDescriptionLocaKey are ever populated on a homeScreenEvent config (confirmed across all 70
// entries). The actual gameplay-rule text (buffs, point-scoring rules) lives scattered across
// modifiers[].locaKey and trackers[].locaKey instead, alongside the previewTitleLocaKey/
// previewSubtitleLocaKey header/teaser copy. locaKeys can repeat across multiple modifier/tracker
// entries (same text, different numeric params), so this dedupes before resolving.
// ---------------------------------------------------------------------------

function collectDescriptionLocaKeys(config: any): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();

    function add(key: string | undefined) {
        if (key && !seen.has(key)) {
            seen.add(key);
            keys.push(key);
        }
    }

    add(config.previewTitleLocaKey);
    add(config.previewSubtitleLocaKey);
    for (const modifier of config.modifiers ?? []) add(modifier.locaKey);
    for (const tracker of config.trackers ?? []) add(tracker.locaKey);

    return keys;
}

function resolveDescriptions(config: any, terms: Map<string, string>): string[] {
    return collectDescriptionLocaKeys(config)
        .map((key) => terms.get(key))
        .filter((text): text is string => !!text);
}

// ---------------------------------------------------------------------------
// Some modifiers (type "battleEnvironmentAbility") only carry an abilityId - the actual stat-boost
// values (e.g. FactionBoost_DarkAngels's armorPct/dmgPct/healthPct) live in units.abilities and
// units.abilityPowerModifiers instead. A tier can reference more than one ability (e.g.
// warp_surge_tier_high has two), so these are joined in as a map keyed by abilityId rather than
// decoded/flattened - ability shapes vary too much (simple stat boosts vs. summon abilities with
// per-level variable arrays) to normalize here.
// ---------------------------------------------------------------------------

export interface HomescreenEventModifierAbility {
    ability: any;
    powerModifier?: any;
}

function resolveModifierAbilities(
    config: any,
    abilities: Record<string, any>,
    abilityPowerModifiers: Record<string, any>
): Record<string, HomescreenEventModifierAbility> {
    const resolved: Record<string, HomescreenEventModifierAbility> = {};
    for (const modifier of config.modifiers ?? []) {
        const abilityId = modifier.abilityId;
        if (!abilityId || resolved[abilityId]) continue;
        const ability = abilities[abilityId];
        if (!ability) {
            throw new Error(
                `Homescreen event "${config.eventName}" modifier references abilityId "${abilityId}", which was not found in units.abilities`
            );
        }
        resolved[abilityId] = { ability, powerModifier: abilityPowerModifiers[abilityId] };
    }
    return resolved;
}

// ---------------------------------------------------------------------------
// Each tier's initialOfferIds (2-3 ids: a "bundle", "playmore", and/or "booster" variant - these
// are the only three suffixes seen so far) point into shop.offers, which in turn points at a
// realMoneyProducts entry for price/rewards. Offer naming doesn't reliably mirror the tier's own
// eventName (e.g. hse_trait_boost_rapid_assault_tier_high's offers are named
// offer_homescreen_event_trait_boost_rapidassault_tier_high_*), so these must be resolved via
// initialOfferIds/offerId directly rather than guessed from the event name.
// ---------------------------------------------------------------------------

export interface HomescreenEventOffer {
    offer: any;
    realMoneyProduct?: any;
}

function resolveTierOffers(
    config: any,
    offersById: Map<string, any>,
    realMoneyProducts: Record<string, any>
): Record<string, HomescreenEventOffer> {
    const ids = new Set<string>(config.initialOfferIds ?? []);
    if (config.offerId) ids.add(config.offerId);

    const resolved: Record<string, HomescreenEventOffer> = {};
    for (const offerId of ids) {
        const offer = offersById.get(offerId);
        if (!offer) {
            throw new Error(`Homescreen event "${config.eventName}" references offerId "${offerId}", which was not found in shop.offers`);
        }
        resolved[offerId] = { offer, realMoneyProduct: realMoneyProducts[offer.realMoneyProductId] };
    }
    return resolved;
}

// ---------------------------------------------------------------------------
// Extraction - a straight join of each tier's raw idunLiveEventConfigs entry with its
// tieredProgressRewards array (looked up via rewardProgressId), any abilities its modifiers
// reference, its offers, plus resolved descriptive text.
// No reward-string decoding or restructuring here: GameConfig ships no start/end scheduling for
// these events (see investigation notes), so this is raw material for further tooling rather than
// a finished report.
// ---------------------------------------------------------------------------

export interface HomescreenEventTierData {
    liveEventConfig: any;
    tieredProgressRewards: any[];
    abilities?: Record<string, HomescreenEventModifierAbility>;
    offers?: Record<string, HomescreenEventOffer>;
    descriptions?: string[];
}

export interface HomescreenEventData {
    eventName: string;
    tiers: Partial<Record<HomescreenEventTier, HomescreenEventTierData>>;
}

function extractHomescreenEventData(data: any, eventName: string, terms: Map<string, string> | null): HomescreenEventData {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const matches = events.filter((e) => e.eventType === 'homeScreenEvent' && splitEventName(e.eventName).name === eventName);
    if (matches.length === 0) throw new Error(`No homescreen event found with name "${eventName}"`);

    const abilities = data.clientGameConfig.units.abilities;
    const abilityPowerModifiers = data.clientGameConfig.units.abilityPowerModifiers;
    const offersById = new Map<string, any>(data.clientGameConfig.shop.offers.map((o: any) => [o.offerId, o]));
    const realMoneyProducts = data.clientGameConfig.shop.realMoneyProducts;

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
        const resolvedAbilities = resolveModifierAbilities(liveEventConfig, abilities, abilityPowerModifiers);
        const resolvedOffers = resolveTierOffers(liveEventConfig, offersById, realMoneyProducts);
        tiers[tier] = {
            liveEventConfig,
            tieredProgressRewards,
            abilities: Object.keys(resolvedAbilities).length > 0 ? resolvedAbilities : undefined,
            offers: Object.keys(resolvedOffers).length > 0 ? resolvedOffers : undefined,
            descriptions: terms ? resolveDescriptions(liveEventConfig, terms) : undefined,
        };
    }

    return { eventName, tiers };
}

export interface ExtractHomescreenEventParams {
    gameconfigPath: string;
    eventName: string;
    i2Path?: string;
}

export function extractHomescreenEvent({ gameconfigPath, eventName, i2Path }: ExtractHomescreenEventParams): HomescreenEventData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractHomescreenEventData(data, eventName, terms);
}
