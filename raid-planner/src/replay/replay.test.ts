import { describe, expect, it } from 'vitest';
import { cellKey, neighbors } from '../core/hex';
import { movePath } from '../engine/movement';
import { summonFootprint } from '../core/zkar';
import { Action, legalDeploys, runPlan } from '../engine/plan';
import { adjacent, distanceBetween, occupiedKeys } from '../engine/state';
import { go, scenario } from '../engine/testkit';
import { buildReplay } from './replay';
import { DURATION, along, sceneAt, timeline } from './timeline';

const boss = { col: 6, row: 10 };
const south = (n: number) => go(boss, 'S', n);
const BOSS = { kind: 'boss' } as const;

describe('movePath', () => {
    it('is a shortest route of neighbouring hexes ending at the destination', () => {
        const { ctx, state } = scenario({ boss: [boss], units: { archimatos: south(5) } });
        const to = south(2);
        const path = movePath(ctx.board, state, 'archimatos', to)!;
        expect(path.at(-1)).toEqual(to);
        expect(path.length).toBe(3);
        let at = state.units.archimatos!.cell;
        for (const step of path) {
            expect(neighbors(at).some((n) => cellKey(n) === cellKey(step))).toBe(true);
            at = step;
        }
    });

    it('is undefined for a hex it cannot reach', () => {
        const { ctx, state } = scenario({ boss: [boss], units: { archimatos: south(5) } });
        expect(movePath(ctx.board, state, 'archimatos', go(boss, 'N', 3))).toBeUndefined();
    });
});

describe('buildReplay', () => {
    const plan = (): { ctx: ReturnType<typeof scenario>['ctx']; actions: Action[] } => {
        const { ctx } = scenario({ boss: [boss], units: { abaddon: south(3), archimatos: go(south(3), 'SE', 1), abraxas: go(south(3), 'S', 1) }, abaddonExtra: 'available' });
        const head: Action[] = [
            { type: 'move', unit: 'abaddon', to: south(1) },
            { type: 'abaddonActive' },
            { type: 'attack', unit: 'abaddon', kind: 'melee', target: BOSS, extra: BOSS },
            { type: 'pass', unit: 'abraxas' },
            { type: 'move', unit: 'archimatos', to: south(2) },
        ];
        // Z'kar lands beside Archimatos and within reach of the boss, wherever a triangle fits.
        const state = runPlan(ctx, head).final;
        const at = legalDeploys(ctx, state).find((c) => {
            const cells = summonFootprint(ctx.board, occupiedKeys(state), c)!;
            return adjacent(ctx.board, cells, [state.units.archimatos!.cell]) && cells.some((x) => distanceBetween([x], [boss]) <= 2);
        })!;
        return { ctx, actions: [...head.slice(0, 4), { type: 'deploy', at }, head[4], { type: 'attack', unit: 'archimatos', kind: 'ranged', target: BOSS }] };
    };

    it('starts at the layout, and gives each action that does something a frame (a pass has none)', () => {
        const { ctx, actions } = plan();
        const r = buildReplay(ctx, actions);
        expect(r.frames[0]).toMatchObject({ kind: 'start', beats: [], damage: 0 });
        // start, move, (active + attack), deploy, move, attack, end of round
        expect(r.frames.map((f) => f.kind + ':' + (f.icon ?? ''))).toEqual(expect.arrayContaining(['start:', 'action:abaddon', 'action:zkar', 'action:archimatos']));
        expect(r.frames.filter((f) => f.kind === 'action').length).toBe(5);
    });

    it("Abaddon's active and the attack after it are one frame: the glow, then each melee hit", () => {
        const { ctx, actions } = plan();
        const f = buildReplay(ctx, actions).frames.find((x) => x.actions.some((a) => a.type === 'abaddonActive'))!;
        expect(f.actions.map((a) => a.type)).toEqual(['abaddonActive', 'attack']);
        expect(f.beats.map((b) => b.kind)).toEqual(['active', 'attack', 'attack']);
        expect(f.icon).toBe('abaddon');
    });

    it('a move is a walk along its path, and the frame ends with the unit there', () => {
        const { ctx, actions } = plan();
        const r = buildReplay(ctx, actions);
        const f = r.frames.find((x) => x.actions[0]?.type === 'move' && (x.actions[0] as { unit: string }).unit === 'archimatos')!;
        const walk = f.beats[0];
        expect(walk.kind).toBe('move');
        expect(f.after.units.archimatos!.cell).toEqual(south(2));
        expect(f.before.units.archimatos!.cell).not.toEqual(south(2));
    });

    it("a book holder's attack that sets Z'kar off shows both, with Z'kar's badge on the frame", () => {
        const { ctx, actions } = plan();
        const f = buildReplay(ctx, actions).frames.find((x) => x.icon === 'archimatos' && x.beats.some((b) => b.kind === 'attack'))!;
        const attackers = f.beats.filter((b) => b.kind === 'attack').map((b) => b.actor);
        expect(attackers).toEqual(['archimatos', 'zkar']);
        expect(f.badge).toBe('zkar');
    });

    it("the damage list is every attack in order, and its damage adds up to the plan's", () => {
        const { ctx, actions } = plan();
        const r = buildReplay(ctx, actions);
        const total = r.series.reduce((s, e) => s + e.report.damage, 0);
        expect(total).toBeCloseTo(runPlan(ctx, actions).total, 6);
        expect(r.series.map((e) => e.frame)).toEqual([...r.series.map((e) => e.frame)].sort((a, b) => a - b));
    });

    it("ends with Z'kar's attack at the start of the next round, and the last frame's state is the plan's final one", () => {
        const { ctx, actions } = plan();
        const r = buildReplay(ctx, actions);
        const end = r.frames.at(-1)!;
        expect(end.kind).toBe('end');
        expect(end.beats.map((b) => b.kind)).toContain('attack');
        expect(end.after).toEqual(runPlan(ctx, actions).final);
    });
});

