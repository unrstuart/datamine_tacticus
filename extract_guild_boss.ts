import * as fs from 'fs';

function getArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
            } else {
                args[key] = 'true';
            }
        }
    });
    return args;
}

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
function flattenUnitSets(unitSets: Record<string, any>): Record<string, any> {
    return Object.values(unitSets)[0] ?? {};
}

function resolveBossUnit(unitId: string, units: Record<string, any>): any {
    return units[unitId.split(':')[0]];
}

function emitJson(data: any) {
    const guildBoss = { ...data.guildBoss, unitSets: flattenUnitSets(data.guildBoss.unitSets) };
    console.log(JSON.stringify(guildBoss, null, 2));
}

function emitSummary(data: any) {
    const guildBoss = data.guildBoss;
    if (!guildBoss) {
        console.error('No guildBoss config found at the top level of this file.');
        return;
    }

    const season = computeActiveSeason(guildBoss.misc, guildBoss.guildBossSeasonConfigRotation, Date.now());
    console.log(
        `Active guild boss season: ${season.seasonConfigId} (rotation slot ${season.rotationIndex + 1}/${guildBoss.guildBossSeasonConfigRotation.length}, season #${season.seasonNumber})`
    );
    console.log(`Window: ${new Date(season.startMs).toISOString()} -> ${new Date(season.endMs).toISOString()}`);
    console.log();

    const seasonData = guildBoss.guildBossSeasonDataConfigsGDTO?.[season.seasonConfigId];
    if (!seasonData) {
        console.error(`No season data found for ${season.seasonConfigId}`);
        return;
    }

    const units = flattenUnitSets(guildBoss.unitSets);
    console.log('tier,set,chestId,guildXp,encounterIndex,type,bossType,faction,boardId,disallowedFactions');
    for (const tier of seasonData.tiers) {
        for (const set of tier.sets) {
            for (const encounter of set.encounters) {
                const unit = resolveBossUnit(encounter.unitId, units);
                const faction = unit?.FactionId ?? '';
                const disallowed = (encounter.disallowedFactions ?? []).join('|');
                console.log(
                    `${tier.tier},${set.set},${set.chestId},${set.guildXp},${encounter.encounterIndex},${encounter.guildBossEncounterType},${encounter.bossType},${faction},${encounter.boardId},${disallowed}`
                );
            }
        }
    }

    if (guildBoss.primarchs?.length > 0) {
        console.log();
        console.log('Primarch-tier bosses (bonus/hardest encounters): ' + guildBoss.primarchs.join(', '));
    }
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;

    if (!inputPath) {
        console.error('Usage: npx ts-node extract_guild_boss.ts --input <file.json> [--json]');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        if ('json' in flags) {
            emitJson(data);
        } else {
            emitSummary(data);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
