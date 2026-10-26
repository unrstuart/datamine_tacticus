import { describe, expect, it } from 'vitest';
import { Point, bossCellsAt, centroid, dragPreview, dropDrag, startDrag } from './drag';
import { Cell, cellKey, neighbors } from './hex';
import { Setup, addMinion, initialSetup, placeUnit } from './setup';
import { gridBoard } from './testBoard';
import { triangleAt, triangleShape, trianglesAround } from './triangle';

const at = (col: number, row: number): Cell => ({ col, row });

// A 3-hex boss: (2,2) with the hex above it and the hex up-right of it.
const platform3 = { size: 3, hexes: [{ column: 2, row: 2 }, { column: 2, row: 3 }, { column: 3, row: 2 }] };
const platform7 = { size: 7, hexes: [{ column: 4, row: 4 }, ...neighbors(at(4, 4)).map((c) => ({ column: c.col, row: c.row }))] };
const board3 = () => gridBoard(12, 12, {}, [platform3]);
const board7 = () => gridBoard(12, 12, {}, [platform7]);

const plus = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy });
const keys = (cells: Cell[]) => cells.map(cellKey).sort();

/** Grab the boss at the middle of hex `cell` and drag the pointer by (dx, dy); returns the setup after letting go. */
function dragBy(board = board3(), setup: Setup | undefined, grabCell: Cell, dx: number, dy: number) {
    const s = setup ?? initialSetup(board);
    const grab = centroid(board, [grabCell])!;
    const drag = startDrag(board, s, grabCell, grab)!;
    const end = plus(grab, dx, dy);
    // The hex under the pointer, as the board would report it.
    const hover = board.hexes.reduce((best, h) => ((h.x - end.x) ** 2 + (h.y - end.y) ** 2 < (best.x - end.x) ** 2 + (best.y - end.y) ** 2 ? h : best)).cell;
    return { drag, preview: dragPreview(board, s, drag, hover, end), dropped: dropDrag(board, s, drag, hover, end), s };
}

describe('picking things up', () => {
    it('grabs the boss by any of its hexes, or a character by its hex, but not empty ground', () => {
        const board = board3();
        const setup = placeUnit(board, initialSetup(board), 'abaddon', at(7, 7))!;
        const p = (c: Cell) => centroid(board, [c])!;
        for (const c of setup.bossCells) expect(startDrag(board, setup, c, p(c))?.kind).toBe('boss');
        expect(startDrag(board, setup, at(7, 7), p(at(7, 7)))).toEqual({ kind: 'unit', unit: 'abaddon' });
        expect(startDrag(board, setup, at(0, 0), p(at(0, 0)))).toBeUndefined();
    });
});

describe('a 3-hex boss follows the pointer by its centre', () => {
    it('does not move when it is not dragged, whichever hex is grabbed', () => {
        const board = board3();
        for (const grab of initialSetup(board).bossCells) {
            const { preview, dropped, s } = dragBy(board, undefined, grab, 0, 0);
            expect(keys(preview.cells)).toEqual(keys(s.bossCells));
            expect(preview.valid).toBe(true);
            expect(keys(dropped.bossCells)).toEqual(keys(s.bossCells));
        }
    });

    it('slides without changing shape when dragged by whole hexes', () => {
        const board = board3();
        const w = 0.75 * 40 * 2; // two columns right: the same parity, so the shape is unchanged
        const { dropped } = dragBy(board, undefined, at(2, 2), w, 34.64);
        expect(triangleShape(dropped.bossCells)).toBe('twoLeft');
        expect(keys(dropped.bossCells)).toEqual(keys(triangleAt(at(4, 1), 'twoLeft')));
    });

    it('picks the triangle whose corner is nearest, so nudging the pointer switches the shape', () => {
        const board = board3();
        // Every triangle containing hex (6,6) has its centre on one of that hex's six corners; pointing at each corner
        // (just inside the hex, towards the corner) must select exactly that triangle.
        const middle = centroid(board, [at(6, 6)])!;
        const seen = new Set<string>();
        for (const triangle of trianglesAround(at(6, 6))) {
            const corner = centroid(board, triangle)!;
            // Aim at the triangle's centre itself, then at a point a little towards the hex centre: still that triangle.
            for (const target of [corner, { x: corner.x + (middle.x - corner.x) * 0.2, y: corner.y + (middle.y - corner.y) * 0.2 }]) {
                expect(keys(bossCellsAt(board, 3, target)!)).toEqual(keys(triangle));
            }
            seen.add(triangleShape(triangle)!);
        }
        expect(seen).toEqual(new Set(['twoLeft', 'twoRight'])); // both orientations are reachable around one hex
    });

    it('can end up two-on-the-right-one-on-the-left by dragging, with no flip needed', () => {
        const board = board3();
        // Starting two-left; drag the pointer so the centre lands on a "twoRight" corner.
        const goal = triangleAt(at(6, 6), 'twoRight');
        const target = centroid(board, goal)!;
        const start = centroid(board, initialSetup(board).bossCells)!;
        const { dropped } = dragBy(board, undefined, at(2, 2), target.x - start.x, target.y - start.y);
        expect(keys(dropped.bossCells)).toEqual(keys(goal));
        expect(triangleShape(dropped.bossCells)).toBe('twoRight');
    });

    it('keeps the spot you grabbed under the pointer', () => {
        const board = board3();
        // Grab by the far hex rather than the middle: a zero drag still leaves the boss where it was.
        const { dropped, s } = dragBy(board, undefined, at(3, 2), 0, 0);
        expect(keys(dropped.bossCells)).toEqual(keys(s.bossCells));
    });
});

