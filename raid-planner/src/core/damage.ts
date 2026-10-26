import data from '../data/units.json';

// How much damage an attack does. Kept as plain functions so the search can score plans by damage.
//
// Each hit is its own roll against armor:
//     hit = max(raw - armor, raw * pierce)        where  raw = damage stat + fixed damage buffs
// The target's armor takes off what it can, but never more than leaves the pierce ratio of the hit (Psychic has pierce 1, so
// armor does nothing; Physical has 0.01, so armor takes almost all of it). Fixed damage buffs ("deals +1400 damage") are part
// of `raw`, so they count on every hit. Percentage modifiers (+20%, +33%, +50% from high ground) multiply after armor, and
// multiply each other. An attack is `hits` such hits.

/** Attacking from higher ground than the target deals 50% more damage. It applies to every character, Z'kar included. */
export const HIGH_GROUND_MULTIPLIER = 1.5;

const PIERCE = data.pierce as Record<string, number>;

/** The share of a hit that gets through any armor, for a damage profile (Power 0.4, Bolter 0.2, Psychic 1...). */
export function pierceRatio(profile: string): number {
    const ratio = PIERCE[profile];
    if (ratio === undefined) throw new Error(`unknown damage profile ${profile}`);
    return ratio;
}

export interface AttackInput {
    /** The attacker's damage stat. */
    damage: number;
    /** Damage added to every hit by fixed buffs ("+1400"). */
    fixed?: number;
    hits: number;
    armor: number;
    /** The pierce ratio of the damage profile, 0..1. */
    pierce: number;
    /** Percentage modifiers as multipliers: +20% is 1.2. They multiply each other and apply after armor. */
    modifiers?: readonly number[];
}

/** One hit: what armor leaves of the raw damage, but at least the pierce share, times the modifiers. */
export function hitDamage({ damage, fixed = 0, armor, pierce, modifiers = [] }: Omit<AttackInput, 'hits'>): number {
    const raw = damage + fixed;
    const afterArmor = Math.max(raw - armor, raw * pierce);
    return afterArmor * modifiers.reduce((product, m) => product * m, 1);
}

/** The damage of a whole attack: its hits, each worked out on its own. */
export const attackDamage = (input: AttackInput): number => input.hits * hitDamage(input);
