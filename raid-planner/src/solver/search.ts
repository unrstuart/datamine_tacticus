import { cellKey } from '../core/hex';
import { MAX_ABADDON_STACKS } from '../core/setup';
import { AttackReport, legalAttacks } from '../engine/attacks';
import { legalMoves } from '../engine/movement';
import { Action, PlanResult, applyAction, finishRound } from '../engine/plan';
import { Context, State, initialState } from '../engine/state';
import { allDone, legalActions, relevantMove } from './actions';
import { Analysis, analyse, makeStatics } from './analysis';
import { COUNTER, Counters } from './counters';
import { DEFAULT_OPTIONS, SolverOptions } from './options';
import { StateTable } from './table';

// Depth-first search of the sequences of actions, narrowed by the rules in SolverOptions. Memory is the depth of the
// search plus the plans it keeps: nothing is remembered about states already seen, so it cannot run out of memory the way
// a table of visited states would. Progress goes into the shared counters as it happens (see counters.ts): sequences
// planned (it keeps growing as the search finds more) and searched, the best runs found so far, and the branches cut.

export interface StoredPlan {
    actions: Action[];
    /** The damage to the boss, less any penalties the setup puts on the plan. */
    total: number;
    /** Every attack along the way, then Z'kar's start-of-next-round attack. */
    reports: AttackReport[];
    penalties: PlanResult['finish']['penalties'];
    /** How many units end the round standing on an undesirable hex. */
    undesirable: number;
    signature: string;
}

export interface SearchOptions {
    /** What the search may skip (default: all of it; see SolverOptions). */
    rules?: SolverOptions;
    /** How many plans to keep: the best by damage (default 10). */
    top?: number;
    /** Called now and then with the plans so far, when they have changed. */
    onBest?: (plans: StoredPlan[]) => void;
    /** Extra reason to stop, checked along with the counters' cancel flag. */
    shouldStop?: () => boolean;
    /** Work done between checks of the clock, the cancel flag and the counters. */
    batch?: number;
}

export interface SearchResult {
    bestScore: number | undefined;
    plans: StoredPlan[];
    stopped: boolean;
}

const reportKey = (r: AttackReport): string => `${r.actor}:${r.kind}${r.extra ? '+' : ''}${r.trigger ? `@${r.trigger}` : ''}=${Math.round(r.damage)}`;

/**
 * Two plans are the same outcome when every attack does the same damage (in any order) and everyone ends on the same hexes;
 * then only one is kept.
 */
export function signatureOf(state: State, reports: readonly AttackReport[]): string {
    const units = Object.entries(state.units)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, u]) => `${id}@${cellKey(u!.cell)}`);
    const zkar = state.zkar ? state.zkar.cells.map(cellKey).sort().join('/') : '-';
    return `${units.join(' ')} z:${zkar} | ${reports.map(reportKey).sort().join(' ')}`;
}

const EPS = 1e-6;

/** Whether `a` ranks above `b`: more damage; at equal damage, fewer units on undesirable hexes. (Equal on both: the earlier one wins.) */
const better = (a: { total: number; undesirable: number }, b: { total: number; undesirable: number }): boolean => a.total > b.total + EPS || (Math.abs(a.total - b.total) <= EPS && a.undesirable < b.undesirable);

/**
 * Put `plan` into the list of the best `top` plans, best first, or say it doesn't belong: more damage ranks higher; at equal
 * damage, a plan with fewer units standing on undesirable hexes; at equal on both, whichever was found first. The same outcome
 * (see signatureOf) is never listed twice. Returns the new list, or undefined when the plan didn't make it.
 */
export function insertPlan(plans: readonly StoredPlan[], plan: StoredPlan, top: number): StoredPlan[] | undefined {
    if (plans.some((p) => p.signature === plan.signature)) return undefined;
    let at = plans.findIndex((p) => better(plan, p));
    if (at < 0) at = plans.length;
    if (at >= top) return undefined;
    return [...plans.slice(0, at), plan, ...plans.slice(at)].slice(0, top);
}

