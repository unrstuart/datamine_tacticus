import { Board } from '../core/board';
import { Cell, cellKey, footprintDistance } from '../core/hex';
import { AbaddonExtraAttack, Effect, Setup, UNIT_IDS, UnitId } from '../core/setup';
import { ActorName } from './units';

// The state of one round as it is played out. Plain data, copied on every step (cheap at this size).

export type Enemy = { kind: 'boss' } | { kind: 'minion'; cell: Cell };

export interface UnitState {
    cell: Cell;
    moved: boolean;
    attacked: boolean;
}

export interface ZkarState {
    cells: Cell[];
    /** Which of his attacks he has already made: when deployed, and when Archimatos / Abraxas attacked next to him. */
    triggered: { deploy: boolean; archimatos: boolean; abraxas: boolean };
}

export interface State {
    units: Partial<Record<UnitId, UnitState>>;
    zkar?: ZkarState;
    bossCells: Cell[];
    minions: Cell[];
    /** Hex effect by cell key. `fire1` is gone by next round; `fire2` is still burning. */
    effects: Record<string, Effect>;
    neuroStacks: number;
    /** Abaddon's passive stacks, and whether his normal melee attacks currently get a second one. */
    abaddonStacks: number;
    abaddonExtra: AbaddonExtraAttack;
    ahrimanActiveAvailable: boolean;
    neuroActiveAvailable: boolean;
    /** Neurothrope stood next to an enemy at some point in his turn. */
    neuroAdjacent: boolean;
}

export interface Context {
    board: Board;
    setup: Setup;
}

export function initialState(setup: Setup): State {
    const units: State['units'] = {};
    for (const id of UNIT_IDS) {
        const cell = setup.units[id];
        if (cell) units[id] = { cell, moved: false, attacked: false };
    }
    return {
        units,
        bossCells: setup.bossCells,
        minions: setup.minions,
        effects: setup.effects,
        neuroStacks: setup.neuroStacks,
        abaddonStacks: setup.abaddonStacks ?? 0,
        abaddonExtra: setup.abaddonExtraAttack ?? 'off',
        ahrimanActiveAvailable: setup.ahrimanActiveAvailable,
        neuroActiveAvailable: setup.neuroActiveAvailable,
        neuroAdjacent: false,
    };
}

export const unitIds = (state: State): UnitId[] => UNIT_IDS.filter((id) => state.units[id]);

/** The hexes an actor stands on, or undefined when it isn't on the board. */
export function actorCells(state: State, actor: ActorName): Cell[] | undefined {
    if (actor === 'zkar') return state.zkar?.cells;
    const u = state.units[actor];
    return u ? [u.cell] : undefined;
}

export function enemyCells(state: State, enemy: Enemy): Cell[] {
    return enemy.kind === 'boss' ? state.bossCells : [enemy.cell];
}

/** The boss first, then the minions in a fixed order. */
export function listEnemies(state: State): Enemy[] {
    const minions = [...state.minions].sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
    return [{ kind: 'boss' }, ...minions.map((cell): Enemy => ({ kind: 'minion', cell }))];
}

export const sameEnemy = (a: Enemy, b: Enemy): boolean => a.kind === b.kind && (a.kind === 'boss' || cellKey(a.cell) === cellKey((b as { cell: Cell }).cell));

/** Every hex with a boss, minion, character or Z'kar on it. */
export function occupiedKeys(state: State): Set<string> {
    const keys = new Set<string>();
    for (const c of state.bossCells) keys.add(cellKey(c));
    for (const c of state.minions) keys.add(cellKey(c));
    for (const u of Object.values(state.units)) if (u) keys.add(cellKey(u.cell));
    for (const c of state.zkar?.cells ?? []) keys.add(cellKey(c));
    return keys;
}

/** Whether any hex of `a` is connected (properly adjacent: see Board.connected) to any hex of `b`. */
export function adjacent(board: Board, a: readonly Cell[], b: readonly Cell[]): boolean {
    return a.some((x) => b.some((y) => board.connected(x, y)));
}

/** Hex distance between two footprints (nearest hexes; connection and elevation ignored). */
export const distanceBetween = (a: readonly Cell[], b: readonly Cell[]): number => footprintDistance(a, b);

/** The effect on a hex as it is during the round (`nextRound` false) or at the start of the next one (`fire1` has gone out). */
export function effectAt(state: State, cell: Cell, nextRound = false): Effect | undefined {
    const e = state.effects[cellKey(cell)];
    return nextRound && e === 'fire1' ? undefined : e;
}

export const isFire = (e: Effect | undefined): boolean => e === 'fire1' || e === 'fire2';

/** Whether any hex of the footprint is burning. */
export const burning = (state: State, cells: readonly Cell[], nextRound = false): boolean => cells.some((c) => isFire(effectAt(state, c, nextRound)));

/** Whether any hex of the footprint carries an effect (fire, despoiled ground, contaminated). */
export const hasEffect = (state: State, cells: readonly Cell[], nextRound = false): boolean => cells.some((c) => effectAt(state, c, nextRound) !== undefined);
