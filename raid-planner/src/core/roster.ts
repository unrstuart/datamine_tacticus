import { ActorName } from '../engine/units';

// The six units' own stats as the player has them: rarity, stars, rank, ability levels and relic. This is what damage will be
// worked out from. Everything here is plain data and pure functions; the form that edits it is in ui/RosterPanel.tsx.
//
// The rules (what each rarity allows) are the game's: stars and ranks climb together with rarity, an ability can be levelled
// up to the unit's rarity cap, and the numbers match the game's progression (checked against the planner's own tables).

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/** The game's star levels, in order. A rarity spans a few of them, and the last of one is the first of the next. */
export const STAR_NAMES = [
    'No stars',
    '1 star',
    '2 stars',
    '3 stars',
    '4 stars',
    '5 stars',
    '1 red star',
    '2 red stars',
    '3 red stars',
    '4 red stars',
    '5 red stars',
    '1 blue star',
    '2 blue stars',
    '3 blue stars',
    'Mythic wings',
] as const;

/** The game's ranks. Index 0 is locked; the API reports a unit's rank as this index. */
export const RANK_NAMES = [
    'Locked',
    'Stone I',
    'Stone II',
    'Stone III',
    'Iron I',
    'Iron II',
    'Iron III',
    'Bronze I',
    'Bronze II',
    'Bronze III',
    'Silver I',
    'Silver II',
    'Silver III',
    'Gold I',
    'Gold II',
    'Gold III',
    'Diamond I',
    'Diamond II',
    'Diamond III',
    'Adamantine I',
    'Adamantine II',
    'Adamantine III',
] as const;

export interface RarityRules {
    minStars: number;
    maxStars: number;
    /** Stone I for every rarity: a unit of any rarity can be at any rank up to the rarity's maximum. */
    minRank: number;
    maxRank: number;
    /** Abilities can be levelled up to this. (Level 65 and Adamantine III aren't in the game yet.) */
    maxAbilityLevel: number;
}

export const RARITY_RULES: Record<Rarity, RarityRules> = {
    Common: { minStars: 0, maxStars: 2, minRank: 1, maxRank: 4, maxAbilityLevel: 8 },
    Uncommon: { minStars: 2, maxStars: 4, minRank: 1, maxRank: 7, maxAbilityLevel: 17 },
    Rare: { minStars: 4, maxStars: 6, minRank: 1, maxRank: 10, maxAbilityLevel: 26 },
    Epic: { minStars: 6, maxStars: 8, minRank: 1, maxRank: 13, maxAbilityLevel: 35 },
    Legendary: { minStars: 8, maxStars: 11, minRank: 1, maxRank: 18, maxAbilityLevel: 50 },
    Mythic: { minStars: 11, maxStars: 14, minRank: 1, maxRank: 20, maxAbilityLevel: 60 },
};

export const MAX_RELIC_LEVEL = 10;
export const MIN_ABILITY_LEVEL = 1;

export interface AbilityInfo {
    id: string;
    name: string;
    kind: 'active' | 'passive' | 'ability';
}

export interface RosterUnit {
    name: string;
    abilities: AbilityInfo[];
    /** The relic this unit can equip, if any that matters here. */
    relic?: { id: string; name: string };
    /** Machines of war have no rank. */
    hasRank: boolean;
}

export const ROSTER_UNITS: Record<ActorName, RosterUnit> = {
    abaddon: {
        name: 'Abaddon',
        hasRank: true,
        abilities: [
            { id: 'Drachnyen', name: 'Drach’nyen', kind: 'active' },
            { id: 'FirstAmongTraitors', name: 'First Among Traitors', kind: 'passive' },
        ],
        relic: { id: 'R_Crit_TalonOfHorus', name: 'Talon of Horus' },
    },
    ahriman: {
        name: 'Ahriman',
        hasRank: true,
        abilities: [
            { id: 'Doombolt', name: 'Doombolt', kind: 'active' },
            { id: 'PsychicStalk', name: 'Psychic Stalk', kind: 'passive' },
        ],
    },
    abraxas: {
        name: 'Abraxas',
        hasRank: true,
        abilities: [
            { id: 'MasterOfTheTutelaries', name: 'Malefic Maelstrom', kind: 'active' },
            { id: 'InfernalPacts', name: 'Infernal Pacts', kind: 'passive' },
        ],
        relic: { id: 'R_Booster_Crit_BookOfFate', name: 'Book of Fate' },
    },
    archimatos: {
        name: 'Archimatos',
        hasRank: true,
        abilities: [
            { id: 'Incursion', name: 'Daemonic Incursion', kind: 'active' },
            { id: 'Possession', name: 'Possession', kind: 'passive' },
        ],
        relic: { id: 'R_Booster_Crit_BookOfFate', name: 'Book of Fate' },
    },
    neurothrope: {
        name: 'Neurothrope',
        hasRank: true,
        abilities: [
            { id: 'SpiritLeech', name: 'Spirit Leech', kind: 'active' },
            { id: 'Neuroparasite', name: 'Neuroparasite', kind: 'passive' },
        ],
        relic: { id: 'R_Booster_Block_NornCrown', name: 'Norn Crown' },
    },
    zkar: {
        name: 'Z’kar',
        hasRank: false,
        abilities: [
            { id: 'AetherStride', name: 'Aether Stride', kind: 'ability' },
            { id: 'InfernalCannon', name: 'Infernal Cannon', kind: 'ability' },
            { id: 'CabalOfSorcerers', name: 'Cabal of Sorcerers', kind: 'ability' },
        ],
    },
};

