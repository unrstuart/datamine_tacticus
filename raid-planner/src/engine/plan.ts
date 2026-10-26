import { Cell, cellKey } from '../core/hex';
import { UnitId } from '../core/setup';
import { summonFootprint } from '../core/zkar';
import { AttackChoice, AttackReport, legalAttacks, performAttack, zkarAttack } from './attacks';
import { legalMoves } from './movement';
import { Context, Enemy, State, adjacent, enemyCells, initialState, listEnemies, occupiedKeys, sameEnemy } from './state';

// A plan is a sequence of actions played out on a Setup. Moves, attacks and the deployment can come in any order, with
// one limit: a character moves (at most once) before it attacks, and attacking ends its turn.

export type Action =
    | { type: 'move'; unit: UnitId; to: Cell }
    | { type: 'attack'; unit: UnitId; kind: AttackChoice['kind']; target: Enemy }
    /** Deploy Z'kar by clicking `at`; he takes the hexes summonFootprint says. */
    | { type: 'deploy'; at: Cell };

export interface Step {
    action: Action;
    reports: AttackReport[];
    score: number;
}

export interface PlanResult {
    steps: Step[];
    /** The end-of-round bookkeeping: units lost on undesirable hexes, Z'kar's start-of-next-round attack, penalties. */
    finish: { reports: AttackReport[]; penalties: Penalty[]; score: number };
    final: State;
    total: number;
}

export interface Penalty {
    reason: 'undesirable' | 'neurothropeAdjacent';
    unit?: UnitId;
    points: number;
}

const PSYKERS: UnitId[] = ['ahriman', 'abraxas', 'archimatos', 'neurothrope'];

/** The hexes Z'kar could be deployed by clicking: every hex where a legal triangle fits right now. */
export function legalDeploys(ctx: Context, state: State): Cell[] {
    if (state.zkar) return [];
    const occupied = occupiedKeys(state);
    return ctx.board.hexes.map((h) => h.cell).filter((c) => summonFootprint(ctx.board, occupied, c));
}

/** Apply one action, or undefined when it isn't legal in this state. */
export function applyAction(ctx: Context, state: State, action: Action): { state: State; reports: AttackReport[] } | undefined {
    switch (action.type) {
        case 'move': {
            if (!legalMoves(ctx.board, state, action.unit).some((c) => cellKey(c) === cellKey(action.to))) return undefined;
            const u = state.units[action.unit]!;
            let next: State = { ...state, units: { ...state.units, [action.unit]: { ...u, cell: action.to, moved: true } } };
            // Neurothrope next to an enemy at any point of his turn.
            if (action.unit === 'neurothrope' && listEnemies(next).some((e) => adjacent(ctx.board, [action.to], enemyCells(next, e)))) next = { ...next, neuroAdjacent: true };
            return { state: next, reports: [] };
        }
        case 'attack': {
            const ok = legalAttacks(ctx, state, action.unit).some((c) => c.kind === action.kind && sameEnemy(c.target, action.target));
            return ok ? performAttack(ctx, state, action.unit, action.kind, action.target) : undefined;
        }
        case 'deploy': {
            if (state.zkar) return undefined;
            const cells = summonFootprint(ctx.board, occupiedKeys(state), action.at);
            if (!cells) return undefined;
            let next: State = { ...state, zkar: { cells, triggered: { deploy: false, archimatos: false, abraxas: false } } };
            // He attacks on the spot if he lands next to a psyker.
            const nextToPsyker = PSYKERS.some((id) => next.units[id] && adjacent(ctx.board, cells, [next.units[id]!.cell]));
            if (!nextToPsyker) return { state: next, reports: [] };
            next = { ...next, zkar: { ...next.zkar!, triggered: { ...next.zkar!.triggered, deploy: true } } };
            return zkarAttack(ctx, next, 'deploy');
        }
    }
}

/**
 * Close the round: a unit that ends on an undesirable hex is lost (Abaddon survives unless the setup says he won't),
 * costing the setup's penalty; Neurothrope next to an enemy costs his penalty; and if Z'kar survived and an enemy is in
 * reach he attacks once more at the start of the next round, with fire that has burnt out gone and the lost units gone.
 */
export function finishRound(ctx: Context, state: State): { state: State; reports: AttackReport[]; penalties: Penalty[] } {
    const { setup } = ctx;
    const penalties: Penalty[] = [];
    const undesirable = new Set(setup.undesirable);
    let next = state;
    const units = { ...state.units };
    for (const [id, u] of Object.entries(state.units) as Array<[UnitId, NonNullable<State['units'][UnitId]>]>) {
        if (!undesirable.has(cellKey(u.cell))) continue;
        if (id === 'abaddon' && setup.abaddonSurvivesUndesirable) continue;
        penalties.push({ reason: 'undesirable', unit: id, points: setup.undesirablePenalty });
        delete units[id];
    }
    const neuro = state.units.neurothrope;
    const nextToEnemy = neuro !== undefined && listEnemies(state).some((e) => adjacent(ctx.board, [neuro.cell], enemyCells(state, e)));
    if (state.neuroAdjacent || nextToEnemy) penalties.push({ reason: 'neurothropeAdjacent', unit: 'neurothrope', points: setup.neuroAdjacentPenalty });

    next = { ...state, units };
    let reports: AttackReport[] = [];
    const zkarLost = state.zkar?.cells.some((c) => undesirable.has(cellKey(c)));
    if (state.zkar && !zkarLost) {
        const more = zkarAttack(ctx, next, 'nextRound');
        next = more.state;
        reports = more.reports;
    }
    return { state: next, reports, penalties };
}

/** Play a whole plan. Throws on an illegal action, naming it. */
export function runPlan(ctx: Context, actions: readonly Action[], from?: State): PlanResult {
    let state = from ?? initialState(ctx.setup);
    const steps: Step[] = [];
    for (const action of actions) {
        const result = applyAction(ctx, state, action);
        if (!result) throw new Error(`illegal action: ${JSON.stringify(action)}`);
        state = result.state;
        steps.push({ action, reports: result.reports, score: result.reports.reduce((s, r) => s + r.score, 0) });
    }
    const done = finishRound(ctx, state);
    const finishScore = done.reports.reduce((s, r) => s + r.score, 0) - done.penalties.reduce((s, p) => s + p.points, 0);
    const total = steps.reduce((s, st) => s + st.score, 0) + finishScore;
    return { steps, finish: { reports: done.reports, penalties: done.penalties, score: finishScore }, final: done.state, total };
}
