import { UnitId } from '../core/setup';

// The six actors of the comp and what they can do. Numbers and tags come from docs/rules.md.

export type ActorName = UnitId | 'zkar';

export type Tag = 'chaos' | 'xenos' | 'psyker' | 'summon' | 'demon';

export interface UnitDef {
    movement: number;
    flies: boolean;
    tags: readonly Tag[];
}

export const UNIT_DEFS: Record<ActorName, UnitDef> = {
    abaddon: { movement: 3, flies: false, tags: ['chaos'] },
    abraxas: { movement: 3, flies: false, tags: ['chaos', 'psyker'] },
    archimatos: { movement: 3, flies: false, tags: ['chaos', 'psyker'] },
    ahriman: { movement: 3, flies: true, tags: ['chaos', 'psyker'] },
    neurothrope: { movement: 2, flies: true, tags: ['xenos', 'psyker'] },
    zkar: { movement: 0, flies: false, tags: ['chaos', 'psyker', 'summon', 'demon'] },
};

export const hasTag = (actor: ActorName, tag: Tag): boolean => UNIT_DEFS[actor].tags.includes(tag);

export type Damage = 'psychic' | 'flame' | 'bolter' | 'power' | 'physical';

/**
 * - `ranged`, `melee`: the normal attacks.
 * - `relic`: Abaddon's melee ability (one target plus up to two more adjacent to both).
 * - `active`: Ahriman's and Neurothrope's once-per-battle abilities.
 * - `physical`: what Neurothrope does to an adjacent enemy instead of a melee attack (it has none).
 */
export type AttackKind = 'ranged' | 'melee' | 'relic' | 'active' | 'physical';

export interface AttackDef {
    kind: AttackKind;
    damage: Damage;
    /** Reaches only enemies adjacent to the attacker (connected hexes). */
    melee: boolean;
    /** Hex distance (any path) the attack reaches, for the non-melee ones. */
    range: number;
    /** An ability rather than a normal attack: Abraxas's bonus hit and smite don't apply. */
    ability: boolean;
    /** Sets the target's hexes on fire for two rounds after hitting. */
    lightsFire: boolean;
    /** A normal ranged psychic attack also hits one other enemy next to its target. */
    smite: boolean;
}

const def = (kind: AttackKind, damage: Damage, over: Partial<AttackDef> = {}): AttackDef => ({
    kind,
    damage,
    melee: kind === 'melee' || kind === 'relic' || kind === 'physical',
    range: 1,
    ability: kind === 'relic' || kind === 'active',
    lightsFire: false,
    smite: false,
    ...over,
});

export const ATTACKS: Record<ActorName, AttackDef[]> = {
    abaddon: [def('ranged', 'bolter', { range: 2 }), def('melee', 'power'), def('relic', 'power')],
    abraxas: [def('ranged', 'psychic', { range: 2, smite: true }), def('melee', 'flame', { lightsFire: true })],
    archimatos: [def('ranged', 'psychic', { range: 2, smite: true }), def('melee', 'psychic')],
    ahriman: [
        def('ranged', 'psychic', { range: 2, smite: true, lightsFire: true }),
        def('melee', 'flame', { lightsFire: true }),
        def('active', 'psychic', { range: 2 }),
    ],
    neurothrope: [def('ranged', 'psychic', { range: 3, smite: true }), def('physical', 'physical'), def('active', 'psychic', { range: 3 })],
    zkar: [def('ranged', 'psychic', { range: 2, smite: true }), def('melee', 'psychic')],
};

export const attackDef = (actor: ActorName, kind: AttackKind): AttackDef => {
    const found = ATTACKS[actor].find((a) => a.kind === kind);
    if (!found) throw new Error(`${actor} has no ${kind} attack`);
    return found;
};

export const psychicOrFlame = (d: Damage): boolean => d === 'psychic' || d === 'flame';
