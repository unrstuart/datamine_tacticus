import { Cell, cellKey } from '../core/hex';
import { MAX_ABADDON_STACKS, MAX_NEURO_STACKS, UnitId } from '../core/setup';
import {
    Context,
    Enemy,
    State,
    actorCells,
    adjacent,
    burning,
    distanceBetween,
    enemyCells,
    hasEffect,
    listEnemies,
    sameEnemy,
} from './state';
import { ATTACKS, ActorName, AttackDef, AttackKind, attackDef, hasTag, psychicOrFlame } from './units';

// Attacks: which ones a character may make, and what happens (and which buffs apply) when one is made. The rules are in
// docs/rules.md; the comments here point at the parts that are easy to get wrong.

export type BuffId = 'abaddon' | 'ahriman' | 'neurothrope' | 'abraxas' | 'zkar' | 'highGround' | 'hexEffect' | 'neuroStack' | 'abaddonStack';

export interface Buff {
    id: BuffId;
    /** What it is worth: 1, or one for every stack added (the parasite on the boss, Abaddon's passive). */
    points: number;
    note?: string;
}

/** Why an attack happened: made by a character, or one of Z'kar's attacks and what set it off. */
export type Trigger = 'deploy' | 'archimatos' | 'abraxas' | 'nextRound';

export interface AttackReport {
    actor: ActorName;
    kind: AttackKind;
    trigger?: Trigger;
    /** The enemies it hit: the target, anything Abaddon's relic reached too. */
    targets: Enemy[];
    /** The extra enemy a normal ranged psychic attack's smite hit, if any. */
    smite?: Enemy;
    buffs: Buff[];
    score: number;
    /** Abaddon's second melee attack, from his active. */
    extra?: boolean;
    /** A Z'kar trigger with nothing in reach. */
    note?: string;
}

export interface AttackChoice {
    unit: UnitId;
    kind: AttackKind;
    target: Enemy;
    /** Abaddon's second melee attack (once his active is on): who it hits, when anyone is left to hit. */
    extra?: Enemy;
}

const unitAdjacentEnemies = (ctx: Context, state: State, cells: readonly Cell[]): Enemy[] =>
    listEnemies(state).filter((e) => adjacent(ctx.board, cells, enemyCells(state, e)));

/**
 * The attacks `unit` may make now. A unit next to an enemy must attack it in melee (its choice of which); otherwise it
 * attacks at range. The two actives (ranged) are extra options when available; Neurothrope's can hit the boss even with an
 * enemy beside him. Abaddon's relic is part of his melee attack, and once his active is on, that attack is followed by a
 * second melee attack on an enemy still adjacent (the minions the first attack killed are gone).
 */
export function legalAttacks(ctx: Context, state: State, unit: UnitId): AttackChoice[] {
    const u = state.units[unit];
    if (!u || u.attacked) return [];
    const cells = [u.cell];
    const near = unitAdjacentEnemies(ctx, state, cells);
    const choices: AttackChoice[] = [];
    for (const def of ATTACKS[unit]) {
        if (def.kind === 'active') {
            const available = unit === 'ahriman' ? state.ahrimanActiveAvailable : state.neuroActiveAvailable;
            if (!available) continue;
        }
        if (def.melee) {
            if (near.length === 0) continue;
            for (const target of near) {
                if (unit === 'abaddon' && state.abaddonExtra === 'on') {
                    const victims = relicTargets(ctx, state, cells, target);
                    const left = near.filter((e) => e.kind === 'boss' || !victims.some((v) => sameEnemy(v, e)));
                    if (left.length > 0) {
                        for (const extra of left) choices.push({ unit, kind: def.kind, target, extra });
                        continue;
                    }
                }
                choices.push({ unit, kind: def.kind, target });
            }
        } else if (def.kind === 'active') {
            for (const target of listEnemies(state)) if (distanceBetween(cells, enemyCells(state, target)) <= def.range) choices.push({ unit, kind: def.kind, target });
        } else if (near.length === 0) {
            for (const target of listEnemies(state)) if (distanceBetween(cells, enemyCells(state, target)) <= def.range) choices.push({ unit, kind: def.kind, target });
        }
    }
    return choices;
}

const firstMinion = (enemies: Enemy[]): Enemy | undefined => enemies.find((e) => e.kind === 'minion');

/**
 * The enemy a normal ranged psychic attack's smite hits: one other enemy adjacent to the primary target. It is random in
 * the game; here it is the conservative case, a minion whenever one is there, the boss only when it is the only choice.
 */
function smiteTarget(ctx: Context, state: State, primary: Enemy): Enemy | undefined {
    const others = unitAdjacentEnemies(ctx, state, enemyCells(state, primary)).filter((e) => !sameEnemy(e, primary));
    return firstMinion(others) ?? others[0];
}

