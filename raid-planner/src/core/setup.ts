import { Board } from './board';
import { Constraint } from './constraints';
import { EnemySelection } from './enemies';
import { validFootprint } from './footprint';
import { Cell, cellKey } from './hex';

// The board as the player sets it up before asking for a plan: where the boss, the minions and the five characters
// stand, which hexes carry an effect, which hexes to stay off, and the few numbers the planner needs. Everything here
// is immutable: each function returns a new Setup (or undefined when the change isn't legal).

export const UNIT_IDS = ['abaddon', 'ahriman', 'abraxas', 'archimatos', 'neurothrope'] as const;
export type UnitId = (typeof UNIT_IDS)[number];

/** A hex holds at most one effect. `fire2` burns this round and the next, `fire1` this round only. */
export type Effect = 'fire2' | 'fire1' | 'despoiled' | 'contaminated';
export const EFFECTS: readonly Effect[] = ['fire2', 'fire1', 'despoiled', 'contaminated'];

export const MAX_NEURO_STACKS = 16;
export const MAX_ABADDON_STACKS = 13;

/**
 * Abaddon's once-per-battle active costs him health but, from the turn it is used until the battle ends, gives each of his
 * normal melee attacks a second melee attack. `on`: already used in an earlier turn; `available`: the plan may use it
 * this turn; `off`: it won't be used.
 */
export type AbaddonExtraAttack = 'off' | 'available' | 'on';

export interface Setup {
    boardId: string;
    bossCells: Cell[];
    minions: Cell[];
    /** Effect by cell key. */
    effects: Record<string, Effect>;
    /** Hexes a unit would rather not end the round on (the boss marks them to strike next turn). */
    undesirable: string[];
    /** Neuroparasite stacks on the boss; 0 means not yet infected. */
    neuroStacks: number;
    /** Where each character stands; a character not listed isn't placed. */
    units: Partial<Record<UnitId, Cell>>;
    /** Abaddon's passive stacks (0..13); every attack he makes adds one, and each stack added scores. */
    abaddonStacks: number;
    abaddonExtraAttack: AbaddonExtraAttack;
    /** Once-per-battle actives that haven't been spent yet. */
    ahrimanActiveAvailable: boolean;
    neuroActiveAvailable: boolean;
    /** Abaddon is tanky: by default he survives standing on an undesirable hex. */
    abaddonSurvivesUndesirable: boolean;
    /**
     * Damage taken off a plan for each unit ending on an undesirable hex, and for Neurothrope ending next to an enemy. Zero by
     * default: plans are ranked by damage, and a plan with a unit on an undesirable hex only loses to an equal one without.
     */
    undesirablePenalty: number;
    neuroAdjacentPenalty: number;
    /** Which rarity, stars and rank of boss to fight (its armor comes from that row); undefined means the strongest. */
    enemy?: EnemySelection;
    /** Hard rules the plans must follow (see constraints.ts). */
    constraints: Constraint[];
}

/**
 * A fresh setup: the boss on its platform and the five characters on the board's first player spawn points (in the order
 * of UNIT_IDS), so you drag them into place instead of placing each one. A spawn point under the boss or off the board
 * is skipped and that character is left unplaced.
 */
export function initialSetup(board: Board, platformIndex = 0): Setup {
    let setup: Setup = {
        boardId: board.id,
        bossCells: board.bossPlatforms()[platformIndex]?.cells ?? [],
        minions: [],
        effects: {},
        undesirable: [],
        neuroStacks: 0,
        units: {},
        abaddonStacks: 0,
        abaddonExtraAttack: 'available',
        ahrimanActiveAvailable: true,
        neuroActiveAvailable: true,
        abaddonSurvivesUndesirable: true,
        undesirablePenalty: 0,
        neuroAdjacentPenalty: 0,
        constraints: [],
    };
    const deploy = board.deployCells();
    UNIT_IDS.forEach((unit, i) => {
        if (deploy[i]) setup = placeUnit(board, setup, unit, deploy[i]) ?? setup;
    });
    return setup;
}

