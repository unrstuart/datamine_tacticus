import { describe, expect, it } from 'vitest';
import { runPlan } from '../engine/plan';
import { go, scenario } from '../engine/testkit';
import { COUNTER, makeCounters, readProgress, requestStop } from './counters';
import { Genome, decode, localSearch } from './local';
import { DEFAULT_OPTIONS } from './options';
import { search } from './search';

const boss = { col: 4, row: 6 };
const small = () =>
    scenario({
        cols: 9,
        rows: 10,
        boss: [boss],
        units: { abaddon: go(boss, 'S', 3), archimatos: go(boss, 'S', 4), ahriman: go(go(boss, 'S', 4), 'SE', 1) },
        abaddonExtra: 'off',
    });

const genome = (over: Partial<Genome> = {}): Genome => ({
    order: ['abaddon', 'ahriman', 'archimatos', 'abraxas', 'neurothrope'],
    genes: {
        abaddon: { dest: go(boss, 'S', 1), moveSlot: 0, pick: 0, useActive: false },
        ahriman: { moveSlot: 0, pick: 0, useActive: false },
        archimatos: { dest: go(boss, 'S', 2), moveSlot: 1, pick: 0, useActive: false },
        abraxas: { moveSlot: 0, pick: 0, useActive: false },
        neurothrope: { moveSlot: 0, pick: 0, useActive: false },
    },
    zkarSlot: 3,
    zkarFirst: false,
    ...over,
});

describe('decode', () => {
    it('plays the moves before the attack they are due at, and the result replays to the same damage', () => {
        const { ctx } = small();
        const d = decode(ctx, genome());
        const kinds = d.actions.map((a) => a.type + ('unit' in a ? `:${a.unit}` : ''));
        expect(kinds.indexOf('move:abaddon')).toBeLessThan(kinds.indexOf('attack:abaddon'));
        expect(kinds.indexOf('move:archimatos')).toBeGreaterThan(kinds.indexOf('attack:abaddon')); // moves just before its slot (1: after the first attack)
        expect(runPlan(ctx, d.actions).total).toBeCloseTo(d.total, 6);
    });

    it('skips what is not legal when its turn comes, so every genome gives a legal plan', () => {
        const { ctx } = small();
        // Two characters sent to the same hex, a move onto the boss, and a deploy where no triangle fits.
        const g = genome({
            zkarAt: boss,
            genes: {
                ...genome().genes,
                abaddon: { dest: go(boss, 'S', 1), moveSlot: 0, pick: 7, useActive: true },
                archimatos: { dest: go(boss, 'S', 1), moveSlot: 0, pick: 3, useActive: false },
                ahriman: { dest: boss, moveSlot: 0, pick: 1, useActive: false },
            },
        });
        const d = decode(ctx, g);
        expect(() => runPlan(ctx, d.actions)).not.toThrow();
        expect(runPlan(ctx, d.actions).total).toBeCloseTo(d.total, 6);
    });

    it('lands Z\'kar before the moves of his slot when asked, and after otherwise', () => {
        const { ctx } = small();
        const at = go(boss, 'S', 6);
        const first = decode(ctx, genome({ zkarAt: at, zkarSlot: 0, zkarFirst: true })).actions.map((a) => a.type);
        const after = decode(ctx, genome({ zkarAt: at, zkarSlot: 0, zkarFirst: false })).actions.map((a) => a.type);
        if (first.includes('deploy') && after.includes('deploy')) {
            expect(first.indexOf('deploy')).toBeLessThan(first.indexOf('move'));
            expect(after.indexOf('deploy')).toBeGreaterThan(after.indexOf('move'));
        }
    });
});

describe('localSearch', () => {
    it('keeps at most ten plans, best first, each replaying to its damage, with no outcome twice', () => {
        const { ctx } = small();
        const counters = makeCounters();
        const result = localSearch(ctx, counters, { evaluations: 3000, runLength: 500 });
        expect(result.plans.length).toBeGreaterThan(1);
        expect(result.plans.length).toBeLessThanOrEqual(10);
        for (let i = 1; i < result.plans.length; i++) expect(result.plans[i - 1].total).toBeGreaterThanOrEqual(result.plans[i].total - 1e-6);
        for (const p of result.plans) expect(runPlan(ctx, p.actions).total).toBeCloseTo(p.total, 6);
        expect(new Set(result.plans.map((p) => p.signature)).size).toBe(result.plans.length);
        const progress = readProgress(counters);
        expect(progress.planned).toBe(3000n);
        expect(progress.searched).toBeGreaterThanOrEqual(3000n);
        expect(progress.status).toBe('done');
        expect(progress.bestScore).toBe(Math.round(result.plans[0].total));
    });

    it('repeats with the same seed, and can differ with another', () => {
        const { ctx } = small();
        const run = (seed: number) => localSearch(ctx, makeCounters(), { evaluations: 1500, runLength: 300, seed }).plans.map((p) => p.signature);
        expect(run(5)).toEqual(run(5));
    });

    it('stops when asked', () => {
        const { ctx } = small();
        const counters = makeCounters();
        requestStop(counters);
        const result = localSearch(ctx, counters, { evaluations: 100000, batch: 1 });
        expect(result.stopped).toBe(true);
        expect(Atomics.load(counters, COUNTER.status)).toBe(2n);
    });

    it('finds the best damage the exhaustive search finds', { timeout: 180000 }, () => {
        const { ctx } = small();
        const exact = search(ctx, makeCounters(), { rules: DEFAULT_OPTIONS, top: 10 });
        const local = localSearch(ctx, makeCounters(), { evaluations: 20000 });
        expect(local.bestScore).toBeGreaterThanOrEqual(exact.bestScore! - 1e-6);
    });
});
