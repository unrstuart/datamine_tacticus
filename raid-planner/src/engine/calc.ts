import { abilityConstant, abilityValue } from '../core/abilities';
import { Cell } from '../core/hex';
import { Rarity, ROSTER_UNITS } from '../core/roster';
import { UnitId } from '../core/setup';
import { characterStats, weaponsOf, Weapon } from '../core/stats';
import { HIGH_GROUND_MULTIPLIER, hitDamage, pierceRatio } from '../core/damage';
import { Context, Enemy, State, actorCells, adjacent, burning, distanceBetween, enemyCells, hasEffect } from './state';
import { ActorName, AttackKind, hasTag } from './units';

// What an attack is worth in damage. Every hit is a raw value (the attacker's damage stat, or an ability's own damage, plus the
// flat damage buffs on it) that armor takes from, then percentage modifiers multiply (see core/damage.ts). The flat buffs and
// modifiers come from the abilities and relics (data/abilities.json), at the levels the roster says; this file says who gets what:
//
//   flat per hit
//     Abaddon's First Among Traitors  other Chaos units within 2 hexes: +extraDmg, and +extraDmg_2 for each attack he has made, up to maxDmg
//     Psychic Stalk                   Chaos units' Flame and Psychic hits on a burning enemy: +extraDmg
//     Norn Crown                      Psykers and summons (not Neurothrope) within 2 of him, against an infected enemy: +extraDmg
//     Neuroparasite                   Neurothrope's Psychic hits: +extraDmg per parasite level on the enemy (the level before the attack)
//     Book of Fate                    the Daemon summon's attack that the bearer's attack sets off: +extraDmg
//     Hunter of Souls                 Z'kar's attack at the start of the next round: +extraDmg per adjacent friendly Psyker
//   percentage
//     high ground x1.5, Psychic Stalk +% on Flame and Psychic hits against a burning enemy,
//     Cabal of Sorcerers +% for Mythic Psyker characters beside Z'kar or beside another Mythic Psyker character
//   extra hits
//     Infernal Pacts (Abraxas)        a Chaos unit beside Abraxas adds a Psychic hit to its normal ranged attack (a Daemon, to its melee too)
//     Let the Galaxy Burn             Abaddon and Archimatos add a hit when the enemy is on a hex with an effect
//     Talon of Horus                  Abaddon's normal melee attack also hits the other enemies beside both him and the target
//     Drach'nyen                      Abaddon's second melee attack, once his active is on
// Hits with a damage range (min-max) deal its average.

export interface FlatBonus {
    id: string;
    amount: number;
}

export interface Modifier {
    id: string;
    multiplier: number;
}

/** A group of identical hits on one enemy, worked out. */
export interface HitGroup {
    label: string;
    target: Enemy;
    hits: number;
    profile: string;
    /** The damage stat, or the ability's own damage, before the flat buffs. */
    base: number;
    flat: FlatBonus[];
    modifiers: Modifier[];
    armor: number;
    /** Damage dealt by the whole group. */
    damage: number;
}

export const avg = (a: number, b: number): number => (a + b) / 2;

const PSYCHIC_OR_FLAME = new Set(['Psychic', 'Flame']);

// ---- the roster's numbers ---------------------------------------------------------------------------------------------

const abilityIndex = (unit: ActorName, role: 'active' | 'passive'): number => ROSTER_UNITS[unit].abilities.findIndex((a) => a.kind === role);

/** An ability's value for a unit at its own ability level and rarity. */
export function ownValue(ctx: Context, unit: ActorName, role: 'active' | 'passive', variable: string): number {
    const i = abilityIndex(unit, role);
    return abilityValue(ROSTER_UNITS[unit].abilities[i].id, variable, ctx.roster[unit].abilityLevels[i], ctx.roster[unit].rarity);
}

export const ownConstant = (unit: ActorName, role: 'active' | 'passive', name: string): number | string => abilityConstant(ROSTER_UNITS[unit].abilities[abilityIndex(unit, role)].id, name);

