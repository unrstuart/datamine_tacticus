import { Board } from '../core/board';
import { Cell, cellKey, neighbors } from '../core/hex';
import { UnitId } from '../core/setup';
import { State, effectAt, isFire, occupiedKeys } from './state';
import { UNIT_DEFS } from './units';

// Where a character can move. One move per round, up to its movement in hexes, before it attacks.

/**
 * The hexes `unit` can end a move on (not counting staying put), or nothing once it has moved or attacked.
 *
 * Walkers step between properly connected hexes whose elevations differ by at most 1, one step per movement point; they
 * pass through friendly units but not enemies, and stop on the first fire hex they enter (they may start on one and
 * leave freely). Fliers ignore elevation, connection, impassable hexes, enemies and fire. Nobody may end on an occupied
 * hex or one that can't be stood on.
 */
export function legalMoves(board: Board, state: State, unit: UnitId): Cell[] {
    const u = state.units[unit];
    if (!u) return [];
    const occupied = occupiedKeys(state);
    const result: Cell[] = [];
    for (const key of explore(board, state, unit).keys()) {
        if (key === cellKey(u.cell) || occupied.has(key)) continue;
        const cell = parseKey(key);
        if (board.hexAt(cell)?.passable) result.push(cell);
    }
    return result;
}

/**
 * One way for `unit` to get to `to` (the hexes it steps through, from the one after its own up to `to`), by a shortest route, or
 * undefined when it can't. For showing a move: the rules are the ones legalMoves uses.
 */
export function movePath(board: Board, state: State, unit: UnitId, to: Cell): Cell[] | undefined {
    const u = state.units[unit];
    if (!u) return undefined;
    const found = explore(board, state, unit);
    if (!found.has(cellKey(to))) return undefined;
    const path: Cell[] = [];
    for (let key: string | undefined = cellKey(to); key !== undefined && key !== cellKey(u.cell); key = found.get(key)!.from) path.unshift(parseKey(key));
    return path;
}

const parseKey = (key: string): Cell => {
    const [col, row] = key.split(',').map(Number);
    return { col, row };
};

/** Every hex reachable within the unit's movement (its own included, at step 0), and the hex each was first reached from. */
function explore(board: Board, state: State, unit: UnitId): Map<string, { step: number; from?: string }> {
    const u = state.units[unit];
    const reached = new Map<string, { step: number; from?: string }>();
    if (!u || u.moved || u.attacked) return reached;
    const def = UNIT_DEFS[unit];
    const enemies = new Set([...state.bossCells, ...state.minions].map(cellKey));

    reached.set(cellKey(u.cell), { step: 0 });
    let frontier: Cell[] = [u.cell];
    for (let step = 1; step <= def.movement; step++) {
        const next: Cell[] = [];
        for (const from of frontier) {
            // A walker that entered fire this move stops there (the start hex doesn't count).
            if (!def.flies && cellKey(from) !== cellKey(u.cell) && isFire(effectAt(state, from))) continue;
            for (const to of neighbors(from)) {
                const key = cellKey(to);
                const hex = board.hexAt(to);
                if (!hex || reached.has(key)) continue;
                if (!def.flies) {
                    const here = board.hexAt(from)!;
                    if (!hex.passable || !board.connected(from, to) || Math.abs(hex.elevation - here.elevation) > 1 || enemies.has(key)) continue;
                }
                reached.set(key, { step, from: cellKey(from) });
                next.push(to);
            }
        }
        frontier = next;
    }
    return reached;
}
