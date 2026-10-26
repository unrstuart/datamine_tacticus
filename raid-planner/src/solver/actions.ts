import { Cell, cellKey } from '../core/hex';
import { UnitId } from '../core/setup';
import { legalAttacks } from '../engine/attacks';
import { Action } from '../engine/plan';
import { Context, State, adjacent, distanceBetween, enemyCells, listEnemies, unitIds } from '../engine/state';
import { summonFootprint } from '../core/zkar';
import { occupiedKeys } from '../engine/state';
import { Analysis, Statics, analyse, attackRange } from './analysis';
import { EXHAUSTIVE, SolverOptions } from './options';
import { hasTag } from '../engine/units';

/** Whether every character on the board has finished its turn, by attacking or passing. */
export const allDone = (state: State): boolean => unitIds(state).every((id) => state.units[id]!.attacked);

/** The hexes where Z'kar could be deployed now: every click where a triangle fits (see summonFootprint), among `candidates` if given. */
export function deployHexes(ctx: Context, state: State, candidates?: readonly Cell[]): Array<{ at: Cell; cells: Cell[] }> {
    if (state.zkar) return [];
    const occupied = occupiedKeys(state);
    const out: Array<{ at: Cell; cells: Cell[] }> = [];
    for (const at of candidates ?? ctx.board.hexes.map((h) => h.cell)) {
        const cells = summonFootprint(ctx.board, occupied, at);
        if (cells) out.push({ at, cells });
    }
    return out;
}

/** Whether Z'kar placed on `cells` has an enemy in reach: next to one, or within his ranged attack's 2 hexes. */
export const zkarInReach = (state: State, cells: readonly Cell[]): boolean => listEnemies(state).some((e) => distanceBetween(cells, enemyCells(state, e)) <= 2);

// ---- which moves are worth trying -----------------------------------------------------------------------------------

/** Whether `provider` standing on `at` could give a buff to `recipient` attacking from `from`. */
function provides(provider: UnitId, recipient: UnitId | 'zkar', at: Cell, from: Cell, zkarMatters: boolean): boolean {
    if (provider === recipient) return false;
    const d = distanceBetween([at], [from]);
    if (provider === 'abaddon' && hasTag(recipient, 'chaos')) return d <= 2;
    if (provider === 'neurothrope' && (hasTag(recipient, 'psyker') || hasTag(recipient, 'summon'))) return d <= 2;
    if (provider === 'abraxas' && hasTag(recipient, 'chaos')) return d <= 1;
    // Z'kar's buff: a psyker beside another psyker (or beside Z'kar) when Z'kar is, or can be, on the board.
    if (zkarMatters && hasTag(provider, 'psyker') && hasTag(recipient, 'psyker')) return d <= 1;
    return false;
}

/**
 * A move is worth trying when, from where it ends, the character could attack, or it could give a buff to a friend who could
 * still attack (taking the friend's own possible moves into account) or to Z'kar, or it gets the character off an undesirable
 * hex or from beside an enemy (Neurothrope). Otherwise the move cannot change the score.
 */
export function relevantMove(ctx: Context, state: State, an: Analysis, statics: Statics, unit: UnitId, to: Cell): boolean {
    const u = state.units[unit]!;
    if (an.attackCells[unit]?.some((c) => c.col === to.col && c.row === to.row)) return true;

    const bad = new Set(ctx.setup.undesirable);
    const exempt = unit === 'abaddon' && ctx.setup.abaddonSurvivesUndesirable;
    if (!exempt && bad.has(cellKey(u.cell)) && !bad.has(cellKey(to))) return true;
    if (unit === 'neurothrope') {
        const beside = (c: Cell) => an.enemyCellLists.some((cells) => adjacent(ctx.board, [c], cells));
        if (beside(u.cell) && !beside(to)) return true;
    }

    const zkarMatters = state.zkar !== undefined || statics.zkarZone.length > 0;
    for (const other of unitIds(state)) {
        if (other === unit) continue;
        for (const from of an.attackCells[other] ?? []) if (provides(unit, other, to, from, zkarMatters)) return true;
    }
    // Z'kar: where he stands, or anywhere he could still be put.
    for (const z of state.zkar?.cells ?? statics.zkarZone) if (provides(unit, 'zkar', to, z, zkarMatters)) return true;
    return false;
}

/**
 * How early a move is explored: 0 if from the new hex the character can still attack, 1 if it can't but could give a buff
 * (see relevantMove), 2 for the rest. Within a tier, hexes nearer the boss come first.
 */
export function moveTier(ctx: Context, state: State, an: Analysis, statics: Statics | undefined, unit: UnitId, to: Cell): 0 | 1 | 2 {
    if (an.attackCells[unit]?.some((c) => c.col === to.col && c.row === to.row)) return 0;
    return statics && relevantMove(ctx, state, an, statics, unit, to) ? 1 : 2;
}

/**
 * Every action that can be taken next, in a fixed order. A character that hasn't finished may move (once), attack, or
 * pass; Abaddon may use his active when the setup allows it; Z'kar may be deployed (once) on any hex where he fits. A plan
 * is complete when every character has finished; it may still deploy Z'kar after that, or stop.
 *
 * With options, moves that cannot change the score and deployments out of Z'kar's reach are left out (see SolverOptions).
 */
export function legalActions(ctx: Context, state: State, options: SolverOptions = EXHAUSTIVE, statics?: Statics, analysis?: Analysis): Action[] {
    const an = analysis ?? analyse(ctx, state);
    const actions: Action[] = [];
    for (const unit of unitIds(state)) {
        const u = state.units[unit]!;
        if (u.attacked) continue;
        if (!u.moved) {
            // Moves that keep the character in attacking range first, then those that only reach a buff, then the rest.
            const boss = enemyCells(state, { kind: 'boss' });
            const ranked = (an.moves[unit] ?? []).map((to) => ({ to, tier: moveTier(ctx, state, an, statics, unit, to), d: distanceBetween([to], boss) }));
            ranked.sort((x, y) => x.tier - y.tier || x.d - y.d); // stable: ties keep the board's order
            for (const { to, tier } of ranked) {
                if (options.relevantMovesOnly && statics && tier === 2) continue;
                actions.push({ type: 'move', unit, to });
            }
        }
        for (const c of legalAttacks(ctx, state, unit)) actions.push({ type: 'attack', unit, kind: c.kind, target: c.target, ...(c.extra ? { extra: c.extra } : {}) });
        actions.push({ type: 'pass', unit });
    }
    if (state.units.abaddon && !state.units.abaddon.attacked && state.abaddonExtra === 'available') actions.push({ type: 'abaddonActive' });
    const candidates = options.zkarInRangeOnly && statics ? statics.deployCandidates : undefined;
    for (const d of deployHexes(ctx, state, candidates)) {
        if (options.zkarInRangeOnly && !zkarInReach(state, d.cells)) continue;
        actions.push({ type: 'deploy', at: d.at });
    }
    return actions;
}

export { attackRange };
