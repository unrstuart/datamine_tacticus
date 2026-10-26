import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { Cell, neighbors } from './hex';
import { gridBoard } from './testBoard';
import {
    MAX_NEURO_STACKS,
    Setup,
    addMinion,
    clearCell,
    initialSetup,
    moveBoss,
    placeUnit,
    removeMinion,
    setEffect,
    setNeuroStacks,
    setUndesirable,
} from './setup';

// A flat 8x8 board at elevation 1 with one rock at (4,4) and one raised hex at (2,2), and a 7-hex boss platform.
function flat(): Board {
    const platform = { size: 7, hexes: [{ column: 5, row: 5 }, ...neighbors({ col: 5, row: 5 }).map((c) => ({ column: c.col, row: c.row }))] };
    return gridBoard(8, 8, { '4,4': { passable: false }, '2,2': { elevation: 2 } }, [platform]);
}

const at = (col: number, row: number): Cell => ({ col, row });

describe('setup', () => {
    it('puts the five characters on the first player spawn points, in order', () => {
        const spawns = [0, 1, 2, 3, 4].map((row) => ({ column: 0, row }));
        const board = gridBoard(8, 8, {}, [], spawns);
        const setup = initialSetup(board);
        expect(Object.keys(setup.units)).toEqual(['abaddon', 'ahriman', 'abraxas', 'archimatos', 'neurothrope']);
        expect(setup.units.abaddon).toEqual(at(0, 0));
        expect(setup.units.neurothrope).toEqual(at(0, 4));
    });

    it('leaves a character unplaced when its spawn point is unusable or there are not enough', () => {
        const board = gridBoard(8, 8, { '0,1': { passable: false } }, [], [{ column: 0, row: 0 }, { column: 0, row: 1 }, { column: 0, row: 2 }]);
        const setup = initialSetup(board);
        expect(Object.keys(setup.units)).toEqual(['abaddon', 'abraxas']);
        expect(initialSetup(gridBoard(8, 8)).units).toEqual({});
    });

    it('starts with the boss on its platform', () => {
        const setup = initialSetup(flat());
        expect(setup.bossCells).toHaveLength(7);
        expect(setup.neuroStacks).toBe(0);
        expect(setup.abaddonSurvivesUndesirable).toBe(true);
    });

    describe('boss', () => {
        it('moves onto any legal footprint of the same size', () => {
            const board = flat();
            const setup = initialSetup(board);
            const elsewhere = [at(1, 5), ...neighbors(at(1, 5))];
            expect(moveBoss(board, setup, elsewhere)?.bossCells).toEqual(elsewhere);
        });

        it('a 7-hex boss needs seven standable hexes of one elevation', () => {
            const board = flat();
            const setup = initialSetup(board);
            expect(moveBoss(board, setup, [at(4, 3), ...neighbors(at(4, 3))])).toBeUndefined(); // the rock at (4,4) is a neighbour
            expect(moveBoss(board, setup, [at(2, 3), ...neighbors(at(2, 3))])).toBeUndefined(); // the raised hex at (2,2) is a neighbour
            expect(moveBoss(board, setup, [at(0, 0), ...neighbors(at(0, 0))])).toBeUndefined(); // off the edge
        });

        it('keeps its size: a 7-hex boss cannot be set to a 3-hex footprint', () => {
            const board = flat();
            expect(moveBoss(board, initialSetup(board), [at(1, 1), at(1, 2), at(2, 1)])).toBeUndefined();
        });

        it('cannot move on top of a minion or character', () => {
            const board = flat();
            const setup = addMinion(board, initialSetup(board), at(1, 5))!;
            expect(moveBoss(board, setup, [at(1, 5), ...neighbors(at(1, 5))])).toBeUndefined();
            expect(moveBoss(board, setup, [at(6, 1), ...neighbors(at(6, 1))])).toBeDefined();
        });
    });

    describe('minions and characters', () => {
        it('adds and removes minions on free standable hexes only', () => {
            const board = flat();
            let setup: Setup | undefined = initialSetup(board);
            expect(addMinion(board, setup, at(4, 4))).toBeUndefined(); // rock
            expect(addMinion(board, setup, at(5, 5))).toBeUndefined(); // boss
            setup = addMinion(board, setup, at(0, 0))!;
            expect(addMinion(board, setup, at(0, 0))).toBeUndefined(); // occupied
            expect(removeMinion(setup, at(0, 0)).minions).toHaveLength(0);
        });

        it('moves a character without colliding with itself, but not onto another unit', () => {
            const board = flat();
            let setup = placeUnit(board, initialSetup(board), 'abaddon', at(0, 0))!;
            setup = placeUnit(board, setup, 'abaddon', at(0, 1))!;
            expect(setup.units.abaddon).toEqual(at(0, 1));
            expect(placeUnit(board, setup, 'ahriman', at(0, 1))).toBeUndefined();
            expect(placeUnit(board, setup, 'ahriman', at(4, 4))).toBeUndefined();
        });
    });

    describe('effects and marks', () => {
        it('a hex holds one effect: a new one replaces the old', () => {
            const board = flat();
            let setup = setEffect(board, initialSetup(board), at(1, 1), 'fire2')!;
            setup = setEffect(board, setup, at(1, 1), 'despoiled')!;
            expect(setup.effects).toEqual({ '1,1': 'despoiled' });
            expect(setEffect(board, setup, at(1, 1), null)!.effects).toEqual({});
        });

        it('effects can lie under the boss but not on a rock', () => {
            const board = flat();
            expect(setEffect(board, initialSetup(board), at(5, 5), 'fire1')).toBeDefined();
            expect(setEffect(board, initialSetup(board), at(4, 4), 'fire1')).toBeUndefined();
        });

        it('marks and unmarks undesirable hexes', () => {
            const board = flat();
            const marked = setUndesirable(board, initialSetup(board), at(1, 1), true)!;
            expect(marked.undesirable).toEqual(['1,1']);
            expect(setUndesirable(board, marked, at(1, 1), false)!.undesirable).toEqual([]);
        });

        it('clearing a hex removes what the user put there but not the boss', () => {
            const board = flat();
            let setup = placeUnit(board, initialSetup(board), 'neurothrope', at(1, 1))!;
            setup = setEffect(board, setup, at(1, 1), 'fire2')!;
            setup = setUndesirable(board, setup, at(1, 1), true)!;
            setup = clearCell(setup, at(1, 1));
            expect(setup.units).toEqual({});
            expect(setup.effects).toEqual({});
            expect(setup.undesirable).toEqual([]);
            expect(clearCell(setup, at(5, 5)).bossCells).toHaveLength(7);
        });
    });

    it('keeps the neuroparasite stacks between 0 and 16', () => {
        const setup = initialSetup(flat());
        expect(setNeuroStacks(setup, 5).neuroStacks).toBe(5);
        expect(setNeuroStacks(setup, -3).neuroStacks).toBe(0);
        expect(setNeuroStacks(setup, 99).neuroStacks).toBe(MAX_NEURO_STACKS);
        expect(setNeuroStacks(setup, NaN).neuroStacks).toBe(0);
    });
});
