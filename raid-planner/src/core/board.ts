import { Cell, Direction, OPPOSITE, cellKey, directionBetween, neighbors } from './hex';

/** One hex as exported by extract_raid_boards.ts (public/raid/boards.json). */
export interface HexData {
    column: number;
    row: number;
    /** Visual-grid cell: the hex's position on the board and what adjacency is defined on. */
    vCol: number;
    vRow: number;
    /** Gameplay elevation (a bridge deck sits level with the land at its ends). */
    elevation: number;
    tile: string;
    passable: boolean;
    trench: boolean;
    /** For a bridge: the two directions it connects. */
    bridge?: [Direction, Direction];
    /** Pixel centre in the board image. */
    x: number;
    y: number;
}

export interface BoardData {
    boardId: string;
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
    hexWidth: number;
    hexHeight: number;
    hexes: HexData[];
    bossPlatforms: Array<{ size: number; hexes: Array<{ column: number; row: number }> }>;
    /** The player's starting hexes (logical cells), at most 5. */
    deploy?: Array<{ column: number; row: number }>;
}

export interface BossData {
    bossType: string;
    encounters: Array<{ type: string; boardId: string; unitId: string; icon?: string; minionIds: string[] }>;
}

export interface Hex {
    cell: Cell;
    elevation: number;
    tile: string;
    /** Can be stood on. The ones that can't are rocks and the like: fliers cross them. */
    passable: boolean;
    /** Trench hexes: a multi-hex unit must lie entirely in one trench to be on any of them. */
    trench: boolean;
    /** A bridge is a narrow ramp: it connects only to the hexes at its two ends. */
    bridge?: [Direction, Direction];
    x: number;
    y: number;
}

/** A board addressed by visual-grid cells. */
export class Board {
    readonly hexes: readonly Hex[];
    private readonly byKey = new Map<string, Hex>();
    /** Logical (column,row) -> visual cell, for data addressed the game's way (boss platforms, spawn points). */
    private readonly logical = new Map<string, Cell>();

    constructor(readonly data: BoardData) {
        this.hexes = data.hexes.map((h) => ({
            cell: { col: h.vCol, row: h.vRow },
            elevation: h.elevation,
            tile: h.tile,
            passable: h.passable,
            trench: h.trench,
            bridge: h.bridge,
            x: h.x,
            y: h.y,
        }));
        for (const h of this.hexes) this.byKey.set(cellKey(h.cell), h);
        for (const h of data.hexes) this.logical.set(`${h.column},${h.row}`, { col: h.vCol, row: h.vRow });
    }

    get id(): string {
        return this.data.boardId;
    }

    hexAt(c: Cell): Hex | undefined {
        return this.byKey.get(cellKey(c));
    }

    has(c: Cell): boolean {
        return this.byKey.has(cellKey(c));
    }

    /** The on-board neighbours of a cell. */
    neighborHexes(c: Cell): Hex[] {
        return neighbors(c).flatMap((n) => this.hexAt(n) ?? []);
    }

    /**
     * Whether two cells are adjacent in the sense that matters for multi-hex units and for walking: they are neighbours
     * on the grid and neither is a bridge hex whose ends don't point at the other. Elevation isn't considered.
     */
    connected(a: Cell, b: Cell): boolean {
        const d = directionBetween(a, b);
        const ha = this.hexAt(a);
        const hb = this.hexAt(b);
        if (!d || !ha || !hb) return false;
        return (!ha.bridge || ha.bridge.includes(d)) && (!hb.bridge || hb.bridge.includes(OPPOSITE[d]));
    }

    fromLogical(column: number, row: number): Cell | undefined {
        return this.logical.get(`${column},${row}`);
    }

    /** Where the player's characters start, as visual-grid cells. */
    deployCells(): Cell[] {
        return (this.data.deploy ?? []).flatMap((d) => this.fromLogical(d.column, d.row) ?? []);
    }

    /** The boss platforms (initial boss footprints) as visual-grid cells. */
    bossPlatforms(): Array<{ size: number; cells: Cell[] }> {
        return this.data.bossPlatforms.map((p) => ({
            size: p.size,
            cells: p.hexes.flatMap((h) => this.fromLogical(h.column, h.row) ?? []),
        }));
    }
}
