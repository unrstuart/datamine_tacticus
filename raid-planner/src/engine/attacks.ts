import { Cell, cellKey } from '../core/hex';
import { MAX_ABADDON_STACKS, UnitId } from '../core/setup';
import { HitGroup, armorOf, attackDamage, parasiteCap, relicValue } from './calc';
import {
    Context,
    Enemy,
    State,
    actorCells,
    adjacent,
    distanceBetween,
    enemyCells,
    listEnemies,
    sameEnemy,
} from './state';
import { ATTACKS, ActorName, AttackKind, attackDef } from './units';

// Attacks: which ones a character may make, and what happens when one is made: the damage it does (see calc.ts for what each hit
// is worth), and its effects on the board: minions die, fire is lit, the parasite grows, Abaddon's attack count grows. Z'kar
// attacks too when his triggers fire. The rules are in docs/rules.md.

/** Why an attack happened: made by a character, or one of Z'kar's attacks and what set it off. */
export type Trigger = 'deploy' | 'archimatos' | 'abraxas' | 'nextRound';

export interface AttackReport {
    actor: ActorName;
    kind: AttackKind;
    trigger?: Trigger;
    /** The enemies it hit: the target, anything Abaddon's Talon of Horus reached too. */
    targets: Enemy[];
    /** The extra enemy a normal ranged psychic attack's smite hit, if any. */
    smite?: Enemy;
    /** Every group of hits, with the flat buffs and modifiers on it. */
    groups: HitGroup[];
    /** Damage to the boss: what a plan is scored on. */
    damage: number;
    /** The same as `damage`: the report's worth to the plan. */
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
 * enemy beside him. Abaddon's Talon of Horus (when he has it) is part of his melee attack, and once his active is on, that
 * attack is followed by a second melee attack on an enemy still adjacent (the minions the first attack killed are gone).
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
            const reachable = listEnemies(state).filter((e) => distanceBetween(cells, enemyCells(state, e)) <= def.range);
            // Doombolt hits every enemy in range, so which one is named changes nothing: offer one.
            for (const target of unit === 'ahriman' ? reachable.slice(0, 1) : reachable) choices.push({ unit, kind: def.kind, target });
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

/** The enemies Abaddon's melee attack hits: its target, and with the Talon of Horus equipped up to two more beside both him and it. */
function relicTargets(ctx: Context, state: State, attacker: readonly Cell[], primary: Enemy): Enemy[] {
    if (relicValue(ctx, 'abaddon', 'minDmg') === undefined) return [primary];
    const both = unitAdjacentEnemies(ctx, state, attacker).filter((e) => !sameEnemy(e, primary) && adjacent(ctx.board, enemyCells(state, primary), enemyCells(state, e)));
    return [primary, ...both.slice(0, 2)];
}

/** The parasite after an attack: +1 for a psychic attack that hit the boss on an infected boss; Neurothrope's hit infects. */
function stackAfter(stacks: number, actor: ActorName, psychicOnBoss: boolean, cap: number): number {
    if (!psychicOnBoss || stacks >= cap) return stacks;
    if (stacks === 0 && actor !== 'neurothrope') return stacks;
    return stacks + 1;
}

const fireTrigger = (actor: ActorName, lightsFire: boolean): boolean => lightsFire && (actor === 'ahriman' || actor === 'abraxas');

interface ResolveOptions {
    trigger?: Trigger;
    /** Abaddon's second melee attack. */
    extraAttack?: boolean;
    /** The extra damage Book of Fate gives the Daemon summon's attack that the bearer's attack set off. */
    bookBonus?: number;
}

/**
 * Resolve one attack on `targets` (the first is the main target): work out its damage, then apply what it does. Minions it hit
 * die; Ahriman's and Abraxas's flame attacks (and Ahriman's ranged smite) set the hit hexes on fire for two rounds; the parasite
 * grows; Abaddon's attack count grows, one per enemy he hit.
 */
function resolveAttack(ctx: Context, state: State, actor: ActorName, kind: AttackKind, targets: Enemy[], options: ResolveOptions = {}): { state: State; report: AttackReport } {
    const def = attackDef(actor, kind);
    const mine = actorCells(state, actor)!;
    const smite = def.smite && !options.extraAttack ? smiteTarget(ctx, state, targets[0]) : undefined;

    const damage = attackDamage(ctx, state, { actor, kind, targets, nextRound: options.trigger === 'nextRound', bookBonus: options.bookBonus, extraAttack: options.extraAttack }, smite);
    const stacks = stackAfter(state.neuroStacks, actor, damage.psychicOnBoss, parasiteCap(ctx));
    let abaddonStacks = state.abaddonStacks;
    if (actor === 'abaddon') abaddonStacks = Math.min(MAX_ABADDON_STACKS, abaddonStacks + targets.length);

    const next: State = { ...state, neuroStacks: stacks, abaddonStacks, effects: { ...state.effects }, minions: [...state.minions] };
    // Neurothrope next to an enemy at the moment he attacks.
    if (actor === 'neurothrope' && unitAdjacentEnemies(ctx, state, mine).length > 0) next.neuroAdjacent = true;
    // Whoever the attack hit and killed: the characters kill a minion in one attack (and so does Z'kar). Smite doesn't.
    for (const e of targets) if (e.kind === 'minion') next.minions = next.minions.filter((m) => cellKey(m) !== cellKey(e.cell));
    if (fireTrigger(actor, def.lightsFire) && !options.extraAttack) {
        for (const e of [...targets, ...(smite && actor === 'ahriman' ? [smite] : [])]) for (const c of enemyCells(state, e)) next.effects[cellKey(c)] = 'fire2';
    }
    const report: AttackReport = {
        actor,
        kind,
        trigger: options.trigger,
        targets,
        smite,
        groups: damage.groups,
        damage: damage.boss,
        score: damage.boss,
        ...(options.extraAttack ? { extra: true } : {}),
    };
    return { state: next, report };
}

/**
 * Make an attack: resolve it (see resolveAttack), end the attacker's turn, and then, for Abaddon with his active on, make
 * his second melee attack on `extra`. If Archimatos or Abraxas attacked next to Z'kar with a Book of Fate, Z'kar attacks too.
 */
export function performAttack(ctx: Context, state: State, actor: ActorName, kind: AttackKind, primary: Enemy, trigger?: Trigger, extra?: Enemy, bookBonus?: number): { state: State; reports: AttackReport[] } {
    const def = attackDef(actor, kind);
    const mine = actorCells(state, actor)!;
    const targets = def.relic ? relicTargets(ctx, state, mine, primary) : [primary];
    const first = resolveAttack(ctx, state, actor, kind, targets, { trigger, bookBonus });
    let next = first.state;
    const reports: AttackReport[] = [first.report];

    if (actor !== 'zkar') {
        const u = next.units[actor as UnitId]!;
        next = { ...next, units: { ...next.units, [actor]: { ...u, attacked: true } } };
        if (kind === 'active') next = actor === 'ahriman' ? { ...next, ahrimanActiveAvailable: false } : { ...next, neuroActiveAvailable: false };
    }
    if (actor === 'abaddon' && kind === 'melee' && extra && next.abaddonExtra === 'on') {
        const second = resolveAttack(ctx, next, actor, kind, [extra], { trigger, extraAttack: true });
        next = second.state;
        reports.push(second.report);
    }

    // A bearer of the Book of Fate (Archimatos or Abraxas) attacking next to Z'kar sets him off, with the Book's extra damage.
    if ((actor === 'archimatos' || actor === 'abraxas') && next.zkar && !next.zkar.triggered[actor] && adjacent(ctx.board, next.zkar.cells, mine)) {
        const book = relicValue(ctx, actor, 'extraDmg');
        if (book !== undefined) {
            next = { ...next, zkar: { ...next.zkar, triggered: { ...next.zkar.triggered, [actor]: true } } };
            const more = zkarAttack(ctx, next, actor, book);
            next = more.state;
            reports.push(...more.reports);
        }
    }
    return { state: next, reports };
}

/**
 * One of Z'kar's attacks. He melees if an enemy is next to him and otherwise shoots one within range; his target is not
 * his player's choice, so for scoring he is assumed to hit a minion if one is in reach (killing it) and the boss only
 * when it is the only enemy. With nothing in reach the trigger is spent for nothing.
 */
export function zkarAttack(ctx: Context, state: State, trigger: Trigger, bookBonus?: number): { state: State; reports: AttackReport[] } {
    const cells = state.zkar!.cells;
    const adjacentEnemies = unitAdjacentEnemies(ctx, state, cells);
    let kind: AttackKind = 'melee';
    let candidates = adjacentEnemies;
    if (candidates.length === 0) {
        kind = 'ranged';
        candidates = listEnemies(state).filter((e) => distanceBetween(cells, enemyCells(state, e)) <= attackDef('zkar', 'ranged').range);
    }
    const target = firstMinion(candidates) ?? candidates[0];
    if (!target) return { state, reports: [{ actor: 'zkar', kind: 'melee', trigger, targets: [], groups: [], damage: 0, score: 0, note: 'no enemy in reach' }] };
    return performAttack(ctx, state, 'zkar', kind, target, trigger, undefined, bookBonus);
}

export { armorOf };