/** A relic ability's value at the bearer's relic level, or undefined when the unit hasn't the relic equipped. */
export function relicValue(ctx: Context, unit: ActorName, variable: string): number | undefined {
    const relic = ROSTER_UNITS[unit].relic;
    const level = ctx.roster[unit].relicLevel;
    if (!relic || level === undefined) return undefined;
    const id = relic.id === 'R_Crit_TalonOfHorus' ? 'TalonOfHorus' : relic.id === 'R_Booster_Crit_BookOfFate' ? 'BookOfFate' : 'NornCrown';
    return abilityValue(id, variable, level);
}

/** The damage stat of a hit of a normal attack: a character's own, or Z'kar's from Aether Stride. */
export function baseDamage(ctx: Context, actor: ActorName): number {
    if (actor === 'zkar') return abilityValue('AetherStride', 'summonDmg', ctx.roster.zkar.abilityLevels[0], ctx.roster.zkar.rarity);
    return characterStats(actor, ctx.roster[actor])?.damage ?? 0;
}

/** The weapon a kind of attack uses: a melee attack the unit's melee weapon, a ranged one its ranged weapon. */
export function weaponFor(actor: ActorName, kind: AttackKind): Weapon {
    const weapons = weaponsOf(actor);
    const wanted = kind === 'ranged' ? weapons.find((w) => w.range !== undefined) : weapons.find((w) => w.range === undefined);
    return wanted ?? weapons[0];
}

/** The most a parasite can grow: Neurothrope's passive allows 15 at Mythic level 60, and the Norn Crown one more. */
export function parasiteCap(ctx: Context): number {
    const base = ownValue(ctx, 'neurothrope', 'passive', 'buffMaxLevel');
    const crown = relicValue(ctx, 'neurothrope', 'extraDmg') !== undefined ? Number(abilityConstant('NornCrown', 'effectLevel')) : 0;
    return base + crown;
}

export const armorOf = (ctx: Context, enemy: Enemy): number => (enemy.kind === 'boss' ? ctx.armor.boss : ctx.armor.minion);

// ---- who stands where ---------------------------------------------------------------------------------------------------

const here = (state: State, unit: UnitId): boolean => state.units[unit] !== undefined;

const heightOf = (ctx: Context, cells: readonly Cell[]): number => ctx.board.hexAt(cells[0])?.elevation ?? 0;

/** Whether the unit is a Mythic Psyker character: the units Cabal of Sorcerers helps. */
const mythicPsyker = (ctx: Context, unit: ActorName): boolean => unit !== 'zkar' && hasTag(unit, 'psyker') && ctx.roster[unit].rarity === ('Mythic' as Rarity);

export interface AttackSpec {
    actor: ActorName;
    kind: AttackKind;
    /** The main target first; then, for Abaddon's relic, the other enemies it reaches. */
    targets: Enemy[];
    /** Z'kar's start-of-next-round attack: fire that burnt out is gone, and Hunter of Souls adds damage. */
    nextRound?: boolean;
    /** Set off by a bearer's Book of Fate: the Daemon summon's attack gets this extra damage. */
    bookBonus?: number;
    /** Abaddon's second melee attack, from his active. */
    extraAttack?: boolean;
}

export interface AttackDamage {
    groups: HitGroup[];
    /** Damage dealt to the boss (what a plan is scored on). */
    boss: number;
    /** Whether the attack dealt Psychic damage to the boss (it grows the parasite). */
    psychicOnBoss: boolean;
}

/**
 * Work out an attack's damage: the hit groups, each against one enemy, with their flat buffs, modifiers and armor. `state` is the
 * state just before the attack lands. `smite` is the extra enemy a normal ranged psychic attack's smite reaches (it takes part in
 * the parasite and the fire, but its damage isn't scored: how much less than the main hit it is isn't known).
 */
