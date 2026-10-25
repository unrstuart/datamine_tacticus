// Flat-topped hexes on the game's visual grid: (col, row) with `row` growing northward and ODD columns raised half
// a hex (verified against the exported pixel positions in board.test.ts). Directions are named as on screen.

export type Direction = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

export const DIRECTIONS: readonly Direction[] = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

export interface Cell {
    col: number;
    row: number;
}

export const cellKey = (c: Cell): string => `${c.col},${c.row}`;

export const sameCell = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;

/** The neighbour of `c` in direction `d` (it may lie off the board). */
export function neighbor(c: Cell, d: Direction): Cell {
    const odd = (c.col & 1) === 1;
    switch (d) {
        case 'N':
            return { col: c.col, row: c.row + 1 };
        case 'S':
            return { col: c.col, row: c.row - 1 };
        case 'NE':
            return { col: c.col + 1, row: odd ? c.row + 1 : c.row };
        case 'SE':
            return { col: c.col + 1, row: odd ? c.row : c.row - 1 };
        case 'NW':
            return { col: c.col - 1, row: odd ? c.row + 1 : c.row };
        case 'SW':
            return { col: c.col - 1, row: odd ? c.row : c.row - 1 };
    }
}

export function neighbors(c: Cell): Cell[] {
    return DIRECTIONS.map((d) => neighbor(c, d));
}

// Axial coordinates (q, z) for distance: q = col, z = row - floor(col / 2).
function axial(c: Cell): { q: number; z: number } {
    return { q: c.col, z: c.row - (c.col - (c.col & 1)) / 2 };
}

/** Hex distance. Elevation is ignored. */
export function distance(a: Cell, b: Cell): number {
    const p = axial(a);
    const q = axial(b);
    const dq = p.q - q.q;
    const dz = p.z - q.z;
    return Math.max(Math.abs(dq), Math.abs(dz), Math.abs(dq + dz));
}

/** Distance between two footprints: the closest pair of hexes. */
export function footprintDistance(a: readonly Cell[], b: readonly Cell[]): number {
    let best = Infinity;
    for (const x of a) for (const y of b) best = Math.min(best, distance(x, y));
    return best;
}
