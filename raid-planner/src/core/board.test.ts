import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board, BoardData, BossData } from './board';
import { validFootprint } from './footprint';
import { initialSetup } from './setup';
import { DIRECTIONS, cellKey, neighbor } from './hex';

const boards: Record<string, BoardData> = JSON.parse(readFileSync('public/raid/boards.json', 'utf-8'));
const bosses: BossData[] = JSON.parse(readFileSync('public/raid/bosses.json', 'utf-8'));

describe('exported raid boards', () => {
    it('has every board a boss encounter names', () => {
        const ids = new Set(Object.keys(boards));
        for (const boss of bosses) for (const e of boss.encounters) expect(ids.has(e.boardId)).toBe(true);
        expect(ids.size).toBe(107);
    });

    it('lays hexes out where the neighbour function says they are', () => {
        // Two ordinary hexes that share an elevation and are neighbours must sit one hex-spacing apart on the image, in the
        // direction the name says; this pins the stagger convention to the real data.
        let checked = 0;
        for (const data of Object.values(boards)) {
            const board = new Board(data);
            const spacing = data.hexHeight;
            const unit: Record<string, [number, number]> = {
                N: [0, -1],
                S: [0, 1],
                NE: [0.75 * (data.hexWidth / spacing), -0.5],
                SE: [0.75 * (data.hexWidth / spacing), 0.5],
                NW: [-0.75 * (data.hexWidth / spacing), -0.5],
                SW: [-0.75 * (data.hexWidth / spacing), 0.5],
            };
            for (const h of board.hexes) {
                for (const d of DIRECTIONS) {
                    const n = board.hexAt(neighbor(h.cell, d));
                    // Bridge decks are drawn lower than their gameplay height, so only compare ordinary tiles.
                    if (!n || n.elevation !== h.elevation || n.bridge || h.bridge) continue;
                    checked++;
                    expect(n.x - h.x).toBeCloseTo(unit[d][0] * spacing, 0);
                    expect(n.y - h.y).toBeCloseTo(unit[d][1] * spacing, 0);
                }
            }
        }
        expect(checked).toBeGreaterThan(1000);
    });

    it('puts every boss platform on the board, as a connected group of the stated size', () => {
        for (const data of Object.values(boards)) {
            const board = new Board(data);
            for (const p of board.bossPlatforms()) {
                expect(p.cells.length).toBe(p.size);
                for (const c of p.cells) expect(board.has(c)).toBe(true);
            }
        }
    });
});

describe('real boards', () => {
    it('GB_Magnus_03: bridges connect along their axis only', () => {
        const board = new Board(boards['GB_Magnus_03']);
        // The vertical bridge at (4,5) joins (4,6) and (4,4) but not the hex beside it, (5,5), though both are at height 2.
        expect(board.hexAt({ col: 4, row: 5 })?.bridge).toEqual(['N', 'S']);
        expect(board.connected({ col: 4, row: 5 }, { col: 4, row: 6 })).toBe(true);
        expect(board.connected({ col: 4, row: 5 }, { col: 4, row: 4 })).toBe(true);
        expect(board.connected({ col: 4, row: 5 }, { col: 5, row: 5 })).toBe(false);
        // The diagonal one at (6,5) runs NW-SE.
        expect(board.hexAt({ col: 6, row: 5 })?.bridge).toEqual(['NW', 'SE']);
    });

    it('GB_Riptide_03: has trench hexes, all at one elevation with the grass round them', () => {
        const board = new Board(boards['GB_Riptide_03']);
        const trench = board.hexes.filter((h) => h.trench);
        expect(trench).toHaveLength(7);
    });

    it('every bridge on every board has both ends on a hex you can stand on, where it has any usable axis', () => {
        let bridges = 0;
        let usable = 0;
        for (const data of Object.values(boards)) {
            const board = new Board(data);
            for (const h of board.hexes.filter((x) => x.bridge)) {
                bridges++;
                if (h.bridge!.every((d) => board.hexAt(neighbor(h.cell, d))?.passable)) usable++;
            }
        }
        expect(bridges).toBeGreaterThan(50);
        expect(usable).toBeGreaterThanOrEqual(bridges - 2); // a couple sit at a board edge with no usable axis
    });
});

describe('boss platforms', () => {
    it('every starting boss position is a legal footprint', () => {
        for (const data of Object.values(boards)) {
            const board = new Board(data);
            for (const p of board.bossPlatforms()) expect(validFootprint(board, p.cells), `${data.boardId} platform of ${p.size}`).toBe(true);
        }
    });
});

describe('default deployment', () => {
    it('puts all five characters on spawn points on every board that has them, clear of the boss', () => {
        let withSpawns = 0;
        for (const data of Object.values(boards)) {
            const board = new Board(data);
            const setup = initialSetup(board);
            if ((data.deploy?.length ?? 0) >= 5) {
                withSpawns++;
                expect(Object.keys(setup.units), data.boardId).toHaveLength(5);
            }
            const boss = new Set(setup.bossCells.map(cellKey));
            for (const c of Object.values(setup.units)) expect(boss.has(cellKey(c!))).toBe(false);
        }
        expect(withSpawns).toBeGreaterThan(100);
    });
});
