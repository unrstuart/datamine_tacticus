import { describe, expect, it } from 'vitest';
import { Constraint } from '../core/constraints';
import { cellKey } from '../core/hex';
import { UnitId } from '../core/setup';
import { Action, runPlan } from '../engine/plan';
import { initialState } from '../engine/state';
import { go, scenario } from '../engine/testkit';
import { localSearch } from './local';
import { makeCounters } from './counters';
import { search } from './search';
import { allows, arrange, satisfied, violationsOf } from './rules';

const boss = { col: 4, row: 6 };
const south = (n: number) => go(boss, 'S', n);
const BOSS = { kind: 'boss' } as const;
const make = (constraints: Constraint[], units: Parameters<typeof scenario>[0] extends infer O ? (O extends { units?: infer U } ? U : never) : never = { abaddon: south(3), archimatos: south(4), ahriman: go(south(4), 'SE', 1) }) =>
    scenario({ cols: 9, rows: 10, boss: [boss], units, abaddonExtra: 'off', constraints });
const attack = (unit: UnitId, kind: 'melee' | 'ranged' | 'active' = 'ranged'): Action => ({ type: 'attack', unit, kind, target: BOSS });

describe('allows', () => {
    it('a pin lets its character move only there, and attack or pass only from there', () => {
        const { ctx, state } = make([{ kind: 'pin', unit: 'archimatos', cell: south(2) }]);
        expect(allows(ctx, state, { type: 'move', unit: 'archimatos', to: south(2) })).toBe(true);
        expect(allows(ctx, state, { type: 'move', unit: 'archimatos', to: south(3) })).toBe(false);
        expect(allows(ctx, state, attack('archimatos'))).toBe(false); // still at its start
        expect(allows(ctx, state, { type: 'pass', unit: 'archimatos' })).toBe(false);
        expect(allows(ctx, state, { type: 'move', unit: 'ahriman', to: south(3) })).toBe(true); // others are free
    });

    it('a pin on the hex it starts on keeps it from moving at all', () => {
        const { ctx, state } = make([{ kind: 'pin', unit: 'archimatos', cell: south(4) }]);
        expect(allows(ctx, state, { type: 'move', unit: 'archimatos', to: south(3) })).toBe(false);
        expect(allows(ctx, state, { type: 'pass', unit: 'archimatos' })).toBe(true);
    });

    it('must attack forbids passing; must not attack forbids attacking; an attack kind forbids the other kinds', () => {
        const a = make([{ kind: 'mustAttack', unit: 'abaddon' }, { kind: 'mustNotAttack', unit: 'ahriman' }, { kind: 'attackKind', unit: 'archimatos', attack: 'ranged' }]);
        expect(allows(a.ctx, a.state, { type: 'pass', unit: 'abaddon' })).toBe(false);
        expect(allows(a.ctx, a.state, attack('abaddon', 'melee'))).toBe(true);
        expect(allows(a.ctx, a.state, attack('ahriman'))).toBe(false);
        expect(allows(a.ctx, a.state, { type: 'pass', unit: 'ahriman' })).toBe(true);
        expect(allows(a.ctx, a.state, attack('archimatos', 'melee'))).toBe(false);
        expect(allows(a.ctx, a.state, attack('archimatos', 'ranged'))).toBe(true);
    });

    it('first, last and before are about who has had their turn', () => {
        const a = make([{ kind: 'order', unit: 'abaddon', position: 'first' }]);
        expect(allows(a.ctx, a.state, attack('abaddon', 'melee'))).toBe(true);
        expect(allows(a.ctx, a.state, attack('archimatos'))).toBe(false); // Abaddon hasn't gone
        const after = runPlan(a.ctx, [{ type: 'pass', unit: 'abaddon' }]);
        expect(allows(a.ctx, { ...after.final }, attack('archimatos'))).toBe(true);

        const b = make([{ kind: 'order', unit: 'archimatos', position: 'last' }]);
        expect(allows(b.ctx, b.state, attack('archimatos'))).toBe(false);
        const c = make([{ kind: 'before', unit: 'ahriman', other: 'archimatos' }]);
        expect(allows(c.ctx, c.state, attack('archimatos'))).toBe(false);
        expect(allows(c.ctx, c.state, attack('ahriman'))).toBe(true);
    });

    it('next to the boss, high ground and next to someone are about where the attacker stands when it attacks', () => {
        const near = make([{ kind: 'nextToBoss', unit: 'abaddon' }], { abaddon: south(1) });
        expect(allows(near.ctx, near.state, attack('abaddon', 'melee'))).toBe(true);
        const far = make([{ kind: 'nextToBoss', unit: 'abaddon' }], { abaddon: south(3) });
        expect(allows(far.ctx, far.state, attack('abaddon', 'ranged'))).toBe(false);

        const hill = make([{ kind: 'highGround', unit: 'abaddon' }], { abaddon: south(2) });
        expect(allows(hill.ctx, hill.state, attack('abaddon', 'ranged'))).toBe(false); // the board is flat

        const next = make([{ kind: 'adjacent', unit: 'archimatos', other: 'ahriman' }], { archimatos: south(2), ahriman: go(south(2), 'SE', 1) });
        expect(allows(next.ctx, next.state, attack('archimatos'))).toBe(true);
        const apart = make([{ kind: 'adjacent', unit: 'archimatos', other: 'ahriman' }], { archimatos: south(2), ahriman: south(5) });
        expect(allows(apart.ctx, apart.state, attack('archimatos'))).toBe(false);
        const zkar = make([{ kind: 'adjacent', unit: 'archimatos', other: 'zkar' }], { archimatos: south(2) });
        expect(allows(zkar.ctx, zkar.state, attack('archimatos'))).toBe(false); // he isn't deployed
    });

    it("Z'kar's pin allows deploying only there, and the round isn't complete without him", () => {
        const { ctx, state } = make([{ kind: 'zkarAt', cell: south(5) }]);
        expect(allows(ctx, state, { type: 'deploy', at: south(5) })).toBe(true);
        expect(allows(ctx, state, { type: 'deploy', at: south(6) })).toBe(false);
        expect(satisfied(ctx, state)).toBe(false);
    });

    it('does nothing when there are no rules', () => {
        const { ctx, state } = make([]);
        expect(allows(ctx, state, { type: 'move', unit: 'archimatos', to: south(3) })).toBe(true);
        expect(violationsOf(ctx, [])).toBe(0);
    });
});

