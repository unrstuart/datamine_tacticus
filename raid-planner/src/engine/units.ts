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

/**
 * - `ranged`, `melee`: the normal attacks.
 * - `active`: Ahriman's and Neurothrope's once-per-battle abilities.
 * - `physical`: what Neurothrope does to an adjacent enemy instead of a melee attack (it has none).
 */
export type AttackKind = 'ranged' | 'melee' | 'active' | 'physical';

export interface AttackDef {
    kind: AttackKind;
    /** Reaches only enemies adjacent to the attacker (connected hexes). */
    melee: boolean;
    /** Hex distance (any path) the attack reaches, for the non-melee ones. */
    range: number;
    /** An ability rather than a normal attack: Abraxas's bonus hit and smite don't apply. */
    ability: boolean;
    /** Abaddon's relic: the attack also hits up to two more enemies adjacent to both him and its target. */
    relic: boolean;
    /** Sets the target's hexes on fire for two rounds after hitting. */
    lightsFire: boolean;
    /** A normal ranged psychic attack also hits one other enemy next to its target. */
    smite: boolean;
}

const def = (kind: AttackKind, over: Partial<AttackDef> = {}): AttackDef => ({
    kind,
    melee: kind === 'melee' || kind === 'physical',
    range: 1,
    ability: kind === 'active',
    relic: false,
    lightsFire: false,
    smite: false,
    ...over,
});

export const ATTACKS: Record<ActorName, AttackDef[]> = {
    abaddon: [def('ranged', { range: 2 }), def('melee', { relic: true })],
    abraxas: [def('ranged', { range: 2, smite: true }), def('melee', { lightsFire: true })],
    archimatos: [def('ranged', { range: 2, smite: true }), def('melee')],
    ahriman: [
        def('ranged', { range: 2, smite: true, lightsFire: true }),
        def('melee', { lightsFire: true }),
        def('active', { range: 2 }),
    ],
    neurothrope: [def('ranged', { range: 3, smite: true }), def('physical'), def('active', { range: 3 })],
    zkar: [def('ranged', { range: 2, smite: true }), def('melee')],
};

export const attackDef = (actor: ActorName, kind: AttackKind): AttackDef => {
    const found = ATTACKS[actor].find((a) => a.kind === kind);
    if (!found) throw new Error(`${actor} has no ${kind} attack`);
    return found;
};

