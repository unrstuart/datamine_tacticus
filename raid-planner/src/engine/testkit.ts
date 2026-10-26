import { Cell, Direction, neighbor } from '../core/hex';
import { AbaddonExtraAttack, Effect, Setup, UnitId } from '../core/setup';
import { TestHex, gridBoard } from '../core/testBoard';
import { Roster, maxedRoster } from '../core/roster';
import { Context, Enemy, State, initialState } from './state';

/** Step `n` hexes from `c` in direction `d` (straight along the grid axes, so N/S stay in a column). */
export function go(c: Cell, d: Direction, n = 1): Cell {
    let out = c;
    for (let i = 0; i < n; i++) out = neighbor(out, d);
    return out;
}

export interface ScenarioOptions {
    cols?: number;
    rows?: number;
    hexes?: Record<string, TestHex>;
    boss?: Cell[];
    minions?: Cell[];
    units?: Partial<Record<UnitId, Cell>>;
    effects?: Record<string, Effect>;
    neuroStacks?: number;
    abaddonStacks?: number;
    abaddonExtra?: AbaddonExtraAttack;
    undesirable?: string[];
    abaddonSurvivesUndesirable?: boolean;
    ahrimanActiveAvailable?: boolean;
    neuroActiveAvailable?: boolean;
    roster?: Roster;
    armor?: { boss: number; minion: number };
    undesirablePenalty?: number;
    neuroAdjacentPenalty?: number;
}

/** A flat board (elevation 1 unless `hexes` says otherwise) with the given setup, ready to play. */
export function scenario(o: ScenarioOptions = {}): { ctx: Context; state: State; setup: Setup } {
    const board = gridBoard(o.cols ?? 16, o.rows ?? 16, o.hexes ?? {});
    const setup: Setup = {
        boardId: board.id,
        bossCells: o.boss ?? [{ col: 6, row: 10 }],
        minions: o.minions ?? [],
        effects: o.effects ?? {},
        undesirable: o.undesirable ?? [],
        neuroStacks: o.neuroStacks ?? 0,
        units: o.units ?? {},
        abaddonStacks: o.abaddonStacks ?? 0,
        abaddonExtraAttack: o.abaddonExtra ?? 'off',
        ahrimanActiveAvailable: o.ahrimanActiveAvailable ?? true,
        neuroActiveAvailable: o.neuroActiveAvailable ?? true,
        abaddonSurvivesUndesirable: o.abaddonSurvivesUndesirable ?? true,
        undesirablePenalty: o.undesirablePenalty ?? 0,
        neuroAdjacentPenalty: o.neuroAdjacentPenalty ?? 0,
    };
    return { ctx: { board, setup, roster: o.roster ?? maxedRoster(), armor: o.armor ?? { boss: 1000, minion: 1000 } }, state: initialState(setup), setup };
}

export const BOSS: Enemy = { kind: 'boss' };
export const minion = (cell: Cell): Enemy => ({ kind: 'minion', cell });
