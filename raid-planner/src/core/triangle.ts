import { Cell, cellKey, translate } from './hex';

// A three-hex footprint (a 3-hex boss, Z'kar) is a triangle of mutually adjacent hexes. Up to sliding it around there
// are exactly two shapes:
//   twoLeft:  an anchor, the hex above it and the hex up-right of it   (two in one column, one to the right)
//   twoRight: an anchor, the hex above it and the hex up-left of it    (two in one column, one to the left)
// Each shape can be anchored on any of its three hexes, so a given hex lies in three triangles of each shape: one for
// each of the hex's six corners (a triangle sits on the corner where its three hexes meet).

export type TriangleShape = 'twoLeft' | 'twoRight';

// Axial offsets (dq, dz) of the other two hexes from the anchor.
const SHAPES: Record<TriangleShape, Array<[number, number]>> = {
    twoLeft: [
        [0, 1],
        [1, 0],
    ],
    twoRight: [
        [0, 1],
        [-1, 1],
    ],
};

/** The triangle of `shape` whose anchor is `anchor` (the anchor first). */
export function triangleAt(anchor: Cell, shape: TriangleShape): [Cell, Cell, Cell] {
    const [a, b] = SHAPES[shape];
    return [anchor, translate(anchor, a[0], a[1]), translate(anchor, b[0], b[1])];
}

/** Which shape three cells form, or undefined when they aren't a triangle. */
export function triangleShape(cells: readonly Cell[]): TriangleShape | undefined {
    if (cells.length !== 3) return undefined;
    const keys = new Set(cells.map(cellKey));
    for (const shape of Object.keys(SHAPES) as TriangleShape[]) {
        if (cells.some((anchor) => triangleAt(anchor, shape).every((c) => keys.has(cellKey(c))))) return shape;
    }
    return undefined;
}

/** The six triangles (three of each shape) that contain `cell`, one per corner of the hex. */
export function trianglesAround(cell: Cell): Array<[Cell, Cell, Cell]> {
    return (Object.keys(SHAPES) as TriangleShape[]).flatMap((shape) =>
        [[0, 0], ...SHAPES[shape]].map(([dq, dz]) => triangleAt(translate(cell, -dq, -dz), shape))
    );
}