/** Every cell with a boss, a minion or a character on it. `except` leaves one character out (the one being moved). */
export function occupiedKeys(setup: Setup, except?: UnitId): Set<string> {
    const keys = new Set<string>();
    for (const c of setup.bossCells) keys.add(cellKey(c));
    for (const c of setup.minions) keys.add(cellKey(c));
    for (const [unit, c] of Object.entries(setup.units) as Array<[UnitId, Cell]>) if (unit !== except) keys.add(cellKey(c));
    return keys;
}

const standable = (board: Board, c: Cell): boolean => board.hexAt(c)?.passable === true;

/** Whether `cells` can hold the boss: a legal footprint that doesn't overlap a minion or character. */
export function bossFits(board: Board, setup: Setup, cells: readonly Cell[]): boolean {
    if (cells.length !== setup.bossCells.length || !validFootprint(board, cells)) return false;
    const others = occupiedKeys({ ...setup, bossCells: [] });
    return !cells.some((c) => others.has(cellKey(c)));
}

/** Put the boss exactly on `cells` (what dragging does: see drag.ts), if they are a legal place for it. */
export function moveBoss(board: Board, setup: Setup, cells: readonly Cell[]): Setup | undefined {
    return bossFits(board, setup, cells) ? { ...setup, bossCells: [...cells] } : undefined;
}

export function addMinion(board: Board, setup: Setup, cell: Cell): Setup | undefined {
    if (!standable(board, cell) || occupiedKeys(setup).has(cellKey(cell))) return undefined;
    return { ...setup, minions: [...setup.minions, cell] };
}

export function removeMinion(setup: Setup, cell: Cell): Setup {
    return { ...setup, minions: setup.minions.filter((m) => cellKey(m) !== cellKey(cell)) };
}

/** Put (or move) a character on `cell`. */
export function placeUnit(board: Board, setup: Setup, unit: UnitId, cell: Cell): Setup | undefined {
    if (!standable(board, cell) || occupiedKeys(setup, unit).has(cellKey(cell))) return undefined;
    return { ...setup, units: { ...setup.units, [unit]: cell } };
}

export function removeUnit(setup: Setup, unit: UnitId): Setup {
    const { [unit]: _removed, ...units } = setup.units;
    return { ...setup, units };
}

/** Set or (with `effect` null) clear the effect on a hex. Effects can lie under anyone, including the boss. */
export function setEffect(board: Board, setup: Setup, cell: Cell, effect: Effect | null): Setup | undefined {
    if (!standable(board, cell)) return undefined;
    const key = cellKey(cell);
    const { [key]: _old, ...effects } = setup.effects;
    return { ...setup, effects: effect ? { ...effects, [key]: effect } : effects };
}

export function setUndesirable(board: Board, setup: Setup, cell: Cell, on: boolean): Setup | undefined {
    if (!standable(board, cell)) return undefined;
    const key = cellKey(cell);
    const rest = setup.undesirable.filter((k) => k !== key);
    return { ...setup, undesirable: on ? [...rest, key] : rest };
}

/** Clear a hex of whatever the user put there: a minion, a character, an effect, an undesirable mark. The boss stays. */
export function clearCell(setup: Setup, cell: Cell): Setup {
    const key = cellKey(cell);
    const units = Object.fromEntries(Object.entries(setup.units).filter(([, c]) => cellKey(c as Cell) !== key));
    const { [key]: _effect, ...effects } = setup.effects;
    return { ...setup, minions: setup.minions.filter((m) => cellKey(m) !== key), units, effects, undesirable: setup.undesirable.filter((k) => k !== key) };
}

export function setNeuroStacks(setup: Setup, stacks: number): Setup {
    const n = Number.isFinite(stacks) ? Math.round(stacks) : 0;
    return { ...setup, neuroStacks: Math.min(MAX_NEURO_STACKS, Math.max(0, n)) };
}

export function setAbaddonStacks(setup: Setup, stacks: number): Setup {
    const n = Number.isFinite(stacks) ? Math.round(stacks) : 0;
    return { ...setup, abaddonStacks: Math.min(MAX_ABADDON_STACKS, Math.max(0, n)) };
}
