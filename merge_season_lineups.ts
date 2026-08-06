import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
    inGameSeasonNumberFor,
    resolveSeasonTiming,
    rotationIndexForSeasonIndex,
    seasonIndexAt,
    seasonIndexForInGameNumber,
} from './extract_guild_boss';

// WHY THIS EXISTS
//
// guildBossSeasonConfigRotation looks like a static 5-entry table, so it's natural to
// read a GlobalConfig snapshot as "config_3 == the Lion season, forever". It isn't. The
// rotation is a SLIDING WINDOW: the game rolls each config_N's *contents* forward over
// time, so any single snapshot only describes its own ~5-season neighbourhood (the
// current season plus the next rotation.length - 1).
//
// Consequences, if you only ever keep the latest snapshot:
//   - "what bosses were in season 97?" is unanswerable once the window has moved past it
//   - "what bosses are in season 118?" is wrong, silently, with no error to catch it
//   - overwriting guild_boss.json on each refresh destroys the older windows for good
//
// So this accumulates every capture into one season-keyed overlay. Each run contributes
// the rotation.length seasons it can actually see; overlapping seasons resolve by newest
// capturedAt, so an in-game rebalance of an existing season wins over a stale capture.
//
// Run it on every config refresh and commit the overlay -- the value is entirely in the
// history, and a snapshot you didn't keep is a season you can never answer for.

export interface SeasonLineupEncounter {
    rarityIndex: number | null;
    set: number | null;
    encounterIndex: number;
    encounterType: string | null;
    bossType: string;
    unitId: string | null;
    boardId: string | null;
}

export interface SeasonLineupEntry {
    /** In-game season number (what the game displays), not the raw cycle index. */
    season: number;
    configId: string;
    configVersion: string;
    capturedAt: string;
    encounters: SeasonLineupEncounter[];
}

export interface SeasonLineupsOverlay {
    schemaVersion: 'loki-season-lineups.v1';
    generatedAt: string | null;
    sources: Array<{
        configVersion: string;
        capturedAt: string;
        captureSeason: number;
        window: [number, number];
    }>;
    seasons: Record<string, SeasonLineupEntry>;
}

export const EMPTY_OVERLAY: SeasonLineupsOverlay = {
    schemaVersion: 'loki-season-lineups.v1',
    generatedAt: null,
    sources: [],
    seasons: {},
};

function encountersFor(config: any): SeasonLineupEncounter[] {
    const out: SeasonLineupEncounter[] = [];
    for (const tier of Array.isArray(config?.tiers) ? config.tiers : []) {
        const rarityIndex = typeof tier?.tier === 'number' ? tier.tier : null;
        for (const set of Array.isArray(tier?.sets) ? tier.sets : []) {
            for (const encounter of Array.isArray(set?.encounters) ? set.encounters : []) {
                if (!encounter?.bossType) continue;
                out.push({
                    rarityIndex,
                    set: set?.set ?? null,
                    encounterIndex: encounter.encounterIndex ?? 0,
                    encounterType: encounter.guildBossEncounterType ?? null,
                    bossType: encounter.bossType,
                    unitId: encounter.unitId ?? null,
                    boardId: encounter.boardId ?? null,
                });
            }
        }
    }
    return out;
}

