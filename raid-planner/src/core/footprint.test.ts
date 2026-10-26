import { describe, expect, it } from 'vitest';
import { Cell, neighbors } from './hex';
import { validFootprint } from './footprint';
import { gridBoard } from './testBoard';

const at = (col: number, row: number): Cell => ({ col, row });
const flower = (centre: Cell): Cell[] => [centre, ...neighbors(centre)];

describe('footprints', () => {
    it('a single hex only has to be standable, trench or bridge included', () => {
        const board = gridBoard(6, 6, { '1,1': { trench: true }, '2,2': { passable: false }, '3,3': { bridge: ['N', 'S'] } });
        expect(validFootprint(board, [at(1, 1)])).toBe(true);
        expect(validFootprint(board, [at(3, 3)])).toBe(true);
        expect(validFootprint(board, [at(2, 2)])).toBe(false);
        expect(validFootprint(board, [at(9, 9)])).toBe(false);
    });

    it('multi-hex footprints must be on one elevation', () => {
        const board = gridBoard(6, 6, { '2,3': { elevation: 2 } });
        expect(validFootprint(board, flower(at(2, 2)))).toBe(false); // (2,3) is a neighbour
        expect(validFootprint(board, flower(at(4, 3)))).toBe(true);
    });

    it('must be adjacent to each other: no gaps, no duplicates', () => {
        const board = gridBoard(6, 6);
        expect(validFootprint(board, [at(1, 1), at(1, 3)])).toBe(false);
        expect(validFootprint(board, [at(1, 1), at(1, 2), at(1, 2)])).toBe(false);
        expect(validFootprint(board, [at(1, 1), at(1, 2), neighbors(at(1, 2))[1]])).toBe(true); // a triangle
    });

    describe('trenches', () => {
        // A three-hex trench around (2,2): a flower can't fit in it, and neither can a triangle spill out of it.
        const trench = { '2,2': { trench: true }, '2,3': { trench: true }, '3,3': { trench: true } };

        it('a multi-hex unit lies entirely in a trench or entirely out of it', () => {
            const board = gridBoard(6, 6, trench);
            expect(validFootprint(board, [at(2, 2), at(2, 3), at(3, 3)])).toBe(true); // all trench, mutually adjacent
            expect(validFootprint(board, [at(2, 2), at(2, 3), at(1, 3)])).toBe(false); // one hex pokes out of the trench
            expect(validFootprint(board, [at(4, 1), at(4, 2), at(5, 2)])).toBe(true); // wholly outside
        });

        it('a single hex may stand in a trench', () => {
            expect(validFootprint(gridBoard(6, 6, trench), [at(2, 2)])).toBe(true);
        });
    });

    describe('bridges', () => {
        // A bridge at (3,3) running N-S: it connects (3,4) and (3,2), not the hexes beside it, which are on the same
        // elevation and are still neighbours on the grid.
        const board = gridBoard(7, 7, { '3,3': { bridge: ['N', 'S'] } });

        it('connects only along its axis', () => {
            expect(board.connected(at(3, 3), at(3, 4))).toBe(true);
            expect(board.connected(at(3, 4), at(3, 3))).toBe(true);
            expect(board.connected(at(3, 3), at(3, 2))).toBe(true);
            for (const side of ['NE', 'SE', 'SW', 'NW'] as const) {
                const n = neighbors(at(3, 3))[['N', 'NE', 'SE', 'S', 'SW', 'NW'].indexOf(side)];
                expect(board.connected(at(3, 3), n)).toBe(false);
                expect(board.connected(n, at(3, 3))).toBe(false);
            }
        });

        it('keeps a bridge hex out of any multi-hex footprint', () => {
            expect(validFootprint(board, flower(at(3, 3)))).toBe(false); // the bridge is in the middle
            expect(validFootprint(board, flower(at(3, 4)))).toBe(false); // ... or on the ring
            expect(validFootprint(board, [at(1, 1), at(1, 2), neighbors(at(1, 2))[1]])).toBe(true);
        });
    });
});