describe('dragging other bosses and characters', () => {
    it('a 7-hex boss is centred on the hex nearest its centre', () => {
        const board = board7();
        const { dropped } = dragBy(board, undefined, at(4, 4), 0.75 * 40 * 2, 0);
        expect(keys(dropped.bossCells)).toEqual(keys([at(6, 4), ...neighbors(at(6, 4))]));
    });

    it('refuses to drop the boss where it does not fit, leaving it where it was', () => {
        const board = gridBoard(12, 12, { '7,5': { passable: false } }, [platform7]);
        const setup = initialSetup(board);
        const { preview, dropped } = dragBy(board, setup, at(4, 4), 0.75 * 40 * 3, -17.32); // centred on (7,4), whose N neighbour is the rock
        expect(preview.valid).toBe(false);
        expect(dropped).toBe(setup);
    });

    it('does not let the boss slide onto a minion', () => {
        const board = board3();
        const setup = addMinion(board, initialSetup(board), at(6, 2))!;
        const { preview } = dragBy(board, setup, at(2, 2), 0.75 * 40 * 4, 0);
        expect(preview.valid).toBe(false);
    });

    it('drags a character to a free standable hex only', () => {
        const board = gridBoard(12, 12, { '1,1': { passable: false } }, [platform3]);
        const setup = placeUnit(board, initialSetup(board), 'ahriman', at(7, 7))!;
        const pos = (c: Cell) => centroid(board, [c])!;
        const drag = startDrag(board, setup, at(7, 7), pos(at(7, 7)))!;
        expect(dragPreview(board, setup, drag, at(7, 8), pos(at(7, 8))).valid).toBe(true);
        expect(dropDrag(board, setup, drag, at(7, 8), pos(at(7, 8))).units.ahriman).toEqual(at(7, 8));
        expect(dragPreview(board, setup, drag, at(1, 1), pos(at(1, 1))).valid).toBe(false);
        expect(dragPreview(board, setup, drag, at(2, 2), pos(at(2, 2))).valid).toBe(false); // the boss
    });
});

describe('a boss in a trench', () => {
    it('cannot be dragged half out of it', () => {
        const trench = { '4,4': { trench: true }, '4,5': { trench: true }, '5,4': { trench: true } };
        const board = gridBoard(12, 12, trench, [{ size: 3, hexes: [{ column: 4, row: 4 }, { column: 4, row: 5 }, { column: 5, row: 4 }] }]);
        const setup: Setup = initialSetup(board);
        expect(dragBy(board, setup, at(4, 4), 0, 0).preview.valid).toBe(true);
        expect(dragBy(board, setup, at(4, 4), 0, -34.64).preview.valid).toBe(false); // one hex down: partly out of the trench
    });
});