// The raw CDN GlobalConfig carries no version/timestamp of its own, so derive stable
// stand-ins: content hash for identity, file mtime for capture time. Both are
// overridable for callers that track richer provenance.
function deriveConfigVersion(raw: string, explicit?: string): string {
    if (explicit) return explicit;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

function deriveCapturedAt(configPath: string, snapshot: any, explicit?: string): string {
    if (explicit) return explicit;
    if (typeof snapshot?.extractedAt === 'string') return snapshot.extractedAt;
    try {
        return fs.statSync(configPath).mtime.toISOString();
    } catch {
        return new Date().toISOString();
    }
}

export function loadOverlay(overlayPath: string): SeasonLineupsOverlay {
    if (!fs.existsSync(overlayPath)) return { ...EMPTY_OVERLAY, sources: [], seasons: {} };
    try {
        const parsed = JSON.parse(fs.readFileSync(overlayPath, 'utf-8')) as SeasonLineupsOverlay;
        return { ...EMPTY_OVERLAY, ...parsed, sources: parsed.sources ?? [], seasons: parsed.seasons ?? {} };
    } catch (error: any) {
        throw new Error(`Existing overlay at ${overlayPath} is not readable JSON: ${error.message}`);
    }
}

export interface MergeSeasonLineupsParams {
    globalConfigPath: string;
    overlayPath: string;
    /** Override the derived content-hash identity for this capture. */
    configVersion?: string;
    /** Override the derived capture timestamp (ISO 8601). */
    capturedAt?: string;
    /** Override the in-game season number this capture's window starts at. */
    captureSeason?: number;
}

export interface MergeSeasonLineupsResult {
    overlay: SeasonLineupsOverlay;
    captureSeason: number;
    window: [number, number];
    written: number;
    skipped: number;
    totalSeasons: number;
}

export function mergeSeasonLineups({
    globalConfigPath,
    overlayPath,
    configVersion,
    capturedAt,
    captureSeason,
}: MergeSeasonLineupsParams): MergeSeasonLineupsResult {
    const raw = fs.readFileSync(globalConfigPath, 'utf-8');
    const snapshot = JSON.parse(raw);
    const guildBoss = snapshot?.guildBoss;
    if (!guildBoss) throw new Error('No guildBoss config found at the top level of this file.');

    const rotation: string[] = guildBoss.guildBossSeasonConfigRotation ?? [];
    const configs: Record<string, any> = guildBoss.guildBossSeasonDataConfigsGDTO ?? {};
    if (rotation.length === 0) throw new Error('guildBossSeasonConfigRotation is empty');

    // Throws if seasonDuration/bufferAfterSeasonEnd are missing or nonsensical.
    resolveSeasonTiming(guildBoss.misc);

    const resolvedVersion = deriveConfigVersion(raw, configVersion);
    const resolvedCapturedAt = deriveCapturedAt(globalConfigPath, snapshot, capturedAt);
    const resolvedCaptureSeason =
        captureSeason ?? inGameSeasonNumberFor(seasonIndexAt(guildBoss.misc, Date.parse(resolvedCapturedAt)));

    const overlay = loadOverlay(overlayPath);
    const lastSeason = resolvedCaptureSeason + rotation.length - 1;

    let written = 0;
    let skipped = 0;
    for (let season = resolvedCaptureSeason; season <= lastSeason; season++) {
        const configId = rotation[rotationIndexForSeasonIndex(seasonIndexForInGameNumber(season), rotation.length)];
        const entry: SeasonLineupEntry = {
            season,
            configId,
            configVersion: resolvedVersion,
            capturedAt: resolvedCapturedAt,
            encounters: encountersFor(configs[configId]),
        };
        const existing = overlay.seasons[String(season)];
        // Newest capture wins; a first write always lands.
        if (!existing || Date.parse(resolvedCapturedAt) >= Date.parse(existing.capturedAt)) {
            overlay.seasons[String(season)] = entry;
            written++;
        } else {
            skipped++;
        }
    }

    overlay.sources = overlay.sources.filter(source => source.configVersion !== resolvedVersion);
    overlay.sources.push({
        configVersion: resolvedVersion,
        capturedAt: resolvedCapturedAt,
        captureSeason: resolvedCaptureSeason,
        window: [resolvedCaptureSeason, lastSeason],
    });
    overlay.sources.sort((a, b) => a.captureSeason - b.captureSeason);
    overlay.generatedAt = new Date().toISOString();

    fs.mkdirSync(path.dirname(path.resolve(overlayPath)), { recursive: true });
    fs.writeFileSync(overlayPath, JSON.stringify(overlay, null, 2) + '\n');

    return {
        overlay,
        captureSeason: resolvedCaptureSeason,
        window: [resolvedCaptureSeason, lastSeason],
        written,
        skipped,
        totalSeasons: Object.keys(overlay.seasons).length,
    };
}

export function formatMergeSummary(result: MergeSeasonLineupsResult, overlayPath: string): string {
    const seasons = Object.keys(result.overlay.seasons)
        .map(Number)
        .sort((a, b) => a - b);
    const span = seasons.length > 0 ? `${seasons[0]}-${seasons[seasons.length - 1]}` : 'none';
    return [
        `Merged capture window seasons ${result.window[0]}-${result.window[1]} into ${overlayPath}`,
        `  wrote ${result.written}, skipped ${result.skipped} (older than existing)`,
        `  overlay now covers ${result.totalSeasons} season(s): ${span}`,
        `  captures merged so far: ${result.overlay.sources.length}`,
    ].join('\n');
}
