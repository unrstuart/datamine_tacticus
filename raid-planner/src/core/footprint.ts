import { Board } from './board';
import { Cell, cellKey, neighbors } from './hex';

/**
 * Whether `cells` is a legal place for one unit to stand. One hex: any hex that can be stood on (a trench or a bridge
 * is fine). Several hexes (the boss, Z'kar): every hex can be stood on, all at one elevation, all on a trench or none
 * of them (so a unit in a trench is entirely in the same trench), and the hexes are all adjacent to one another where
 * they touch (a bridge hex doesn't connect sideways, so it can't be part of one) and form one connected piece.
 */
export function validFootprint(board: Board, cells: readonly Cell[]): boolean {
    if (cells.length === 0) return false;
    const hexes = cells.map((c) => board.hexAt(c));
    if (hexes.some((h) => !h || !h.passable)) return false;
    if (new Set(cells.map(cellKey)).size !== cells.length) return false;
    if (cells.length === 1) return true;

    const first = hexes[0]!;
    if (hexes.some((h) => h!.elevation !== first.elevation || h!.trench !== first.trench)) return false;

    const inSet = new Set(cells.map(cellKey));
    const seen = new Set([cellKey(cells[0])]);
    const queue = [cells[0]];
    while (queue.length > 0) {
        const c = queue.pop()!;
        for (const n of neighbors(c)) {
            if (!inSet.has(cellKey(n))) continue;
            // Neighbours inside the footprint must be properly connected, not just touching.
            if (!board.connected(c, n)) return false;
            if (!seen.has(cellKey(n))) {
                seen.add(cellKey(n));
                queue.push(n);
            }
        }
    }
    return seen.size === cells.length;
}