export function attackDamage(ctx: Context, state: State, spec: AttackSpec, smite?: Enemy): AttackDamage {
    const { actor, kind, nextRound = false } = spec;
    const mine = actorCells(state, actor)!;
    const [primary] = spec.targets;
    const groups: HitGroup[] = [];

    const chaos = hasTag(actor, 'chaos');
    const psykerOrSummon = hasTag(actor, 'psyker') || hasTag(actor, 'summon');

    // Attack-level flat buffs, the same on every hit of the attack (the Stalk's depends on the hit, so it's added per group).
    const attackFlat = (target: Enemy, profile: string): FlatBonus[] => {
        const flat: FlatBonus[] = [];
        const abaddon = state.units.abaddon;
        if (chaos && actor !== 'abaddon' && abaddon && distanceBetween([abaddon.cell], mine) <= Number(ownConstant('abaddon', 'passive', 'range'))) {
            const attacks = Math.min(state.abaddonStacks, Number(ownConstant('abaddon', 'passive', 'buffMaxLevel')));
            const amount = Math.min(ownValue(ctx, 'abaddon', 'passive', 'maxDmg'), ownValue(ctx, 'abaddon', 'passive', 'extraDmg') + attacks * ownValue(ctx, 'abaddon', 'passive', 'extraDmg_2'));
            flat.push({ id: 'abaddonPassive', amount });
        }
        const crown = relicValue(ctx, 'neurothrope', 'extraDmg');
        const neuro = state.units.neurothrope;
        if (crown !== undefined && neuro && actor !== 'neurothrope' && psykerOrSummon && state.neuroStacks > 0 && distanceBetween([neuro.cell], mine) <= 2) flat.push({ id: 'nornCrown', amount: crown });
        if (actor === 'neurothrope' && profile === 'Psychic' && target.kind === 'boss' && state.neuroStacks > 0) {
            flat.push({ id: 'neuroparasite', amount: ownValue(ctx, 'neurothrope', 'passive', 'extraDmg') * state.neuroStacks });
        }
        if (spec.bookBonus !== undefined && spec.bookBonus > 0) flat.push({ id: 'bookOfFate', amount: spec.bookBonus });
        if (actor === 'zkar' && nextRound) {
            const psykers = (['ahriman', 'abraxas', 'archimatos', 'neurothrope'] as const).filter((u) => here(state, u) && adjacent(ctx.board, [state.units[u]!.cell], mine)).length;
            if (psykers > 0) flat.push({ id: 'hunterOfSouls', amount: abilityValue('HunterOfSouls', 'extraDmg', ctx.roster.zkar.abilityLevels[0], ctx.roster.zkar.rarity) * psykers });
        }
        return flat;
    };

    const stalkApplies = (target: Enemy, profile: string): boolean => here(state, 'ahriman') && PSYCHIC_OR_FLAME.has(profile) && burning(state, enemyCells(state, target), nextRound);

    // Percentage modifiers: high ground on every hit, Cabal on every hit of an affected unit, the Stalk's on the burning ones.
    const cabal = ((): Modifier | undefined => {
        const level = ctx.roster.zkar.abilityLevels[2];
        if (!state.zkar || level <= 0 || !mythicPsyker(ctx, actor)) return undefined;
        const beside = adjacent(ctx.board, mine, state.zkar.cells) || (['ahriman', 'abraxas', 'archimatos', 'neurothrope'] as const).some((u) => u !== actor && here(state, u) && mythicPsyker(ctx, u) && adjacent(ctx.board, mine, [state.units[u]!.cell]));
        return beside ? { id: 'cabal', multiplier: 1 + abilityValue('CabalOfSorcerers', 'extraDmgPct', level) / 100 } : undefined;
    })();
    const modifiersFor = (target: Enemy, profile: string): Modifier[] => {
        const mods: Modifier[] = [];
        if (heightOf(ctx, mine) > heightOf(ctx, enemyCells(state, target))) mods.push({ id: 'highGround', multiplier: HIGH_GROUND_MULTIPLIER });
        if (stalkApplies(target, profile)) mods.push({ id: 'psychicStalk', multiplier: 1 + ownValue(ctx, 'ahriman', 'passive', 'extraDmgPct') / 100 });
        if (cabal) mods.push(cabal);
        return mods;
    };

    const add = (label: string, target: Enemy, hits: number, profile: string, base: number): void => {
        if (hits <= 0) return;
        const flat = attackFlat(target, profile);
        // Psychic Stalk's flat bonus: Chaos units' affected hits.
        if (chaos && stalkApplies(target, profile)) flat.push({ id: 'psychicStalkFlat', amount: ownValue(ctx, 'ahriman', 'passive', 'extraDmg') });
        const modifiers = modifiersFor(target, profile);
        const armor = armorOf(ctx, target);
        const damage = hits * hitDamage({ damage: base, fixed: flat.reduce((s, f) => s + f.amount, 0), armor, pierce: pierceRatio(profile), modifiers: modifiers.map((m) => m.multiplier) });
        groups.push({ label, target, hits, profile, base, flat, modifiers, armor, damage });
    };

    if (spec.extraAttack) {
        // Drach'nyen's second attack.
        add("Drach'nyen", primary, Number(ownConstant('abaddon', 'active', 'nrOfHits')), String(ownConstant('abaddon', 'active', 'damageProfile')), avg(ownValue(ctx, 'abaddon', 'active', 'minDmg'), ownValue(ctx, 'abaddon', 'active', 'maxDmg')));
    } else if (kind === 'active' && actor === 'ahriman') {
        // Doombolt: its hits (and one for every burning hex, up to nine) are shared evenly among the enemies within range; the boss
        // gets its share rounded down, as the leftover hit goes to a minion in the worst case.
        const range = Number(ownConstant('ahriman', 'active', 'range'));
        const inRange = [{ kind: 'boss' } as Enemy, ...state.minions.map((cell): Enemy => ({ kind: 'minion', cell }))].filter((e) => distanceBetween(mine, enemyCells(state, e)) <= range);
        const fires = Object.keys(state.effects).filter((k) => state.effects[k] === 'fire1' || state.effects[k] === 'fire2').length;
        const total = Math.min(9, Number(ownConstant('ahriman', 'active', 'nrOfHits')) + fires);
        const boss = inRange.find((e) => e.kind === 'boss');
        if (boss) add('Doombolt', boss, Math.floor(total / inRange.length), 'Psychic', avg(ownValue(ctx, 'ahriman', 'active', 'minDmg'), ownValue(ctx, 'ahriman', 'active', 'maxDmg')));
    } else if (kind === 'active' && actor === 'neurothrope') {
        add('Spirit Leech', primary, Number(ownConstant('neurothrope', 'active', 'nrOfHits')), 'Psychic', avg(ownValue(ctx, 'neurothrope', 'active', 'minDmg'), ownValue(ctx, 'neurothrope', 'active', 'maxDmg')));
    } else {
        const weapon = weaponFor(actor, kind);
        const burn = (actor === 'abaddon' || actor === 'archimatos') && hasEffect(state, enemyCells(state, primary), nextRound) ? 1 : 0; // Let the Galaxy Burn
        add(`${weapon.profile} ${kind === 'ranged' ? 'ranged' : 'melee'} attack`, primary, weapon.hits + burn, weapon.profile, baseDamage(ctx, actor));
        // Infernal Pacts: a Chaos unit beside Abraxas adds a Psychic hit (to its ranged attack, and a Daemon's melee).
        const abraxas = state.units.abraxas;
        if (abraxas && actor !== 'abraxas' && chaos && (kind === 'ranged' || (kind === 'melee' && hasTag(actor, 'demon'))) && adjacent(ctx.board, [abraxas.cell], mine)) {
            add('Infernal Pacts bonus hit', primary, Number(ownConstant('abraxas', 'passive', 'nrOfHits')), String(ownConstant('abraxas', 'passive', 'affectedDamageProfile')), avg(ownValue(ctx, 'abraxas', 'passive', 'minDmg'), ownValue(ctx, 'abraxas', 'passive', 'maxDmg')));
        }
        // Talon of Horus: the other enemies beside both the target and Abaddon.
        const talonMin = actor === 'abaddon' && kind === 'melee' ? relicValue(ctx, 'abaddon', 'minDmg') : undefined;
        if (talonMin !== undefined) {
            for (const other of spec.targets.slice(1)) add('Talon of Horus', other, Number(abilityConstant('TalonOfHorus', 'nrOfHits')), String(abilityConstant('TalonOfHorus', 'damageProfile')), avg(talonMin, relicValue(ctx, 'abaddon', 'maxDmg')!));
        }
    }

    const boss = groups.filter((g) => g.target.kind === 'boss').reduce((s, g) => s + g.damage, 0);
    const psychicOnBoss = groups.some((g) => g.target.kind === 'boss' && g.profile === 'Psychic') || (smite?.kind === 'boss' && (kind === 'ranged' || kind === 'active') && weaponFor(actor, 'ranged').profile === 'Psychic');
    return { groups, boss, psychicOnBoss };
}

export { PSYCHIC_OR_FLAME };
