import * as fs from 'fs';

export interface ActiveSeason {
    /** 0-based cycle index counted from misc.firstSeasonStart. Not what the game displays. */
    seasonIndex: number;
    /** The season number the game actually shows players. */
    inGameSeasonNumber: number;
    rotationIndex: number;
    seasonConfigId: string;
    /** When this season opens for play. */
    startMs: number;
    /** When this season closes. NOT startMs + seasonDuration -- see the gap note below. */
    endMs: number;
    /** When the next season opens (endMs + bufferAfterSeasonEnd). */
    nextStartMs: number;
    /** True while we're inside the dead window between two seasons. */
    inGap: boolean;
}

// There's no "current season" field in the static config -- seasons rotate on a fixed
// schedule, so the active one has to be computed from wall-clock time.
//
// Two things about that schedule are easy to miss, and both come straight out of
// guildBoss.misc:
//
//   seasonDuration       = 1_209_600s (14d) -- the full START-TO-START cycle
//   bufferAfterSeasonEnd =    86_400s (24h) -- dead time AFTER each season ends
//
// So a season is only playable for (seasonDuration - bufferAfterSeasonEnd) = 13 days,
// and `firstSeasonStart` is the epoch of the first GAP rather than of the first playable
// season -- season 0 opens one buffer later. Treating seasons as 14 days back-to-back
// (which is what this function used to do) puts every computed window a full day early,
// and during each 24h gap it advances the rotation slot a season too soon, so
// `seasonConfigId` names the NEXT boss while the previous season is still closing out.
// That's ~7% of every cycle, which is why the offset below looked like it needed
// periodic hand-recalibration.
//
// ROTATION_INDEX_OFFSET is still an empirical calibration, not something documented in
// the config (verified 2026-07-05 against the live mythic bosses, Belisarius Cawl +
// Ghazghkull -> guild_boss_season_config_5; that verification still holds under the
// gap-corrected index, since the two agree everywhere except inside a gap).
//
// IN_GAME_SEASON_NUMBER_OFFSET maps the cycle index onto the number the game displays.
// If either drifts after a game epoch shift, recalibrate the same way: find today's real
// season/boss in-game and adjust to match. Everything else here is config-derived.
const ROTATION_INDEX_OFFSET = 1;
const IN_GAME_SEASON_NUMBER_OFFSET = 9;

export interface SeasonTiming {
    cycleMs: number;
    gapMs: number;
    activeMs: number;
    /** Epoch at which the first playable season opens. */
    firstPlayableStartMs: number;
}

export function resolveSeasonTiming(misc: any): SeasonTiming {
    const cycleMs = (misc?.seasonDuration ?? 0) * 1000;
    const gapMs = (misc?.bufferAfterSeasonEnd ?? 0) * 1000;
    if (!cycleMs) throw new Error('guildBoss.misc.seasonDuration missing or zero');
    if (cycleMs <= gapMs) throw new Error('guildBoss.misc: bufferAfterSeasonEnd >= seasonDuration');
    return {
        cycleMs,
        gapMs,
        activeMs: cycleMs - gapMs,
        firstPlayableStartMs: (misc?.firstSeasonStart ?? 0) + gapMs,
    };
}

/** 0-based cycle index active at `ms` (the season that has most recently opened). */
export function seasonIndexAt(misc: any, ms: number): number {
    const { cycleMs, firstPlayableStartMs } = resolveSeasonTiming(misc);
    return Math.floor((ms - firstPlayableStartMs) / cycleMs);
}

export function rotationIndexForSeasonIndex(seasonIndex: number, rotationLength: number): number {
    return (((seasonIndex + ROTATION_INDEX_OFFSET) % rotationLength) + rotationLength) % rotationLength;
}

export function inGameSeasonNumberFor(seasonIndex: number): number {
    return seasonIndex - IN_GAME_SEASON_NUMBER_OFFSET;
}

/** Inverse of inGameSeasonNumberFor. */
export function seasonIndexForInGameNumber(inGameSeasonNumber: number): number {
    return inGameSeasonNumber + IN_GAME_SEASON_NUMBER_OFFSET;
}