/** Abaddon's relic hits its target and up to two more enemies adjacent to both him and that target. */
function relicTargets(ctx: Context, state: State, attacker: readonly Cell[], primary: Enemy): Enemy[] {
    const both = unitAdjacentEnemies(ctx, state, attacker).filter((e) => !sameEnemy(e, primary) && adjacent(ctx.board, enemyCells(state, primary), enemyCells(state, e)));
    return [primary, ...both.slice(0, 2)];
}

/** What a single attack scores, given the state just before it lands. `nextRound` is Z'kar's start-of-next-round attack. */
function buffsFor(ctx: Context, state: State, actor: ActorName, def: AttackDef, targets: Enemy[], smite: Enemy | undefined, nextRound: boolean) {
    const { board } = ctx;
    const mine = actorCells(state, actor)!;
    const primaryCells = enemyCells(state, targets[0]);
    const hitCells = [...targets, ...(smite ? [smite] : [])].flatMap((e) => enemyCells(state, e));
    const buffs: Buff[] = [];
    const add = (id: BuffId, points = 1, note?: string) => buffs.push({ id, points, note });

    const near = (other: ActorName, range: number): boolean => {
        const cells = actorCells(state, other);
        return cells !== undefined && other !== actor && distanceBetween(cells, mine) <= range;
    };
    const touching = (other: ActorName): boolean => {
        const cells = actorCells(state, other);
        return cells !== undefined && other !== actor && adjacent(board, cells, mine);
    };

    // Abraxas adds a psychic hit to normal ranged attacks of adjacent chaos units, and to every normal attack of an
    // adjacent chaos demon (Z'kar). That makes an Abaddon bolter shot psychic: it can then stack the parasite and take
    // Ahriman's bonus.
    const abraxasBonus = actor !== 'abraxas' && touching('abraxas') && hasTag(actor, 'chaos') && !def.ability && (def.kind === 'ranged' || hasTag(actor, 'demon'));
    const psychicHit = def.damage === 'psychic' || abraxasBonus;
    const psychicFlameHit = psychicOrFlame(def.damage) || abraxasBonus;

    if (actor !== 'abaddon' && hasTag(actor, 'chaos') && near('abaddon', 2)) add('abaddon');
    if (psychicFlameHit && actorCells(state, 'ahriman') && burning(state, hitCells, nextRound)) add('ahriman');
    if (actor !== 'neurothrope' && (hasTag(actor, 'psyker') || hasTag(actor, 'summon')) && near('neurothrope', 2)) add('neurothrope');
    if (abraxasBonus) add('abraxas', 1, 'extra psychic hit');
    if (state.zkar && hasTag(actor, 'psyker')) {
        const psykers: ActorName[] = ['ahriman', 'abraxas', 'archimatos', 'neurothrope'];
        const nextToPsyker = (actor === 'zkar' ? psykers : [...psykers, 'zkar' as const]).some((p) => touching(p));
        if (nextToPsyker) add('zkar');
    }
    const height = (cells: readonly Cell[]) => board.hexAt(cells[0])?.elevation ?? 0;
    if (height(mine) > height(primaryCells)) add('highGround');
    if ((actor === 'abaddon' || actor === 'archimatos') && hasEffect(state, primaryCells, nextRound)) add('hexEffect');
    return { buffs, psychicHit };
}

/** The parasite after an attack: +1 for a psychic attack that hit the boss on an infected boss; Neurothrope's hit infects. */
function stackAfter(stacks: number, actor: ActorName, psychicHit: boolean, hitBoss: boolean): number {
    if (!psychicHit || !hitBoss || stacks >= MAX_NEURO_STACKS) return stacks;
    if (stacks === 0 && actor !== 'neurothrope') return stacks;
    return stacks + 1;
}

const fireTrigger = (actor: ActorName, def: AttackDef): boolean => def.lightsFire && (actor === 'ahriman' || actor === 'abraxas');

/**
 * Resolve one attack on `targets` (the first is the main target): score its buffs, then apply what it does. Minions it
 * hit die; Ahriman's and Abraxas's flame attacks (and Ahriman's ranged smite) set the hit hexes on fire for two rounds;
 * the parasite grows; Abaddon's stacks grow, one per enemy he hit.
 */
