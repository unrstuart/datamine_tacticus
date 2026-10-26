import { Board } from './board';
import { togglePin, toggleZkarAt } from './constraints';
import { Cell, cellKey } from './hex';
import { Effect, Setup, UnitId, addMinion, clearCell, placeUnit, removeMinion, setEffect, setUndesirable } from './setup';

// What clicking (or dragging across) hexes does for each tool in the placement sidebar. The boss and the characters can
// be picked up and dragged with any tool that doesn't paint (see drag.ts); `move` is the tool that does only that.

export type Tool =
    | { kind: 'move' }
    | { kind: 'minion' }
    | { kind: 'effect'; effect: Effect }
    | { kind: 'undesirable' }
    | { kind: 'clear' }
    | { kind: 'unit'; unit: UnitId }
    /** Click a hex to pin a character (or Z'kar's deployment) there: a rule that the plans must keep to. */
    | { kind: 'pin'; unit: UnitId | 'zkar' };

/** Dragging paints: it adds the thing, or, when the drag started on a hex that already has it, removes it. */
export type PaintMode = 'on' | 'off';

/** Tools that can be dragged across several hexes. The boss and the characters are placed by a single click. */
export const isPaintTool = (tool: Tool): boolean => tool.kind === 'minion' || tool.kind === 'effect' || tool.kind === 'undesirable' || tool.kind === 'clear';

const hasMinion = (setup: Setup, cell: Cell): boolean => setup.minions.some((m) => cellKey(m) === cellKey(cell));

/** The paint mode a drag starting on `cell` has: 'off' if the hex already carries what the tool paints. */
export function paintModeFor(setup: Setup, tool: Tool, cell: Cell): PaintMode {
    switch (tool.kind) {
        case 'minion':
            return hasMinion(setup, cell) ? 'off' : 'on';
        case 'effect':
            return setup.effects[cellKey(cell)] === tool.effect ? 'off' : 'on';
        case 'undesirable':
            return setup.undesirable.includes(cellKey(cell)) ? 'off' : 'on';
        default:
            return 'on';
    }
}

/** Apply the tool to one hex. An illegal change (a minion on a rock, say) leaves the setup as it was. */
export function applyTool(board: Board, setup: Setup, tool: Tool, cell: Cell, mode: PaintMode = 'on'): Setup {
    switch (tool.kind) {
        case 'move':
            return setup;
        case 'minion':
            return mode === 'on' ? (addMinion(board, setup, cell) ?? setup) : removeMinion(setup, cell);
        case 'effect':
            return setEffect(board, setup, cell, mode === 'on' ? tool.effect : null) ?? setup;
        case 'undesirable':
            return setUndesirable(board, setup, cell, mode === 'on') ?? setup;
        case 'clear':
            return clearCell(setup, cell);
        case 'unit':
            return placeUnit(board, setup, tool.unit, cell) ?? setup;
        case 'pin': {
            // Somewhere a character can stand, that isn't the boss's or a minion's, and that no other pin has taken.
            const blocked = setup.bossCells.concat(setup.minions).some((c) => cellKey(c) === cellKey(cell));
            const taken = setup.constraints.some((c) => c.kind === 'pin' && c.unit !== tool.unit && cellKey(c.cell) === cellKey(cell));
            if (board.hexAt(cell)?.passable !== true || blocked || taken) return setup;
            return { ...setup, constraints: tool.unit === 'zkar' ? toggleZkarAt(setup.constraints, cell) : togglePin(setup.constraints, tool.unit, cell) };
        }
    }
}
