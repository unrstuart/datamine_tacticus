import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { Cell } from './hex';
import { initialSetup } from './setup';
import { gridBoard } from './testBoard';
import { applyTool, isPaintTool, paintModeFor } from './tools';

const flat = (): Board => gridBoard(6, 6, { '3,3': { passable: false } }, [{ size: 1, hexes: [{ column: 5, row: 5 }] }]);
const at = (col: number, row: number): Cell => ({ col, row });

describe('tools', () => {
    const board = flat();

    it('only the minion, effect, undesirable and clear tools paint', () => {
        expect(isPaintTool({ kind: 'minion' })).toBe(true);
        expect(isPaintTool({ kind: 'effect', effect: 'fire2' })).toBe(true);
        expect(isPaintTool({ kind: 'move' })).toBe(false);
        expect(isPaintTool({ kind: 'unit', unit: 'abaddon' })).toBe(false);
    });

    it('a drag that starts on a hex that already has the thing erases it', () => {
        let setup = applyTool(board, initialSetup(board), { kind: 'minion' }, at(0, 0));
        expect(paintModeFor(setup, { kind: 'minion' }, at(0, 0))).toBe('off');
        expect(paintModeFor(setup, { kind: 'minion' }, at(0, 1))).toBe('on');
        setup = applyTool(board, setup, { kind: 'minion' }, at(0, 0), 'off');
        expect(setup.minions).toHaveLength(0);

        setup = applyTool(board, setup, { kind: 'effect', effect: 'fire2' }, at(1, 1));
        expect(paintModeFor(setup, { kind: 'effect', effect: 'fire2' }, at(1, 1))).toBe('off');
        // A different effect on the same hex replaces it rather than erasing.
        expect(paintModeFor(setup, { kind: 'effect', effect: 'despoiled' }, at(1, 1))).toBe('on');
        expect(applyTool(board, setup, { kind: 'effect', effect: 'despoiled' }, at(1, 1)).effects).toEqual({ '1,1': 'despoiled' });
    });

    it('painting over an illegal hex does nothing', () => {
        const setup = initialSetup(board);
        expect(applyTool(board, setup, { kind: 'minion' }, at(3, 3))).toBe(setup); // rock
        expect(applyTool(board, setup, { kind: 'minion' }, at(5, 5))).toBe(setup); // boss
    });

    it('a character is placed by clicking an empty hex, and clicking elsewhere moves it', () => {
        const tool = { kind: 'unit', unit: 'ahriman' } as const;
        let setup = applyTool(board, initialSetup(board), tool, at(1, 1));
        expect(setup.units.ahriman).toEqual(at(1, 1));
        setup = applyTool(board, setup, tool, at(2, 2));
        expect(setup.units.ahriman).toEqual(at(2, 2));
        expect(applyTool(board, setup, { kind: 'move' }, at(0, 0))).toBe(setup);
    });

    it('the clear tool wipes a hex', () => {
        let setup = applyTool(board, initialSetup(board), { kind: 'undesirable' }, at(1, 1));
        setup = applyTool(board, setup, { kind: 'clear' }, at(1, 1));
        expect(setup.undesirable).toEqual([]);
    });
});
