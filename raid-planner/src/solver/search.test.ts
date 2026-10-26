import { describe, expect, it } from 'vitest';
import { cellKey } from '../core/hex';
import { runPlan } from '../engine/plan';
import { go, scenario } from '../engine/testkit';
import { COUNTER, makeCounters, readProgress, requestStop } from './counters';
import { search } from './search';
import { allDone, legalActions } from './actions';
import { initialState } from '../engine/state';

// A tiny board with one character so the whole search finishes at once.
const small = (o: Parameters<typeof scenario>[0] = {}) => scenario({ cols: 6, rows: 6, boss: [{ col: 3, row: 4 }], units: { abaddon: { col: 3, row: 2 } }, ...o });

describe('the exhaustive search', () => {
    it('searches every sequence: the counters agree when it finishes', () => {
        const { ctx } = small();
        const counters = makeCounters();
        const result = search(ctx, counters);
        const p = readProgress(counters);
        expect(result.stopped).toBe(false);
        expect(p.status).toBe('done');
        expect(p.searched).toBe(p.planned);
        expect(p.planned).toBeGreaterThan(100n);
        expect(p.complete).toBeGreaterThan(0n);
        expect(p.bestScore).toBe(result.bestScore);
        expect(p.bestRuns).toBe(BigInt(result.plans.length));
    });

    it('finds plans at least as good as one made by hand, and every stored plan replays to its score', () => {
        const { ctx } = small();
        const result = search(ctx, makeCounters());
        const byHand = runPlan(ctx, [
            { type: 'move', unit: 'abaddon', to: { col: 3, row: 3 } },
            { type: 'attack', unit: 'abaddon', kind: 'melee', target: { kind: 'boss' } },
        ]);
        expect(result.bestScore!).toBeGreaterThanOrEqual(byHand.total);
        for (const plan of result.plans) {
            const replay = runPlan(ctx, plan.actions);
            expect(replay.total).toBe(plan.total);
            expect(plan.total).toBe(result.bestScore);
        }
    });

    it('keeps one plan per outcome: same buffs and same final hexes are not listed twice', () => {
        const { ctx } = small();
        const result = search(ctx, makeCounters());
        const signatures = result.plans.map((p) => p.signature);
        expect(new Set(signatures).size).toBe(signatures.length);
    });

    it('can be asked to stop part way, and says so', () => {
        const { ctx } = small();
        const counters = makeCounters();
        let calls = 0;
        const result = search(ctx, counters, { batch: 16, shouldStop: () => ++calls > 3 });
        expect(result.stopped).toBe(true);
        expect(readProgress(counters).status).toBe('stopped');
        expect(readProgress(counters).searched).toBeLessThan(readProgress(counters).planned);
    });

    it('stops when the cancel flag is set in the shared counters', () => {
        const { ctx } = small();
        const counters = makeCounters();
        requestStop(counters);
        const result = search(ctx, counters, { batch: 1 });
        expect(result.stopped).toBe(true);
        expect(Atomics.load(counters, COUNTER.cancel)).toBe(1n);
    });

    it('grows the planned count as it goes and never lets searched pass it', () => {
        const { ctx } = small();
        const counters = makeCounters();
        const seen: Array<[bigint, bigint]> = [];
        search(ctx, counters, {
            batch: 64,
            shouldStop: () => {
                const p = readProgress(counters);
                seen.push([p.searched, p.planned]);
                return false;
            },
        });
        expect(seen.length).toBeGreaterThan(3);
        for (let i = 1; i < seen.length; i++) {
            expect(seen[i][1]).toBeGreaterThanOrEqual(seen[i - 1][1]);
            expect(seen[i][0]).toBeLessThanOrEqual(seen[i][1]);
        }
        expect(seen[seen.length - 1][1]).toBeGreaterThan(seen[0][1]);
    });

    it("never plans Abaddon's active when the setup says he won't use it, and may when it is available", () => {
        const off = small({ abaddonExtra: 'off' });
        const state = initialState(off.setup);
        expect(legalActions(off.ctx, state).some((a) => a.type === 'abaddonActive')).toBe(false);
        const available = small({ abaddonExtra: 'available' });
        expect(legalActions(available.ctx, initialState(available.setup)).some((a) => a.type === 'abaddonActive')).toBe(true);
        // Already active: nothing to plan.
        const on = small({ abaddonExtra: 'on' });
        expect(legalActions(on.ctx, initialState(on.setup)).some((a) => a.type === 'abaddonActive')).toBe(false);
    });

    it('a plan is complete once every character has finished, and Z\'kar may still be deployed after that', () => {
        const { ctx } = small();
        const state = initialState(ctx.setup);
        expect(allDone(state)).toBe(false);
        const passed = { ...state, units: { abaddon: { ...state.units.abaddon!, attacked: true } } };
        expect(allDone(passed)).toBe(true);
        expect(legalActions(ctx, passed).every((a) => a.type === 'deploy')).toBe(true);
    });

    it('prefers plans where Z\'kar helps: the best plan here deploys him', () => {
        const { ctx } = small({ units: { abaddon: go({ col: 3, row: 4 }, 'S', 1) } });
        const result = search(ctx, makeCounters());
        expect(result.plans.every((p) => p.actions.some((a) => a.type === 'deploy'))).toBe(true);
        expect(result.plans.length).toBeGreaterThan(0);
        void cellKey;
    });
});
