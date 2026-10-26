import { Cell, cellKey } from '../core/hex';
import { Constraint } from '../core/constraints';
import { UnitId } from '../core/setup';
import { Action, applyAction } from '../engine/plan';
import { Context, State, adjacent, initialState, unitIds } from '../engine/state';

// The user's rules (see core/constraints.ts) as checks the searches make on every action, so a plan that breaks one is never
// built (exhaustive search) or never kept (local search).

const constraintsOf = (ctx: Context): readonly Constraint[] => ctx.setup.constraints ?? [];

/** Whether any rule is set. */
export const hasConstraints = (ctx: Context): boolean => constraintsOf(ctx).length > 0;

/** The hex a character is pinned to, if it is. */
export function pinnedCell(ctx: Context, unit: UnitId): Cell | undefined {
    const pin = constraintsOf(ctx).find((c) => c.kind === 'pin' && c.unit === unit);
    return pin?.kind === 'pin' ? pin.cell : undefined;
}

export function zkarPin(ctx: Context): Cell | undefined {
    const pin = constraintsOf(ctx).find((c) => c.kind === 'zkarAt');
    return pin?.kind === 'zkarAt' ? pin.cell : undefined;
}

const level = (ctx: Context, cells: readonly Cell[]): number => Math.max(...cells.map((c) => ctx.board.hexAt(c)?.elevation ?? 0));

/** Whether `unit`'s turn (its attack, or passing instead) may happen now: where it stands, and who has already had their turn. */
function turnOk(ctx: Context, state: State, unit: UnitId): boolean {
    const me = state.units[unit];
    if (!me) return true;
    const others = unitIds(state).filter((u) => u !== unit);
    for (const c of constraintsOf(ctx)) {
        switch (c.kind) {
            case 'pin':
                if (c.unit === unit && cellKey(me.cell) !== cellKey(c.cell)) return false;
                break;
            case 'order':
                if (c.unit === unit) {
                    // First: nobody has had their turn. Last: everybody has.
                    if (c.position === 'first' ? others.some((o) => state.units[o]!.attacked) : others.some((o) => !state.units[o]!.attacked)) return false;
                } else if (c.position === 'first' && state.units[c.unit] && !state.units[c.unit]!.attacked) {
                    return false; // the one who goes first hasn't
                }
                break;
            case 'before':
                if (c.unit === unit && state.units[c.other]?.attacked) return false;
                if (c.other === unit && state.units[c.unit] && !state.units[c.unit]!.attacked) return false;
                break;
        }
    }
    return true;
}

/** The extra conditions on the moment of an attack: where the attacker stands in relation to the boss and to others. */
function attackPositionOk(ctx: Context, state: State, unit: UnitId): boolean {
    const me = state.units[unit];
    if (!me) return true;
    for (const c of constraintsOf(ctx)) {
        if (!('unit' in c) || c.unit !== unit) continue;
        if (c.kind === 'nextToBoss' && !adjacent(ctx.board, [me.cell], state.bossCells)) return false;
        if (c.kind === 'highGround' && !(level(ctx, [me.cell]) > level(ctx, state.bossCells))) return false;
        if (c.kind === 'adjacent') {
            const there = c.other === 'zkar' ? state.zkar?.cells : state.units[c.other] ? [state.units[c.other]!.cell] : undefined;
            if (!there || !adjacent(ctx.board, [me.cell], there)) return false;
        }
    }
    return true;
}

/** Whether `action`, taken in `state`, keeps to every rule. */
export function allows(ctx: Context, state: State, action: Action): boolean {
    const cs = constraintsOf(ctx);
    if (cs.length === 0) return true;
    switch (action.type) {
        case 'move': {
            const pin = pinnedCell(ctx, action.unit);
            return pin === undefined || cellKey(pin) === cellKey(action.to);
        }
        case 'pass':
            return !cs.some((c) => c.kind === 'mustAttack' && c.unit === action.unit) && turnOk(ctx, state, action.unit);
        case 'attack':
            return (
                !cs.some((c) => (c.kind === 'mustNotAttack' && c.unit === action.unit) || (c.kind === 'attackKind' && c.unit === action.unit && c.attack !== action.kind)) &&
                turnOk(ctx, state, action.unit) &&
                attackPositionOk(ctx, state, action.unit)
            );
        case 'deploy': {
            const pin = zkarPin(ctx);
            return pin === undefined || cellKey(pin) === cellKey(action.at);
        }
        case 'abaddonActive':
            return true;
    }
}

/** Whether a finished round has done everything the rules demand (Z'kar deployed where it says, for one). */
export function satisfied(ctx: Context, state: State): boolean {
    return zkarPin(ctx) === undefined || state.zkar !== undefined;
}

/** `order` with the rules about who attacks first, last or before whom applied (otherwise unchanged). */
export function arrange(ctx: Context, order: readonly UnitId[]): UnitId[] {
    const out = [...order];
    const move = (unit: UnitId, to: number) => {
        const i = out.indexOf(unit);
        if (i < 0) return;
        out.splice(i, 1);
        out.splice(Math.max(0, Math.min(out.length, to)), 0, unit);
    };
    for (let pass = 0; pass < 3; pass++) {
        for (const c of constraintsOf(ctx)) {
            if (c.kind === 'order') move(c.unit, c.position === 'first' ? 0 : out.length);
            if (c.kind === 'before' && out.includes(c.unit) && out.includes(c.other) && out.indexOf(c.unit) > out.indexOf(c.other)) move(c.unit, out.indexOf(c.other));
        }
    }
    return out;
}

/** How many times a whole plan breaks the rules (0 = it keeps to them all). Replays it, so it is for checking, not for the search. */
export function violationsOf(ctx: Context, actions: readonly Action[]): number {
    let state = initialState(ctx.setup);
    let broken = 0;
    for (const action of actions) {
        if (!allows(ctx, state, action)) broken++;
        const result = applyAction(ctx, state, action);
        if (!result) throw new Error(`illegal action: ${JSON.stringify(action)}`);
        state = result.state;
    }
    return broken + (satisfied(ctx, state) ? 0 : 1);
}
