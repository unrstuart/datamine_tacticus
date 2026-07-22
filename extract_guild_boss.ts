import * as fs from 'fs';

interface ActiveSeason {
    seasonNumber: number;
    rotationIndex: number;
    seasonConfigId: string;
    startMs: number;
    endMs: number;
}

// There's no "current season" field in the static config -- seasons rotate on a fixed
// schedule (misc.firstSeasonStart + misc.seasonDuration), so the active one has to be
// computed from wall-clock time. The +1 below is an empirical calibration, not something
// documented in the config: naive (elapsed / duration) % rotation.length lands one slot
// behind the real in-game season (verified 2026-07-05 against the live mythic bosses,
// Belisarius Cawl + Ghazghkull -> guild_boss_season_config_5). If a future rotation-length
// change makes this drift again, recalibrate the same way: find today's real season/boss
// in-game and adjust the offset to match.
function computeActiveSeason(misc: any, rotation: string[], now: number): ActiveSeason {
    const seasonDurationMs = misc.seasonDuration * 1000;
    const seasonNumber = Math.floor((now - misc.firstSeasonStart) / seasonDurationMs);
    const rotationIndex = (((seasonNumber + 1) % rotation.length) + rotation.length) % rotation.length;
    const startMs = misc.firstSeasonStart + seasonNumber * seasonDurationMs;
    return {
        seasonNumber,
        rotationIndex,
        seasonConfigId: rotation[rotationIndex],
        startMs,
        endMs: startMs + seasonDurationMs,
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
        `Active guild boss season: ${season.seasonConfigId} (rotation slot ${season.rotationIndex + 1}/${guildBoss.guildBossSeasonConfigRotation.length}, season #${season.seasonNumber})`
    );
    lines.push(`Window: ${new Date(season.startMs).toISOString()} -> ${new Date(season.endMs).toISOString()}`);
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
