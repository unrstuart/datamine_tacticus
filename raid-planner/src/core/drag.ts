import { Board } from './board';
import { Cell, cellKey, neighbors } from './hex';
import { Setup, UnitId, moveBoss, placeUnit } from './setup';
import { trianglesAround } from './triangle';

// Dragging the boss or a character.
//
// A character follows the hex under the pointer. The boss follows the pointer by its centre: where you grabbed it is
// kept under the pointer, and the footprint is whatever fits that centre best. A 1-hex boss is the hex nearest the
// centre, a 7-hex boss is centred on it, and a 3-hex boss is the triangle whose centre (the corner where its three
// hexes meet) is nearest. So the orientation of a 3-hex boss comes from where you hold it, with no separate control:
// nudge it across a hex corner and it switches shape. The preview says whether the footprint fits before you let go.

export interface Point {
    x: number;
    y: number;
}

export type Drag = { kind: 'boss'; offset: Point } | { kind: 'unit'; unit: UnitId };

export interface DragPreview {
    /** The hexes the dragged thing would occupy. */
    cells: Cell[];
    /** Whether letting go here would place it. */
    valid: boolean;
}

/** The middle of a footprint on the board image: the mean of its hexes' centres. */
export function centroid(board: Board, cells: readonly Cell[]): Point | undefined {
    const hexes = cells.flatMap((c) => board.hexAt(c) ?? []);
    if (hexes.length === 0) return undefined;
    return { x: hexes.reduce((s, h) => s + h.x, 0) / hexes.length, y: hexes.reduce((s, h) => s + h.y, 0) / hexes.length };
}

const dist2 = (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The hex whose centre is nearest `p` (any hex, standable or not). */
function nearestHex(board: Board, p: Point): Cell | undefined {
    let best: Cell | undefined;
    let bestD = Infinity;
    for (const h of board.hexes) {
        const d = dist2(h, p);
        if (d < bestD) {
            bestD = d;
            best = h.cell;
        }
    }
    return best;
}

/** The footprint of a boss of `size` hexes whose centre is closest to `target` (a point on the board image). */
export function bossCellsAt(board: Board, size: number, target: Point): Cell[] | undefined {
    const near = nearestHex(board, target);
    if (!near) return undefined;
    if (size === 1) return [near];
    if (size === 7) return [near, ...neighbors(near)];
    if (size === 3) {
        let best: Cell[] | undefined;
        let bestD = Infinity;
        for (const triangle of trianglesAround(near)) {
            const c = centroid(board, triangle);
            if (!c) continue; // a corner of the board with a hex missing
            const d = dist2(c, target);
            if (d < bestD) {
                bestD = d;
                best = triangle;
            }
        }
        return best;
    }
    return undefined;
}

/** The thing under `cell` that can be picked up, if any: the boss, grabbed at `point`, or a character. */
export function startDrag(board: Board, setup: Setup, cell: Cell, point: Point): Drag | undefined {
    const key = cellKey(cell);
    const unit = (Object.entries(setup.units) as Array<[UnitId, Cell]>).find(([, c]) => cellKey(c) === key);
    if (unit) return { kind: 'unit', unit: unit[0] };
    if (setup.bossCells.some((c) => cellKey(c) === key)) {
        const middle = centroid(board, setup.bossCells);
        if (middle) return { kind: 'boss', offset: { x: point.x - middle.x, y: point.y - middle.y } };
    }
    return undefined;
}

function landing(board: Board, setup: Setup, drag: Drag, hover: Cell, point: Point): Cell[] | undefined {
    if (drag.kind === 'unit') return [hover];
    return bossCellsAt(board, setup.bossCells.length, { x: point.x - drag.offset.x, y: point.y - drag.offset.y });
}

export function dragPreview(board: Board, setup: Setup, drag: Drag, hover: Cell, point: Point): DragPreview {
    const cells = landing(board, setup, drag, hover, point) ?? [];
    const valid = drag.kind === 'unit' ? placeUnit(board, setup, drag.unit, hover) !== undefined : moveBoss(board, setup, cells) !== undefined;
    return { cells, valid };
}

/** Let go: the setup with the dragged thing moved to where the preview showed it, or unchanged if that isn't legal. */
export function dropDrag(board: Board, setup: Setup, drag: Drag, hover: Cell, point: Point): Setup {
    const cells = landing(board, setup, drag, hover, point);
    if (!cells) return setup;
    return (drag.kind === 'unit' ? placeUnit(board, setup, drag.unit, hover) : moveBoss(board, setup, cells)) ?? setup;
}
