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
    if (!u || u.moved || u.attacked) return [];
    const def = UNIT_DEFS[unit];
    const occupied = occupiedKeys(state);
    const enemies = new Set([...state.bossCells, ...state.minions].map(cellKey));

    const cost = new Map<string, number>([[cellKey(u.cell), 0]]);
    let frontier: Cell[] = [u.cell];
    for (let step = 1; step <= def.movement; step++) {
        const next: Cell[] = [];
        for (const from of frontier) {
            // A walker that entered fire this move stops there (the start hex doesn't count).
            if (!def.flies && cellKey(from) !== cellKey(u.cell) && isFire(effectAt(state, from))) continue;
            for (const to of neighbors(from)) {
                const key = cellKey(to);
                const hex = board.hexAt(to);
                if (!hex || cost.has(key)) continue;
                if (!def.flies) {
                    const here = board.hexAt(from)!;
                    if (!hex.passable || !board.connected(from, to) || Math.abs(hex.elevation - here.elevation) > 1 || enemies.has(key)) continue;
                }
                cost.set(key, step);
                next.push(to);
            }
        }
        frontier = next;
    }

    const result: Cell[] = [];
    for (const key of cost.keys()) {
        if (key === cellKey(u.cell) || occupied.has(key)) continue;
        const [col, row] = key.split(',').map(Number);
        const cell = { col, row };
        if (board.hexAt(cell)?.passable) result.push(cell);
    }
    return result;
}
