import { Cell, Direction, cellKey, neighbor } from './hex';
import { Board } from './board';
import { validFootprint } from './footprint';

// Where a three-hex summon (Z'kar, Galatian) ends up when deployed on a clicked hex. See docs/zkar-deployment.md.

/** The two extra hexes, in priority order: the first pair that is entirely unblocked is used. */
export const SUMMON_PAIRS: ReadonlyArray<readonly [Direction, Direction]> = [
    ['N', 'NE'],
    ['N', 'NW'],
    ['S', 'SE'],
    ['S', 'SW'],
    ['NE', 'SE'],
    ['NW', 'SW'],
];

/**
 * The three hexes (the clicked one first) a summon deployed on `clicked` occupies, or undefined when it can't be
 * deployed there. The first pair of neighbours whose hexes are free (`occupied`) and which together with the clicked hex
 * form a legal footprint (see validFootprint: same elevation, all or none in a trench, properly connected) is used. The
 * clicked hex itself must be free.
 */
export function summonFootprint(board: Board, occupied: ReadonlySet<string>, clicked: Cell): [Cell, Cell, Cell] | undefined {
    if (occupied.has(cellKey(clicked)) || !board.hexAt(clicked)?.passable) return undefined;
    for (const [a, b] of SUMMON_PAIRS) {
        const ca = neighbor(clicked, a);
        const cb = neighbor(clicked, b);
        if (occupied.has(cellKey(ca)) || occupied.has(cellKey(cb))) continue;
        if (validFootprint(board, [clicked, ca, cb])) return [clicked, ca, cb];
    }
    return undefined;
}