function computeActiveSeason(misc: any, rotation: string[], now: number): ActiveSeason {
    const { cycleMs, gapMs, activeMs, firstPlayableStartMs } = resolveSeasonTiming(misc);
    const seasonIndex = seasonIndexAt(misc, now);
    const rotationIndex = rotationIndexForSeasonIndex(seasonIndex, rotation.length);
    const startMs = firstPlayableStartMs + seasonIndex * cycleMs;
    const endMs = startMs + activeMs;
    return {
        seasonIndex,
        inGameSeasonNumber: inGameSeasonNumberFor(seasonIndex),
        rotationIndex,
        seasonConfigId: rotation[rotationIndex],
        startMs,
        endMs,
        nextStartMs: endMs + gapMs,
        inGap: now >= endMs,
    };
}

// unitSets.unit_set_1 and unit_set_2 are exact duplicates of each other (same ids, same
// stats) -- just keep one, flattened, instead of the redundant wrapper.
export function flattenUnitSets(unitSets: Record<string, any>): Record<string, any> {
    return Object.values(unitSets)[0] ?? {};
}

function resolveBossUnit(unitId: string, units: Record<string, any>): any {
    return units[unitId.split(':')[0]];
}

export interface GetGuildBossDataParams {
    globalConfigPath: string;
}

export function getGuildBossData({ globalConfigPath }: GetGuildBossDataParams): any {
    const data = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    return { ...data.guildBoss, unitSets: flattenUnitSets(data.guildBoss.unitSets) };
}

export interface SummarizeActiveGuildBossSeasonParams {
    globalConfigPath: string;
}

export function summarizeActiveGuildBossSeason({ globalConfigPath }: SummarizeActiveGuildBossSeasonParams): string {
    const data = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    const guildBoss = data.guildBoss;
    if (!guildBoss) {
        throw new Error('No guildBoss config found at the top level of this file.');
    }

    const lines: string[] = [];

    const season = computeActiveSeason(guildBoss.misc, guildBoss.guildBossSeasonConfigRotation, Date.now());
    lines.push(
        `Active guild boss season: ${season.seasonConfigId} (rotation slot ${season.rotationIndex + 1}/${guildBoss.guildBossSeasonConfigRotation.length}, in-game season #${season.inGameSeasonNumber}, cycle index ${season.seasonIndex})`
    );
    lines.push(`Window: ${new Date(season.startMs).toISOString()} -> ${new Date(season.endMs).toISOString()}`);
    if (season.inGap) {
        lines.push(
            `NOTE: currently in the ${guildBoss.misc.bufferAfterSeasonEnd / 3600}h gap after that season. Next season opens ${new Date(season.nextStartMs).toISOString()}.`
        );
    }
    lines.push('');

    const seasonData = guildBoss.guildBossSeasonDataConfigsGDTO?.[season.seasonConfigId];
    if (!seasonData) {
        throw new Error(`No season data found for ${season.seasonConfigId}`);
    }

    const units = flattenUnitSets(guildBoss.unitSets);
    lines.push('tier,set,chestId,guildXp,encounterIndex,type,bossType,faction,boardId,disallowedFactions');
    for (const tier of seasonData.tiers) {
        for (const set of tier.sets) {
            for (const encounter of set.encounters) {
                const unit = resolveBossUnit(encounter.unitId, units);
                const faction = unit?.FactionId ?? '';
                const disallowed = (encounter.disallowedFactions ?? []).join('|');
                lines.push(
                    `${tier.tier},${set.set},${set.chestId},${set.guildXp},${encounter.encounterIndex},${encounter.guildBossEncounterType},${encounter.bossType},${faction},${encounter.boardId},${disallowed}`
                );
            }
        }
    }

    if (guildBoss.primarchs?.length > 0) {
        lines.push('');
        lines.push('Primarch-tier bosses (bonus/hardest encounters): ' + guildBoss.primarchs.join(', '));
    }

    return lines.join('\n');
}