describe('arrange', () => {
    it('puts the first one first, the last one last, and a before-pair in order', () => {
        const { ctx } = make([{ kind: 'order', unit: 'ahriman', position: 'first' }, { kind: 'order', unit: 'abaddon', position: 'last' }, { kind: 'before', unit: 'archimatos', other: 'abaddon' }]);
        expect(arrange(ctx, ['abaddon', 'archimatos', 'ahriman'])).toEqual(['ahriman', 'archimatos', 'abaddon']);
        expect(arrange(make([]).ctx, ['abaddon', 'archimatos'])).toEqual(['abaddon', 'archimatos']);
    });
});

describe('searches keep to the rules', () => {
    const two = { archimatos: south(4), ahriman: go(south(4), 'SE', 1) };
    const check = (constraints: Constraint[], units: Parameters<typeof make>[1] = two, total = 10) => {
        const { ctx } = make(constraints, units);
        const exact = search(ctx, makeCounters(), { top: total });
        const local = localSearch(ctx, makeCounters(), { evaluations: 4000, runLength: 600, top: total });
        return { ctx, exact, local };
    };

    it('exhaustive: every plan has the pinned character on its hex, and the unpinned best is not worse', { timeout: 120000 }, () => {
        const pin: Constraint = { kind: 'pin', unit: 'archimatos', cell: south(2) };
        const { ctx, exact } = check([pin]);
        expect(exact.plans.length).toBeGreaterThan(0);
        for (const p of exact.plans) {
            expect(violationsOf(ctx, p.actions)).toBe(0);
            expect(cellKey(runPlan(ctx, p.actions).final.units.archimatos!.cell)).toBe(cellKey(south(2)));
        }
        const free = search(make([], two).ctx, makeCounters(), { top: 10 });
        expect(exact.bestScore!).toBeLessThanOrEqual(free.bestScore! + 1e-6);
    });

    it('local: the same, and it finds a plan as good as the exhaustive one on this small map', { timeout: 120000 }, () => {
        const { ctx, exact, local } = check([{ kind: 'pin', unit: 'archimatos', cell: south(2) }, { kind: 'order', unit: 'ahriman', position: 'last' }]);
        expect(local.plans.length).toBeGreaterThan(0);
        for (const p of local.plans) expect(violationsOf(ctx, p.actions)).toBe(0);
        expect(local.bestScore!).toBeGreaterThanOrEqual(exact.bestScore! - 1e-6);
    });

    it("both find nothing when the rules can't all hold, and say so by returning no plans", { timeout: 120000 }, () => {
        const impossible: Constraint[] = [{ kind: 'pin', unit: 'archimatos', cell: go(boss, 'N', 4) }];
        const { exact, local } = check(impossible);
        expect(exact.plans).toEqual([]);
        expect(local.plans).toEqual([]);
    });

    it("exhaustive honours a rule about Abaddon, which turns off 'Abaddon first'", { timeout: 120000 }, () => {
        const { ctx, exact } = check([{ kind: 'order', unit: 'abaddon', position: 'last' }], { abaddon: south(3), archimatos: south(4) });
        expect(exact.plans.length).toBeGreaterThan(0);
        for (const p of exact.plans) {
            const attackers = p.actions.filter((a) => a.type === 'attack' || a.type === 'pass').map((a) => (a as { unit: UnitId }).unit);
            expect(attackers.at(-1)).toBe('abaddon');
            expect(violationsOf(ctx, p.actions)).toBe(0);
        }
    });

    it("exhaustive deploys Z'kar on a pinned hex even where no enemy is within his reach", { timeout: 120000 }, () => {
        const far = south(5);
        const { ctx } = make([{ kind: 'zkarAt', cell: far }], { archimatos: south(4) });
        const r = search(ctx, makeCounters(), { top: 5 });
        expect(r.plans.length).toBeGreaterThan(0);
        for (const p of r.plans) {
            expect(violationsOf(ctx, p.actions)).toBe(0);
            expect(p.actions.some((a) => a.type === 'deploy')).toBe(true);
        }
    });

    it('state is still initial for the check', () => {
        const { ctx } = make([]);
        expect(initialState(ctx.setup).units.abaddon).toBeDefined();
    });
});
