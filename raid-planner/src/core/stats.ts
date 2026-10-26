import data from '../data/units.json';
import { ActorName } from '../engine/units';
import { RARITIES, UnitSpec } from './roster';

// A character's own stats at a rank and star level (what its card shows before equipment, upgrades and relics). The numbers
// come from the game's config (data/units.json, written by extract_raid_units.ts):
//
//   stat = (base stat + the first rank-ups' increases) * the star step's unitStatMultiplierPct / 100, rounded down
//
// where a rank-up row is [hp, hp, damage, damage, armor, armor] (two upgrades of each), and a unit at the planner's rank
// index r (Stone I = 1) has completed r - 1 rank-ups.

export interface UnitStats {
    health: number;
    damage: number;
    armor: number;
}

export interface Weapon {
    hits: number;
    profile: string;
    /** Absent for a melee weapon. */
    range?: number;
}

interface UnitData {
    id: string;
    name: string;
    movement: number;
    traits: string[];
    stats: { health: number; damage: number; armor: number; progressionIndex: number };
    statIncreases: number[][];
    weapons: Weapon[];
}

const units = data.units as unknown as Record<ActorName, UnitData>;
const progression = data.progression as Array<{ rarity: string; stars: number; unitStatMultiplierPct: number; abilityStatMultiplierPct: number }>;

/** The game's progression step for a rarity and star level: rarity index + star index (Mythic wings is 5 + 14 = 19). */
export const progressionIndex = (spec: Pick<UnitSpec, 'rarity' | 'stars'>): number => RARITIES.indexOf(spec.rarity) + spec.stars;

export const unitData = (unit: ActorName): UnitData => units[unit];

/** The melee and ranged weapons: hits per attack, the damage profile (Power, Bolter, Psychic...), and range for ranged ones. */
export const weaponsOf = (unit: ActorName): Weapon[] => units[unit].weapons;

/** Whether the unit has stats of its own. A machine of war doesn't: its summon's damage comes from its abilities. */
export const hasStats = (unit: ActorName): boolean => units[unit].statIncreases.length > 0;

/** The unit's stats at the given rank and stars, or undefined for a machine of war. */
export function characterStats(unit: ActorName, spec: UnitSpec): UnitStats | undefined {
    const u = units[unit];
    if (!hasStats(unit)) return undefined;
    const step = progression[progressionIndex(spec)];
    if (!step) return undefined;
    let health = u.stats.health;
    let damage = u.stats.damage;
    let armor = u.stats.armor;
    for (const row of u.statIncreases.slice(0, Math.max(0, spec.rank - 1))) {
        health += row[0] + row[1];
        damage += row[2] + row[3];
        armor += row[4] + row[5];
    }
    const scale = (n: number) => Math.trunc((n * step.unitStatMultiplierPct) / 100);
    return { health: scale(health), damage: scale(damage), armor: scale(armor) };
}
