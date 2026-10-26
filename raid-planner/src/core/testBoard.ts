import { Board } from './board';
import { Direction } from './hex';

export interface TestHex {
    elevation?: number;
    passable?: boolean;
    trench?: boolean;
    bridge?: [Direction, Direction];
}

export const TEST_HEX_WIDTH = 40;
export const TEST_HEX_HEIGHT = 34.64;

/**
 * A cols x rows patch of flat grass at elevation 1, with per-hex overrides keyed "col,row". For tests. Hexes are laid out
 * the way the exported boards are (flat-topped, odd columns raised half a hex, row growing upward on screen).
 */
export function gridBoard(cols: number, rows: number, overrides: Record<string, TestHex> = {}, bossPlatforms: Array<{ size: number; hexes: Array<{ column: number; row: number }> }> = [], deploy: Array<{ column: number; row: number }> = []): Board {
    const hexes = [];
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const o = overrides[`${col},${row}`] ?? {};
            hexes.push({
                column: col,
                row,
                vCol: col,
                vRow: row,
                elevation: o.elevation ?? 1,
                tile: o.bridge ? 'Bridge' : o.passable === false ? 'Block' : 'Grass',
                passable: o.passable ?? true,
                trench: o.trench ?? false,
                bridge: o.bridge,
                x: col * 0.75 * TEST_HEX_WIDTH + TEST_HEX_WIDTH,
                y: (rows - row - (col & 1 ? 0.5 : 0)) * TEST_HEX_HEIGHT,
            });
        }
    }
    return new Board({ boardId: 'test', width: cols, height: rows, imageWidth: cols * TEST_HEX_WIDTH, imageHeight: (rows + 1) * TEST_HEX_HEIGHT, hexWidth: TEST_HEX_WIDTH, hexHeight: TEST_HEX_HEIGHT, hexes, bossPlatforms, deploy });
}
