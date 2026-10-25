import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { Cell, cellKey, neighbor } from './hex';
import { summonFootprint } from './zkar';

// A flat 5x5 patch of hexes at elevation 1, with the clicked hex in the middle (col 2, row 2).
function patch(overrides: Record<string, { elevation?: number; passable?: boolean }> = {}): Board {
    const hexes = [];
    for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 5; row++) {
            const o = overrides[`${col},${row}`] ?? {};
            hexes.push({ column: col, row, vCol: col, vRow: row, elevation: o.elevation ?? 1, tile: 'Grass', passable: o.passable ?? true, x: 0, y: 0 });
        }
    }
    return new Board({ boardId: 'patch', width: 5, height: 5, imageWidth: 0, imageHeight: 0, hexWidth: 0, hexHeight: 0, hexes, bossPlatforms: [] });
}

const centre: Cell = { col: 2, row: 2 };
const keys = (cells: Cell[] | undefined) => cells?.map(cellKey).sort();
const at = (...dirs: Array<'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW'>) => dirs.map((d) => neighbor(centre, d));

describe('summon footprint (the six diagrams)', () => {
    it('1: nothing blocked -> N + NE', () => {
        expect(keys(summonFootprint(patch(), new Set(), centre))).toEqual(keys([centre, ...at('N', 'NE')]));
    });

    it('1 still applies when only NW is blocked', () => {
        const occupied = new Set(at('NW').map(cellKey));
        expect(keys(summonFootprint(patch(), occupied, centre))).toEqual(keys([centre, ...at('N', 'NE')]));
    });

    it('2: NE blocked -> N + NW', () => {
        const occupied = new Set(at('NE').map(cellKey));
        expect(keys(summonFootprint(patch(), occupied, centre))).toEqual(keys([centre, ...at('N', 'NW')]));
    });

    it('3: N blocked -> S + SE', () => {
        const occupied = new Set(at('N').map(cellKey));
        expect(keys(summonFootprint(patch(), occupied, centre))).toEqual(keys([centre, ...at('S', 'SE')]));
    });

    it('4: N and SE blocked -> S + SW', () => {
        const occupied = new Set(at('N', 'SE').map(cellKey));
        expect(keys(summonFootprint(patch(), occupied, centre))).toEqual(keys([centre, ...at('S', 'SW')]));
    });

    it('5: N and S blocked -> NE + SE', () => {
        const occupied = new Set(at('N', 'S').map(cellKey));
        expect(keys(summonFootprint(patch(), occupied, centre))).toEqual(keys([centre, ...at('NE', 'SE')]));
    });

    it('6: N, S and NE blocked -> NW + SW', () => {
        const occupied = new Set(at('N', 'S', 'NE').map(cellKey));
        expect(keys(summonFootprint(patch(), occupied, centre))).toEqual(keys([centre, ...at('NW', 'SW')]));
    });

    it('cannot deploy when every pair is blocked', () => {
        const occupied = new Set(at('N', 'S', 'NE', 'NW').map(cellKey));
        expect(summonFootprint(patch(), occupied, centre)).toBeUndefined();
    });

    it('treats a neighbour at another elevation or impassable as blocked', () => {
        const [n] = at('N');
        const [ne] = at('NE');
        const board = patch({ [cellKey(n)]: { elevation: 2 }, [cellKey(ne)]: { passable: false } });
        expect(keys(summonFootprint(board, new Set(), centre))).toEqual(keys([centre, ...at('S', 'SE')]));
    });

    it('cannot deploy on an occupied or off-board hex', () => {
        expect(summonFootprint(patch(), new Set([cellKey(centre)]), centre)).toBeUndefined();
        expect(summonFootprint(patch(), new Set(), { col: 9, row: 9 })).toBeUndefined();
    });
});