describe('timeline', () => {
    const frame = () => {
        const { ctx } = scenario({ boss: [boss], units: { abaddon: south(3) }, abaddonExtra: 'available' });
        return buildReplay(ctx, [{ type: 'move', unit: 'abaddon', to: south(1) }, { type: 'abaddonActive' }, { type: 'attack', unit: 'abaddon', kind: 'melee', target: BOSS, extra: BOSS }]).frames;
    };

    it('plays a frame\'s beats one after another', () => {
        const f = frame()[2];
        const { items, total } = timeline(f);
        expect(items.map((i) => i.beat.kind)).toEqual(['active', 'attack', 'attack']);
        for (let i = 1; i < items.length; i++) expect(items[i].start).toBe(items[i - 1].end);
        expect(total).toBeGreaterThanOrEqual(items.at(-1)!.end);
    });

    it('moves a walker along its route over the move\'s time, then holds it at the end', () => {
        const f = frame()[1];
        expect(sceneAt(f, 0).walkers[0].progress).toBe(0);
        expect(sceneAt(f, DURATION.move / 2).walkers[0].progress).toBeCloseTo(0.5, 6);
        expect(sceneAt(f, DURATION.move + 100).walkers[0].progress).toBe(1);
    });

    it('glows during the active, nudges during an attack and shows its damage number, which is gone after it fades', () => {
        const f = frame()[2];
        expect(sceneAt(f, 10).glows.length).toBe(1);
        expect(sceneAt(f, DURATION.active + DURATION.attack / 2).nudges[0].amount).toBeCloseTo(1, 6);
        const pop = sceneAt(f, DURATION.active + 100).pops[0];
        expect(pop.damage).toBeGreaterThan(0);
        expect(pop.age).toBeGreaterThan(0);
        expect(sceneAt(f, timeline(f).total + 1).pops).toEqual([]);
    });

    it('walks along a route by hexes', () => {
        const route = [south(3), south(2), south(1)];
        expect(along(route, 0)).toMatchObject({ from: route[0], to: route[1], fraction: 0 });
        expect(along(route, 0.75)).toMatchObject({ from: route[1], to: route[2] });
        expect(along(route, 0.75).fraction).toBeCloseTo(0.5, 6);
        expect(along(route, 1)).toMatchObject({ from: route[1], to: route[2], fraction: 1 });
    });
});
