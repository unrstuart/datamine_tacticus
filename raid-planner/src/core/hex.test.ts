import { describe, expect, it } from 'vitest';
import { Cell, DIRECTIONS, cellKey, distance, neighbor, neighbors } from './hex';

// Breadth-first distance on the neighbour function, the definition `distance` must agree with.
function bfs(from: Cell, to: Cell, limit: number): number {
    let frontier = [from];
    const seen = new Set([cellKey(from)]);
    for (let d = 0; d <= limit; d++) {
        if (frontier.some((c) => cellKey(c) === cellKey(to))) return d;
        const next: Cell[] = [];
        for (const c of frontier) {
            for (const n of neighbors(c)) {
                if (!seen.has(cellKey(n))) {
                    seen.add(cellKey(n));
                    next.push(n);
                }
            }
        }
        frontier = next;
    }
    return Infinity;
}

describe('hex grid', () => {
    it('opposite directions undo each other', () => {
        const opposite: Record<string, string> = { N: 'S', S: 'N', NE: 'SW', SW: 'NE', SE: 'NW', NW: 'SE' };
        for (const col of [0, 1, 2, 3, 6, 7]) {
            for (const d of DIRECTIONS) {
                const start = { col, row: 5 };
                const back = neighbor(neighbor(start, d), opposite[d] as (typeof DIRECTIONS)[number]);
                expect(back).toEqual(start);
            }
        }
    });

    it('has six distinct neighbours at distance 1', () => {
        for (const col of [0, 1, 4, 5]) {
            const c = { col, row: 3 };
            const ns = neighbors(c);
            expect(new Set(ns.map(cellKey)).size).toBe(6);
            for (const n of ns) expect(distance(c, n)).toBe(1);
        }
    });

    it('distance matches breadth-first search', () => {
        for (const a of [{ col: 0, row: 0 }, { col: 3, row: 4 }, { col: 4, row: 2 }]) {
            for (let col = -1; col <= 8; col++) {
                for (let row = -2; row <= 9; row++) {
                    const b = { col, row };
                    expect(distance(a, b)).toBe(bfs(a, b, 14));
                }
            }
        }
    });

    it('odd columns are raised half a hex', () => {
        // Even column: NE shares the row, SE drops one. Odd column: NE rises one, SE shares the row.
        expect(neighbor({ col: 2, row: 5 }, 'NE')).toEqual({ col: 3, row: 5 });
        expect(neighbor({ col: 2, row: 5 }, 'SE')).toEqual({ col: 3, row: 4 });
        expect(neighbor({ col: 3, row: 5 }, 'NE')).toEqual({ col: 4, row: 6 });
        expect(neighbor({ col: 3, row: 5 }, 'SE')).toEqual({ col: 4, row: 5 });
    });
});
