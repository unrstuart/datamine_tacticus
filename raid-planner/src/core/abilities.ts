import data from '../data/abilities.json';
import { Rarity } from './roster';

// What the abilities and relics are worth. Each has tables of values by level (data/abilities.json, from the game's config), and
// a unit's rarity multiplies the ones the game marks as scaled. This mirrors how the game (and the planner's ability pages) show them.

/** The multiplier a unit's rarity puts on its scaled ability values. */
export const RARITY_FACTOR: Record<Rarity, number> = { Common: 1, Uncommon: 1.2, Rare: 1.4, Epic: 1.6, Legendary: 1.8, Mythic: 2 };

interface AbilityData {
    name: string;
    description: string;
    variables: Record<string, number[]>;
    constants: Record<string, string>;
    scaled: string[];
}

const abilities = data.abilities as unknown as Record<string, AbilityData>;

export const abilityData = (id: string): AbilityData => {
    const a = abilities[id];
    if (!a) throw new Error(`unknown ability ${id}`);
    return a;
};

/**
 * One of an ability's values at `level` (1-based) for a unit of `rarity`: the table entry, times the rarity factor if the game
 * scales that value, rounded as the game displays it. A relic's values are indexed by relic level and are not scaled: pass rarity
 * undefined.
 */
export function abilityValue(id: string, variable: string, level: number, rarity?: Rarity): number {
    const a = abilityData(id);
    const table = a.variables[variable];
    if (!table) throw new Error(`${id} has no value ${variable}`);
    const raw = table[Math.min(Math.max(level, 1), table.length) - 1];
    return rarity !== undefined && a.scaled.includes(variable) ? Math.round(raw * RARITY_FACTOR[rarity]) : raw;
}

/** A fixed value of the ability (the range of a buff, the number of hits...). */
export function abilityConstant(id: string, name: string): number | string {
    const raw = abilityData(id).constants[name];
    if (raw === undefined) throw new Error(`${id} has no constant ${name}`);
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
}
