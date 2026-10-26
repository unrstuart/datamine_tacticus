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

/** The direction pointing from `a` to the neighbouring cell `b`, or undefined when they aren't neighbours. */
export function directionBetween(a: Cell, b: Cell): Direction | undefined {
    return DIRECTIONS.find((d) => sameCell(neighbor(a, d), b));
}

export const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', NE: 'SW', SW: 'NE', SE: 'NW', NW: 'SE' };

/** Shift a cell by (dq, dz) in axial coordinates, so a whole footprint can be slid around without distorting its shape. */
export function translate(c: Cell, dq: number, dz: number): Cell {
    const { q, z } = axial(c);
    const nq = q + dq;
    const nz = z + dz;
    return { col: nq, row: nz + (nq - (nq & 1)) / 2 };
}

/** The axial offset (dq, dz) that takes `from` to `to`. */
export function offsetBetween(from: Cell, to: Cell): { dq: number; dz: number } {
    const a = axial(from);
    const b = axial(to);
    return { dq: b.q - a.q, dz: b.z - a.z };
}
