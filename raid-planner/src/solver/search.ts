import { Action, PlanResult, applyAction, finishRound } from '../engine/plan';
import { AttackReport } from '../engine/attacks';
import { Context, State, initialState } from '../engine/state';
import { cellKey } from '../core/hex';
import { allDone, legalActions } from './actions';
import { COUNTER, Counters } from './counters';

// Exhaustive search of every sequence of actions, with no pruning and no shortcuts: each state is expanded into every
// action that can follow it, depth first. Progress goes into the shared counters as it happens (see counters.ts), so the
// page can show how many sequences have been planned (which grows as the search discovers more) and how many searched.

export interface StoredPlan {
    actions: Action[];
    total: number;
    /** Every attack's buffs along the way, then Z'kar's start-of-next-round attack. */
    reports: AttackReport[];
    penalties: PlanResult['finish']['penalties'];
    signature: string;
}

export interface SearchOptions {
    /** How many tied-best plans to keep the full detail of (they are all counted). */
    maxStored?: number;
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

const reportKey = (r: AttackReport): string =>
    `${r.actor}:${r.kind}${r.extra ? '+' : ''}${r.trigger ? `@${r.trigger}` : ''}[${r.buffs.map((b) => `${b.id}${b.points}`).join(',')}]`;

/**
 * Two plans are the same outcome when they apply the same buffs (attack by attack, in any order) and leave everyone on
 * the same hexes; then only one is kept.
 */
export function signatureOf(state: State, reports: readonly AttackReport[]): string {
    const units = Object.entries(state.units)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, u]) => `${id}@${cellKey(u!.cell)}`);
    const zkar = state.zkar ? state.zkar.cells.map(cellKey).sort().join('/') : '-';
    return `${units.join(' ')} z:${zkar} | ${reports.map(reportKey).sort().join(' ')}`;
}

export function search(ctx: Context, counters: Counters, options: SearchOptions = {}): SearchResult {
    const maxStored = options.maxStored ?? 500;
    // How many sequences go by between publishing the counters (and checking the clock and the cancel flag).
    const batch = options.batch ?? 256;
    const start = initialState(ctx.setup);

    let planned = 1; // the empty plan
    let searched = 0;
    let complete = 0;
    let sinceCheck = 0;
    let stopped = false;
    let changed = false;
    let lastPost = Date.now();

    let bestScore: number | undefined;
    let plans: StoredPlan[] = [];
    let seen = new Set<string>();
    let bestRuns = 0;

    const path: Action[] = [];
    const reports: AttackReport[] = [];

    const flush = () => {
        if (planned) Atomics.add(counters, COUNTER.planned, BigInt(planned));
        if (searched) Atomics.add(counters, COUNTER.searched, BigInt(searched));
        if (complete) Atomics.add(counters, COUNTER.complete, BigInt(complete));
        planned = searched = complete = 0;
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

    const evaluate = (state: State, score: number) => {
        complete++;
        const done = finishRound(ctx, state);
        const total = score + done.reports.reduce((s, r) => s + r.score, 0) - done.penalties.reduce((s, p) => s + p.points, 0);
        if (bestScore !== undefined && total < bestScore) return;
        const all = [...reports, ...done.reports];
        const signature = signatureOf(done.state, all);
        if (bestScore === undefined || total > bestScore) {
            bestScore = total;
            plans = [];
            seen = new Set();
            bestRuns = 0;
            Atomics.store(counters, COUNTER.bestScore, BigInt(total));
        }
        if (seen.has(signature)) return;
        seen.add(signature);
        bestRuns++;
        Atomics.store(counters, COUNTER.bestRuns, BigInt(bestRuns));
        if (plans.length < maxStored) {
            plans.push({ actions: [...path], total, reports: all, penalties: done.penalties, signature });
            changed = true;
        }
    };

    const visit = (state: State, score: number): void => {
        if (allDone(state)) evaluate(state, score);
        const actions = legalActions(ctx, state);
        planned += actions.length;
        for (const action of actions) {
            if (stopped) return;
            const result = applyAction(ctx, state, action)!;
            path.push(action);
            const before = reports.length;
            for (const r of result.reports) reports.push(r);
            visit(result.state, score + result.reports.reduce((s, r) => s + r.score, 0));
            reports.length = before;
            path.pop();
            searched++;
            if (++sinceCheck >= batch) {
                sinceCheck = 0;
                checkIn();
            }
        }
    };

    visit(start, 0);
    if (!stopped) searched++; // the empty plan, now that everything under it is done
    flush();
    if (options.onBest && changed) options.onBest(plans);
    Atomics.store(counters, COUNTER.status, stopped ? 2n : 1n);
    return { bestScore, plans, stopped };
}
