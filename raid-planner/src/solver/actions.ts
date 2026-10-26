import { Action, legalDeploys } from '../engine/plan';
import { legalAttacks } from '../engine/attacks';
import { legalMoves } from '../engine/movement';
import { Context, State, unitIds } from '../engine/state';

/** Whether every character on the board has finished its turn, by attacking or passing. */
export const allDone = (state: State): boolean => unitIds(state).every((id) => state.units[id]!.attacked);

/**
 * Every action that can be taken next, in a fixed order. A character that hasn't finished may move (once), attack, or
 * pass; Abaddon may use his active when the setup allows it; Z'kar may be deployed (once) on any hex where he fits.
 * A plan is complete when every character has finished; it may still deploy Z'kar after that, or stop.
 */
export function legalActions(ctx: Context, state: State): Action[] {
    const actions: Action[] = [];
    for (const unit of unitIds(state)) {
        const u = state.units[unit]!;
        if (u.attacked) continue;
        if (!u.moved) for (const to of legalMoves(ctx.board, state, unit)) actions.push({ type: 'move', unit, to });
        for (const c of legalAttacks(ctx, state, unit)) actions.push({ type: 'attack', unit, kind: c.kind, target: c.target, ...(c.extra ? { extra: c.extra } : {}) });
        actions.push({ type: 'pass', unit });
    }
    if (state.units.abaddon && !state.units.abaddon.attacked && state.abaddonExtra === 'available') actions.push({ type: 'abaddonActive' });
    for (const at of legalDeploys(ctx, state)) actions.push({ type: 'deploy', at });
    return actions;
}
