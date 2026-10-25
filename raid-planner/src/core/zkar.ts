import { Cell, Direction, cellKey, neighbor } from './hex';
import { Board } from './board';

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
 * deployed there. A neighbour is blocked when it is off the board, can't be occupied, holds a unit (`occupied`) or
 * has a different elevation from the clicked hex. The clicked hex itself must be free.
 */
export function summonFootprint(board: Board, occupied: ReadonlySet<string>, clicked: Cell): [Cell, Cell, Cell] | undefined {
    const origin = board.hexAt(clicked);
    if (!origin || !origin.passable || occupied.has(cellKey(clicked))) return undefined;
    const free = (d: Direction): Cell | undefined => {
        const c = neighbor(clicked, d);
        const hex = board.hexAt(c);
        return hex && hex.passable && hex.elevation === origin.elevation && !occupied.has(cellKey(c)) ? c : undefined;
    };
    for (const [a, b] of SUMMON_PAIRS) {
        const ca = free(a);
        const cb = free(b);
        if (ca && cb) return [clicked, ca, cb];
    }
    return undefined;
}
