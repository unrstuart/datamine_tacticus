import { Cell } from '../core/hex';
import { UnitId } from '../core/setup';
import { AttackReport } from '../engine/attacks';
import { Action } from '../engine/plan';
import { Context, State, adjacent, enemyCells, isFire, listEnemies, unitIds } from '../engine/state';
import { relicValue } from '../engine/calc';
import { Analysis } from './analysis';

// Rules of thumb for which action to try first. They only reorder the search (every action is still tried), so the best plan is
// found sooner when they are right, and nothing is lost when they are wrong. Higher is earlier.

const W = { neuroTooSoon: -10000, abaddonAttack: 500, ahrimanLightsFire: 400, intoMelee: 300, highGround: 200, bookHolder: 150, modifier: 40, nearZkar: 30, pass: -200 };

const BOOK_HOLDERS: UnitId[] = ['archimatos', 'abraxas'];

/** The best a hex of this footprint stands above the boss: whether it is high ground against it. */
const onHighGround = (ctx: Context, state: State, cells: readonly Cell[]): boolean => {
    const level = (cs: readonly Cell[]) => Math.max(...cs.map((c) => ctx.board.hexAt(c)?.elevation ?? 0));
    return level(cells) > level(state.bossCells);
};

/** How many different modifiers (high ground, fire, Z'kar's adjacency bonus) the attack's hits on the boss got. */
const modifiersOn = (reports: readonly AttackReport[], actor: string): number => {
    const mine = reports.find((r) => r.actor === actor);
    const ids = new Set<string>();
    for (const g of mine?.groups ?? []) if (g.target.kind === 'boss') for (const m of g.modifiers) ids.add(m.id);
    return ids.size;
};

/**
 * How promising `action` looks, judged from the state before it (`state`, `an`) and after (`next`, with its `reports`).
 *   - Abaddon attacks first, then Ahriman when nothing is burning (he lights the fire the rest profit from).
 *   - Neurothrope goes last, and goes to high ground.
 *   - Abaddon and Archimatos get into melee range.
 *   - Z'kar goes on high ground and where every Book of Fate holder can attack while standing next to him.
 *   - Attacks that carry more modifiers come first.
 */
export function hintScore(ctx: Context, state: State, an: Analysis, action: Action, next: State, reports: readonly AttackReport[]): number {
    let score = 0;
    const unit = 'unit' in action ? action.unit : undefined;
    if (unit === 'neurothrope' && unitIds(state).some((u) => u !== 'neurothrope' && !state.units[u]!.attacked)) score += W.neuroTooSoon;
    const burning = Object.values(state.effects).some((e) => isFire(e));

    switch (action.type) {
        case 'pass':
            score += W.pass;
            break;
        case 'attack':
            if (unit === 'abaddon') score += W.abaddonAttack;
            else if (unit === 'ahriman' && !burning) score += W.ahrimanLightsFire;
            score += W.modifier * modifiersOn(reports, unit!);
            break;
        case 'move': {
            const to = [action.to];
            if ((unit === 'abaddon' || unit === 'archimatos') && listEnemies(next).some((e) => adjacent(ctx.board, to, enemyCells(next, e)))) score += W.intoMelee;
            if (unit === 'ahriman' && !burning && an.attackCells.ahriman?.some((c) => c.col === action.to.col && c.row === action.to.row)) score += W.ahrimanLightsFire / 2;
            if (onHighGround(ctx, state, to)) score += unit === 'neurothrope' ? W.highGround : W.highGround / 4;
            if (next.zkar && adjacent(ctx.board, to, next.zkar.cells)) score += W.nearZkar;
            break;
        }
        case 'deploy': {
            const z = next.zkar?.cells;
            if (!z) break;
            if (onHighGround(ctx, state, z)) score += W.highGround;
            // Each holder that could attack from a hex beside Z'kar (its own, or one it can move to).
            for (const holder of BOOK_HOLDERS) {
                if (!state.units[holder] || relicValue(ctx, holder, 'extraDmg') === undefined) continue;
                const from = an.attackCells[holder] ?? (state.units[holder]!.attacked ? [state.units[holder]!.cell] : []);
                if (from.some((c) => adjacent(ctx.board, [c], z) && !z.some((zc) => zc.col === c.col && zc.row === c.row))) score += W.bookHolder;
            }
            break;
        }
    }
    return score;
}
