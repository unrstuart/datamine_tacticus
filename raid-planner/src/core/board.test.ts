import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board, BoardData, BossData } from './board';
import { DIRECTIONS, neighbor } from './hex';

const boards: Record<string, BoardData> = JSON.parse(readFileSync('public/raid/boards.json', 'utf-8'));
const bosses: BossData[] = JSON.parse(readFileSync('public/raid/bosses.json', 'utf-8'));

describe('exported raid boards', () => {
    it('has every board a boss encounter names', () => {
        const ids = new Set(Object.keys(boards));
        for (const boss of bosses) for (const e of boss.encounters) expect(ids.has(e.boardId)).toBe(true);
        expect(ids.size).toBe(107);
    });

    it('lays hexes out where the neighbour function says they are', () => {
        // Two hexes that share an elevation and are neighbours must sit one hex-spacing apart on the image, in the
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
                    if (!n || n.elevation !== h.elevation) continue;
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