export const ROSTER_ORDER: readonly ActorName[] = ['abaddon', 'ahriman', 'abraxas', 'archimatos', 'neurothrope', 'zkar'];

export interface UnitSpec {
    rarity: Rarity;
    /** An index into STAR_NAMES. */
    stars: number;
    /** An index into RANK_NAMES (ignored for a machine of war). */
    rank: number;
    /** One level per ability, in the order of ROSTER_UNITS[unit].abilities. */
    abilityLevels: number[];
    /** The equipped relic's level, or undefined when none is equipped (and always undefined for a unit that can't use one). */
    relicLevel?: number;
}

export type Roster = Record<ActorName, UnitSpec>;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)));

export const canEquipRelic = (unit: ActorName): boolean => ROSTER_UNITS[unit].relic !== undefined;

/** A unit with everything at the game's current maximum: Mythic, wings, Adamantine II, abilities at 60, relic level 10. */
export function maxedSpec(unit: ActorName): UnitSpec {
    const rules = RARITY_RULES.Mythic;
    return {
        rarity: 'Mythic',
        stars: rules.maxStars,
        rank: rules.maxRank,
        abilityLevels: ROSTER_UNITS[unit].abilities.map(() => rules.maxAbilityLevel),
        ...(canEquipRelic(unit) ? { relicLevel: MAX_RELIC_LEVEL } : {}),
    };
}

export function maxedRoster(): Roster {
    return Object.fromEntries(ROSTER_ORDER.map((u) => [u, maxedSpec(u)])) as Roster;
}

/**
 * Bring a spec within what its rarity allows: stars and rank into the rarity's range, ability levels between 1 and the cap, a
 * relic only on a unit that can use one and within 1..10. Used when the rarity changes and on anything read back from storage.
 */
export function clampSpec(unit: ActorName, spec: UnitSpec): UnitSpec {
    const rules = RARITY_RULES[spec.rarity];
    const abilities = ROSTER_UNITS[unit].abilities;
    return {
        rarity: spec.rarity,
        stars: clamp(spec.stars, rules.minStars, rules.maxStars),
        rank: clamp(spec.rank, rules.minRank, rules.maxRank),
        abilityLevels: abilities.map((_, i) => clamp(spec.abilityLevels[i] ?? rules.maxAbilityLevel, MIN_ABILITY_LEVEL, rules.maxAbilityLevel)),
        ...(canEquipRelic(unit) && spec.relicLevel !== undefined ? { relicLevel: clamp(spec.relicLevel, 1, MAX_RELIC_LEVEL) } : {}),
    };
}

/** Change a unit's rarity; everything else is brought within the new rarity's range. */
export const withRarity = (unit: ActorName, spec: UnitSpec, rarity: Rarity): UnitSpec => clampSpec(unit, { ...spec, rarity });

export const withStars = (unit: ActorName, spec: UnitSpec, stars: number): UnitSpec => clampSpec(unit, { ...spec, stars });

export const withRank = (unit: ActorName, spec: UnitSpec, rank: number): UnitSpec => clampSpec(unit, { ...spec, rank });

export function withAbilityLevel(unit: ActorName, spec: UnitSpec, index: number, level: number): UnitSpec {
    const abilityLevels = [...spec.abilityLevels];
    abilityLevels[index] = level;
    return clampSpec(unit, { ...spec, abilityLevels });
}

/** Equip the unit's relic at `level`, or take it off with undefined. A unit with no relic to equip is returned as it was. */
export const withRelic = (unit: ActorName, spec: UnitSpec, level: number | undefined): UnitSpec => (canEquipRelic(unit) ? clampSpec(unit, { ...spec, relicLevel: level }) : spec);

/** Whether the spec has anything the rarity doesn't allow. */
export const isValidSpec = (unit: ActorName, spec: UnitSpec): boolean => JSON.stringify(clampSpec(unit, spec)) === JSON.stringify(spec);

/** The ranges the form offers for a rarity, as lists of values to pick from. */
export function optionsFor(rarity: Rarity): { stars: number[]; ranks: number[]; maxAbilityLevel: number } {
    const r = RARITY_RULES[rarity];
    const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return { stars: range(r.minStars, r.maxStars), ranks: range(r.minRank, r.maxRank), maxAbilityLevel: r.maxAbilityLevel };
}

/**
 * Read a roster back from storage or an import: anything missing or out of range is fixed or defaulted, so a stale or edited
 * file can't leave the form with an impossible unit.
 */
export function sanitizeRoster(value: unknown): Roster {
    const maxed = maxedRoster();
    if (typeof value !== 'object' || value === null) return maxed;
    const input = value as Record<string, Partial<UnitSpec> | undefined>;
    const out = { ...maxed };
    for (const unit of ROSTER_ORDER) {
        const raw = input[unit];
        if (!raw || typeof raw !== 'object') continue;
        const rarity = RARITIES.includes(raw.rarity as Rarity) ? (raw.rarity as Rarity) : maxed[unit].rarity;
        const numberOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
        out[unit] = clampSpec(unit, {
            rarity,
            stars: numberOr(raw.stars, maxed[unit].stars),
            rank: numberOr(raw.rank, maxed[unit].rank),
            abilityLevels: Array.isArray(raw.abilityLevels) ? raw.abilityLevels.map((l) => numberOr(l, RARITY_RULES[rarity].maxAbilityLevel)) : maxed[unit].abilityLevels,
            // An explicit "no relic" (the key is missing or not a number) stays unequipped; a number equips it.
            relicLevel: typeof raw.relicLevel === 'number' ? raw.relicLevel : undefined,
        });
    }
    return out;
}
