import { Cell, cellKey, distance } from '../core/hex';
import { UnitId } from '../core/setup';
import { legalMoves } from '../engine/movement';
import { Context, Enemy, State, distanceBetween, enemyCells, listEnemies, unitIds } from '../engine/state';
import { ATTACKS } from '../engine/units';

/** The farthest (in hexes) a character can attack. Melee is distance 1. */
export function attackRange(unit: UnitId): number {
    return Math.max(1, ...ATTACKS[unit].map((a) => (a.melee ? 1 : a.range)));
}

/** What the search needs to know about a state, worked out once: where each unfinished character can move, and from where it could attack. */
export interface Analysis {
    enemies: Enemy[];
    enemyCellLists: Cell[][];
    moves: Partial<Record<UnitId, Cell[]>>;
    /** The hexes (its own and the ones it can move to) from which each unfinished character could attack something. */
    attackCells: Partial<Record<UnitId, Cell[]>>;
    /** Unfinished characters that could attack from somewhere. */
    mayAttack: Set<UnitId>;
}

export function analyse(ctx: Context, state: State): Analysis {
    const enemies = listEnemies(state);
    const enemyCellLists = enemies.map((e) => enemyCells(state, e));
    const moves: Analysis['moves'] = {};
    const attackCells: Analysis['attackCells'] = {};
    const mayAttack = new Set<UnitId>();
    for (const unit of unitIds(state)) {
        const u = state.units[unit]!;
        if (u.attacked) continue;
        const range = attackRange(unit);
        const reach = (c: Cell) => enemyCellLists.some((cells) => distanceBetween([c], cells) <= range);
        const own = u.moved ? [] : legalMoves(ctx.board, state, unit);
        moves[unit] = own;
        attackCells[unit] = [u.cell, ...own].filter(reach);
        if (attackCells[unit]!.length > 0) mayAttack.add(unit);
    }
    return { enemies, enemyCellLists, moves, attackCells, mayAttack };
}

/** Things that don't change during a search: the hexes near the enemy, where Z'kar's triangle and anyone who helps him must be. */
export interface Statics {
    /** Hexes Z'kar's footprint could cover and still reach an enemy (within 2 of one). */
    zkarZone: Cell[];
    /** Hexes a deploy click could be on: any hex of such a footprint, so within 4 of an enemy. */
    deployCandidates: Cell[];
    /** Whether any hex is higher than the highest enemy, so whether high ground can happen at all. */
    highGroundPossible: boolean;
}

export function makeStatics(ctx: Context, state: State): Statics {
    const enemies = listEnemies(state).map((e) => enemyCells(state, e));
    const near = (c: Cell, d: number) => enemies.some((cells) => distanceBetween([c], cells) <= d);
    const cells = ctx.board.hexes.filter((h) => h.passable).map((h) => h.cell);
    const top = Math.max(0, ...enemies.flat().map((c) => ctx.board.hexAt(c)?.elevation ?? 0));
    return {
        zkarZone: cells.filter((c) => near(c, 2)),
        deployCandidates: cells.filter((c) => near(c, 4)),
        highGroundPossible: ctx.board.hexes.some((h) => h.passable && h.elevation > top),
    };
}

export const keysOf = (cells: readonly Cell[]): Set<string> => new Set(cells.map(cellKey));
export { distance };
