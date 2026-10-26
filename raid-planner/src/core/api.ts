import { ActorName } from '../engine/units';
import { RARITIES, ROSTER_ORDER, ROSTER_UNITS, Roster, UnitSpec, clampSpec } from './roster';

// Reading a player's account (the Tacticus API's /api/v1/player response) into the six units' cards.
//
// A unit in the response looks like:
//   { id: "blackAbaddon", progressionIndex: 16, rank: 19, abilities: [{ id, level }...],
//     items: [{ slotId, level, id: "R_Crit_TalonOfHorus", name, rarity }...], ... }
// progressionIndex is the game's progression step (rarity plus stars, see stats.ts), and rank is 0-based (Stone I = 0), while
// the planner's rank index is 1-based (Stone I = 1).

/** The API's id for each unit. */
export const API_UNIT_IDS: Record<ActorName, string> = {
    abaddon: 'blackAbaddon',
    ahriman: 'thousAhriman',
    abraxas: 'thousInfernalMaster',
    archimatos: 'blackPossession',
    neurothrope: 'tyranNeurothrope',
    zkar: 'thousDaemonPrince',
};

// The progression steps at which each rarity begins: Common 0, Uncommon 3, Rare 6, Epic 9, Legendary 12, Mythic 16.
const RARITY_STARTS = [0, 3, 6, 9, 12, 16];
const MAX_PROGRESSION_INDEX = 19;

/** The rarity and star level for a progression index (negative or too-high values are clamped to the ends). */
export function rarityAndStars(progressionIndex: number): { rarity: (typeof RARITIES)[number]; stars: number } {
    const index = Math.min(Math.max(Math.trunc(progressionIndex), 0), MAX_PROGRESSION_INDEX);
    let r = 0;
    for (let i = RARITY_STARTS.length - 1; i >= 0; i--) {
        if (index >= RARITY_STARTS[i]) {
            r = i;
            break;
        }
    }
    return { rarity: RARITIES[r], stars: index - r };
}

export interface ImportResult {
    roster: Roster;
    /** The units found in the account, and the ones that weren't (those keep what they had). */
    found: ActorName[];
    missing: ActorName[];
    playerName?: string;
}

interface ApiUnit {
    id?: unknown;
    progressionIndex?: unknown;
    rank?: unknown;
    abilities?: unknown;
    items?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function specFrom(unit: ActorName, api: ApiUnit, current: UnitSpec): UnitSpec {
    const info = ROSTER_UNITS[unit];
    const { rarity, stars } = rarityAndStars(typeof api.progressionIndex === 'number' ? api.progressionIndex : 0);
    const levels = new Map<string, number>();
    if (Array.isArray(api.abilities)) for (const a of api.abilities) if (isRecord(a) && typeof a.id === 'string' && typeof a.level === 'number') levels.set(a.id, a.level);
    let relicLevel: number | undefined;
    if (info.relic && Array.isArray(api.items)) {
        const item = api.items.find((i) => isRecord(i) && i.id === info.relic!.id);
        if (isRecord(item) && typeof item.level === 'number') relicLevel = item.level;
    }
    return clampSpec(unit, {
        rarity,
        stars,
        rank: info.hasRank && typeof api.rank === 'number' ? api.rank + 1 : current.rank,
        abilityLevels: info.abilities.map((a, i) => levels.get(a.id) ?? current.abilityLevels[i]),
        relicLevel,
    });
}

/**
 * The roster described by a /player response. Anything the response lacks (a unit the player doesn't have yet, an ability it
 * doesn't list) keeps what `current` had, and everything is brought within what its rarity allows.
 */
export function rosterFromPlayer(response: unknown, current: Roster): ImportResult {
    const player = isRecord(response) && isRecord(response.player) ? response.player : undefined;
    const units = player && Array.isArray(player.units) ? (player.units as ApiUnit[]) : [];
    const byId = new Map(units.filter((u): u is ApiUnit => isRecord(u) && typeof u.id === 'string').map((u) => [u.id as string, u]));
    const roster = { ...current };
    const found: ActorName[] = [];
    const missing: ActorName[] = [];
    for (const unit of ROSTER_ORDER) {
        const api = byId.get(API_UNIT_IDS[unit]);
        if (!api) {
            missing.push(unit);
            continue;
        }
        roster[unit] = specFrom(unit, api, current[unit]);
        found.push(unit);
    }
    const details = player && isRecord(player.details) ? player.details : undefined;
    return { roster, found, missing, ...(details && typeof details.name === 'string' ? { playerName: details.name } : {}) };
}
