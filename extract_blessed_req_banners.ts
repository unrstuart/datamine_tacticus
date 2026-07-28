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
// Blessed Requisition banner discovery - each banner is one idunLiveEventConfigs entry with
// eventType "summoningPortalEvent", eventName doubling as the banner id (e.g.
// "sp_spec_banner_LEG_emperLucius", "sp_spec_banner_Trait_FinalVengeance"). Confirmed 65 banners,
// each featuring 5 or 6 units. titleLocaKey/shortDescriptionLocaKey are the only per-banner text
// fields - everything else (longDescriptionLocaKey, topBannerKey, eventBannerKey,
// summon10BannerKey, popupHeaderKey, resultsHeaderKey, tooltipLocaKey, mercySystem*Key) is shared
// boilerplate UI copy reused across nearly all banners, not banner-specific, so it's left alone
// here.
// ---------------------------------------------------------------------------

export interface BlessedReqBannerSummary {
    id: string;
    title?: string;
    featuredUnitCount: number;
}

export function discoverBlessedReqBanners(data: any, terms?: Map<string, string> | null): Map<string, BlessedReqBannerSummary> {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const summaries = new Map<string, BlessedReqBannerSummary>();

    for (const event of events) {
        if (event.eventType !== 'summoningPortalEvent') continue;
        const title = terms ? terms.get(event.titleLocaKey) : undefined;
        summaries.set(event.eventName, {
            id: event.eventName,
            title,
            featuredUnitCount: (event.featuredHeroes ?? []).length,
        });
    }
    return summaries;
}

export function formatBlessedReqBannerFindResults(data: any, i2Path?: string, globPattern?: string): string {
    const terms = i2Path ? loadTerms(i2Path) : null;
    const summaries = discoverBlessedReqBanners(data, terms);
    const regex = globPattern ? globToRegex(globPattern) : undefined;

    const ids = [...summaries.keys()].filter((id) => !regex || regex.test(id)).sort();

    if (ids.length === 0) {
        return globPattern ? `No blessed req banners matched pattern: ${globPattern}` : 'No blessed req banners found.';
    }

    const lines: string[] = [];
    for (const id of ids) {
        const summary = summaries.get(id)!;
        const titleSuffix = summary.title ? `  (${summary.title})` : '';
        lines.push(`${id}  [${summary.featuredUnitCount} units]${titleSuffix}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Extraction - title/tagline resolved from I2Languages, featured units left as raw snowprint ids
// (joining against character_data's name map is left to the caller), and the banner's power-level
// gate. Cost (preferredCost/fallbackCost, in clientGameConfig.summoningPortal[id_1/id_10]) and the
// weighted drop-rate/mercy tree (clientGameConfig.loot.dropTables[id*]) are deliberately out of
// scope here - this is metadata only.
// ---------------------------------------------------------------------------

export interface BlessedReqBannerData {
    id: string;
    title?: string;
    tagline?: string;
    featuredUnits: string[];
    unlockRequirement?: Record<string, number>;
}

function extractBlessedReqBannerData(data: any, bannerId: string, terms: Map<string, string> | null): BlessedReqBannerData {
    const events = data.clientGameConfig.liveEvents.idunLiveEventConfigs as any[];
    const config = events.find((e) => e.eventType === 'summoningPortalEvent' && e.eventName === bannerId);
    if (!config) throw new Error(`No blessed req banner found with id "${bannerId}"`);

    return {
        id: bannerId,
        title: terms ? terms.get(config.titleLocaKey) : undefined,
        tagline: terms ? terms.get(config.shortDescriptionLocaKey) : undefined,
        featuredUnits: config.featuredHeroes ?? [],
        unlockRequirement: config.bannerUnlockRequirement,
    };
}

export interface ExtractBlessedReqBannerParams {
    gameconfigPath: string;
    bannerId: string;
    i2Path?: string;
}

export function extractBlessedReqBanner({ gameconfigPath, bannerId, i2Path }: ExtractBlessedReqBannerParams): BlessedReqBannerData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const terms = i2Path ? loadTerms(i2Path) : null;
    return extractBlessedReqBannerData(data, bannerId, terms);
}