// Try the attacks first (they score now), then deployments and Abaddon's active, then moves, then passing.
const ORDER: Record<Action['type'], number> = { attack: 0, deploy: 1, abaddonActive: 1, move: 2, pass: 3 };

export function search(ctx: Context, counters: Counters, options: SearchOptions = {}): SearchResult {
    const rules = options.rules ?? DEFAULT_OPTIONS;
    const top = options.top ?? 10;
    // How many sequences go by between publishing the counters (and checking the clock and the cancel flag).
    const batch = options.batch ?? 256;
    const start = initialState(ctx.setup);
    const statics = makeStatics(ctx, start);
    const table = rules.tableBits > 0 ? new StateTable(rules.tableBits) : undefined;

    let planned = 1; // the empty plan
    let searched = 0;
    let complete = 0;
    let pruned = 0;
    let sinceCheck = 0;
    let stopped = false;
    let changed = false;
    let lastPost = Date.now();

    // The best plans so far, best first: more damage, then fewer units on undesirable hexes, then whichever was found first.
    let plans: StoredPlan[] = [];

    const path: Action[] = [];
    const reports: AttackReport[] = [];

    const flush = () => {
        const add = (i: number, n: number) => n && Atomics.add(counters, i, BigInt(n));
        add(COUNTER.planned, planned);
        add(COUNTER.searched, searched);
        add(COUNTER.complete, complete);
        add(COUNTER.pruned, pruned);
        planned = searched = complete = pruned = 0;
    };
    const checkIn = () => {
        flush();
        if (Atomics.load(counters, COUNTER.cancel) !== 0n || options.shouldStop?.()) stopped = true;
        if (changed && options.onBest && Date.now() - lastPost > 250) {
            options.onBest(plans);
            changed = false;
            lastPost = Date.now();
        }
    };
    /** One sequence has been searched. */
    const done = () => {
        searched++;
        if (++sinceCheck >= batch) {
            sinceCheck = 0;
            checkIn();
        }
    };

    const evaluate = (state: State, score: number) => {
        complete++;
        const finish = finishRound(ctx, state);
        const total = score + finish.reports.reduce((s, r) => s + r.score, 0) - finish.penalties.reduce((s, p) => s + p.points, 0);
        const bad = new Set(ctx.setup.undesirable);
        const undesirable = Object.values(state.units).filter((u) => bad.has(cellKey(u!.cell))).length + (state.zkar?.cells.some((c) => bad.has(cellKey(c))) ? 1 : 0);
        // Quick out for a plan that cannot make the list, before the work of describing it.
        const worst = plans[plans.length - 1];
        if (plans.length >= top && !better({ total, undesirable }, worst)) return;
        const signature = signatureOf(finish.state, [...reports, ...finish.reports]);
        const updated = insertPlan(plans, { actions: [...path], total, reports: [...reports, ...finish.reports], penalties: finish.penalties, undesirable, signature }, top);
        if (!updated) return;
        plans = updated;
        Atomics.store(counters, COUNTER.bestScore, BigInt(Math.round(plans[0].total)));
        Atomics.store(counters, COUNTER.bestRuns, BigInt(plans.length));
        changed = true;
    };

    /** Apply `action`, carry on from there with `next`, and undo. Does nothing if the action isn't legal. */
    const step = (state: State, score: number, action: Action, next: (s: State, score: number) => void) => {
        const result = applyAction(ctx, state, action);
        if (!result) return;
        path.push(action);
        const before = reports.length;
        for (const r of result.reports) reports.push(r);
        next(result.state, score + result.reports.reduce((s, r) => s + r.score, 0));
        reports.length = before;
        path.pop();
    };

    /** Run `each` on every item, counting each as a planned and then searched sequence. */
    const each = <T>(items: readonly T[], run: (item: T) => void) => {
        planned += items.length;
        for (const item of items) {
            if (stopped) return;
            run(item);
            done();
        }
    };

    const visit = (state: State, score: number): void => {
        // Reached before by another order of the same actions, at least as well: nothing new can come of it.
        if (table?.seen(state, score)) {
            pruned++;
            return;
        }
        const an = analyse(ctx, state);
        const actions = legalActions(ctx, state, rules, statics, an);
        if (allDone(state)) evaluate(state, score);

        // Apply each action first, so the ones that score most go first.
        const children = actions.flatMap((action) => {
            const result = applyAction(ctx, state, action);
            return result ? [{ action, result, gain: result.reports.reduce((s, r) => s + r.score, 0) }] : [];
        });
        children.sort((a, b) => b.gain - a.gain || ORDER[a.action.type] - ORDER[b.action.type]);
        each(children, (child) => {
            path.push(child.action);
            const before = reports.length;
            for (const r of child.result.reports) reports.push(r);
            visit(child.result.state, score + child.gain);
            reports.length = before;
            path.pop();
        });
    };

    // ---- Abaddon first -----------------------------------------------------------------------------------------------

    const abaddonMoves = (state: State, an: Analysis): Action[] =>
        (an.moves.abaddon ?? []).filter((to) => !rules.relevantMovesOnly || relevantMove(ctx, state, an, statics, 'abaddon', to)).map((to) => ({ type: 'move', unit: 'abaddon', to }));

    const attackWith = (state: State, score: number, kind: 'melee' | 'ranged') => {
        const choices = legalAttacks(ctx, state, 'abaddon').filter((c) => c.kind === kind);
        each(choices, (c) => step(state, score, { type: 'attack', unit: 'abaddon', kind: c.kind, target: c.target, ...(c.extra ? { extra: c.extra } : {}) }, visit));
    };

    const afterAbaddonMoved = (state: State, score: number) => {
        const choices = legalAttacks(ctx, state, 'abaddon');
        if (choices.some((c) => c.kind === 'melee')) {
            // In melee range: he attacks. His active only ever adds, so when it is available he uses it first.
            if (state.abaddonExtra === 'available') each([{ type: 'abaddonActive' } as Action], (a) => step(state, score, a, (s, sc) => attackWith(s, sc, 'melee')));
            else attackWith(state, score, 'melee');
        } else if (choices.some((c) => c.kind === 'ranged')) {
            // Only at range: first he shoots alone, then Abraxas moves next to him first and he shoots.
            attackWith(state, score, 'ranged');
            const abraxas = state.units.abraxas;
            const abaddon = state.units.abaddon!;
            if (abraxas && !abraxas.attacked && !abraxas.moved) {
                const beside = legalMoves(ctx.board, state, 'abraxas').filter((to) => ctx.board.connected(to, abaddon.cell));
                each(beside, (to) => step(state, score, { type: 'move', unit: 'abraxas', to }, (s, sc) => attackWith(s, sc, 'ranged')));
            }
        } else {
            each([{ type: 'pass', unit: 'abaddon' } as Action], (a) => step(state, score, a, visit));
        }
    };

    const abaddonFirst = (state: State, score: number) => {
        const moves = abaddonMoves(state, analyse(ctx, state));
        // Staying put is the first option, then every move.
        planned += 1;
        afterAbaddonMoved(state, score);
        done();
        each(moves, (m) => step(state, score, m, afterAbaddonMoved));
    };

    const a = start.units.abaddon;
    if (rules.abaddonFirst && a && !a.attacked && start.abaddonStacks < MAX_ABADDON_STACKS) abaddonFirst(start, 0);
    else visit(start, 0);

    if (!stopped) searched++; // the empty plan, now that everything under it is done
    flush();
    if (options.onBest && changed) options.onBest(plans);
    Atomics.store(counters, COUNTER.status, stopped ? 2n : 1n);
    return { bestScore: plans[0]?.total, plans, stopped };
}