function resolveAttack(ctx: Context, state: State, actor: ActorName, def: AttackDef, targets: Enemy[], trigger: Trigger | undefined, extra = false): { state: State; report: AttackReport } {
    const nextRound = trigger === 'nextRound';
    const mine = actorCells(state, actor)!;
    const smite = def.smite ? smiteTarget(ctx, state, targets[0]) : undefined;

    const { buffs, psychicHit } = buffsFor(ctx, state, actor, def, targets, smite, nextRound);
    const hitBoss = [...targets, ...(smite ? [smite] : [])].some((e) => e.kind === 'boss');
    const stacks = stackAfter(state.neuroStacks, actor, psychicHit, hitBoss);
    if (stacks > state.neuroStacks) buffs.push({ id: 'neuroStack', points: stacks - state.neuroStacks, note: state.neuroStacks === 0 ? 'infects the boss' : `${stacks} stacks` });
    let abaddonStacks = state.abaddonStacks;
    if (actor === 'abaddon') {
        const added = Math.max(0, Math.min(targets.length, MAX_ABADDON_STACKS - abaddonStacks));
        if (added > 0) buffs.push({ id: 'abaddonStack', points: added, note: `${abaddonStacks + added} stacks` });
        abaddonStacks += added;
    }

    const next: State = { ...state, neuroStacks: stacks, abaddonStacks, effects: { ...state.effects }, minions: [...state.minions] };
    // Neurothrope next to an enemy at the moment he attacks.
    if (actor === 'neurothrope' && unitAdjacentEnemies(ctx, state, mine).length > 0) next.neuroAdjacent = true;
    // Whoever the attack hit and killed: the characters kill a minion in one attack (and so does Z'kar). Smite doesn't.
    for (const e of targets) if (e.kind === 'minion') next.minions = next.minions.filter((m) => cellKey(m) !== cellKey(e.cell));
    if (fireTrigger(actor, def)) {
        for (const e of [...targets, ...(smite && actor === 'ahriman' ? [smite] : [])]) for (const c of enemyCells(state, e)) next.effects[cellKey(c)] = 'fire2';
    }
    const report: AttackReport = { actor, kind: def.kind, trigger, targets, smite, buffs, score: buffs.reduce((s, b) => s + b.points, 0), ...(extra ? { extra: true } : {}) };
    return { state: next, report };
}

/**
 * Make an attack: resolve it (see resolveAttack), end the attacker's turn, and then, for Abaddon with his active on, make
 * his second melee attack on `extra`. If Archimatos or Abraxas attacked next to Z'kar, Z'kar attacks too.
 */
export function performAttack(ctx: Context, state: State, actor: ActorName, kind: AttackKind, primary: Enemy, trigger?: Trigger, extra?: Enemy): { state: State; reports: AttackReport[] } {
    const def = attackDef(actor, kind);
    const mine = actorCells(state, actor)!;
    const targets = def.relic ? relicTargets(ctx, state, mine, primary) : [primary];
    const first = resolveAttack(ctx, state, actor, def, targets, trigger);
    let next = first.state;
    const reports: AttackReport[] = [first.report];

    if (actor !== 'zkar') {
        const u = next.units[actor as UnitId]!;
        next = { ...next, units: { ...next.units, [actor]: { ...u, attacked: true } } };
        if (kind === 'active') next = actor === 'ahriman' ? { ...next, ahrimanActiveAvailable: false } : { ...next, neuroActiveAvailable: false };
    }
    if (actor === 'abaddon' && kind === 'melee' && extra && next.abaddonExtra === 'on') {
        const second = resolveAttack(ctx, next, actor, { ...def, relic: false }, [extra], trigger, true);
        next = second.state;
        reports.push(second.report);
    }

    // Archimatos and Abraxas attacking next to Z'kar make him attack once each.
    if ((actor === 'archimatos' || actor === 'abraxas') && next.zkar && !next.zkar.triggered[actor] && adjacent(ctx.board, next.zkar.cells, mine)) {
        next = { ...next, zkar: { ...next.zkar, triggered: { ...next.zkar.triggered, [actor]: true } } };
        const more = zkarAttack(ctx, next, actor);
        next = more.state;
        reports.push(...more.reports);
    }
    return { state: next, reports };
}

/**
 * One of Z'kar's attacks. He melees if an enemy is next to him and otherwise shoots one within range; his target is not
 * his player's choice, so for scoring he is assumed to hit a minion if one is in reach (killing it) and the boss only
 * when it is the only enemy. With nothing in reach the trigger is spent for nothing.
 */
export function zkarAttack(ctx: Context, state: State, trigger: Trigger): { state: State; reports: AttackReport[] } {
    const cells = state.zkar!.cells;
    const adjacentEnemies = unitAdjacentEnemies(ctx, state, cells);
    let kind: AttackKind = 'melee';
    let candidates = adjacentEnemies;
    if (candidates.length === 0) {
        kind = 'ranged';
        candidates = listEnemies(state).filter((e) => distanceBetween(cells, enemyCells(state, e)) <= attackDef('zkar', 'ranged').range);
    }
    const target = firstMinion(candidates) ?? candidates[0];
    if (!target) return { state, reports: [{ actor: 'zkar', kind: 'melee', trigger, targets: [], buffs: [], score: 0, note: 'no enemy in reach' }] };
    return performAttack(ctx, state, 'zkar', kind, target, trigger);
}

export { MAX_NEURO_STACKS };
