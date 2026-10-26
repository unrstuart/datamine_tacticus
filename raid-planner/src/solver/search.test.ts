import { describe, expect, it } from 'vitest';
import { cellKey } from '../core/hex';
import { runPlan } from '../engine/plan';
import { go, scenario } from '../engine/testkit';
import { COUNTER, makeCounters, readProgress, requestStop } from './counters';
import { StoredPlan, insertPlan, search } from './search';
import { DEFAULT_OPTIONS, EXHAUSTIVE } from './options';
import { analyse, makeStatics } from './analysis';
import { deployHexes, zkarInReach } from './actions';
import { UnitId } from '../core/setup';
import { allDone, legalActions } from './actions';
import { initialState } from '../engine/state';

// A tiny board with one character so the whole search finishes at once.
const small = (o: Parameters<typeof scenario>[0] = {}) => scenario({ cols: 6, rows: 6, boss: [{ col: 3, row: 4 }], units: { abaddon: { col: 3, row: 2 } }, ...o });

describe('the exhaustive search', () => {
    it('searches every sequence: the counters agree when it finishes', () => {
        const { ctx } = small();
        const counters = makeCounters();
        const result = search(ctx, counters, { rules: EXHAUSTIVE });
        const p = readProgress(counters);
        expect(result.stopped).toBe(false);
        expect(p.status).toBe('done');
        expect(p.searched).toBe(p.planned);
        expect(p.planned).toBeGreaterThan(100n);
        expect(p.complete).toBeGreaterThan(0n);
        expect(p.bestScore).toBe(Math.round(result.bestScore!));
        expect(p.bestRuns).toBe(BigInt(result.plans.length));
        expect(result.plans.length).toBeLessThanOrEqual(10);
    });

    it('finds plans at least as good as one made by hand, and every stored plan replays to its score', () => {
        const { ctx } = small();
        const result = search(ctx, makeCounters(), { rules: EXHAUSTIVE });
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
        const result = search(ctx, makeCounters(), { rules: EXHAUSTIVE });
        const signatures = result.plans.map((p) => p.signature);
        expect(new Set(signatures).size).toBe(signatures.length);
    });

    it('can be asked to stop part way, and says so', () => {
        const { ctx } = small();
        const counters = makeCounters();
        let calls = 0;
        const result = search(ctx, counters, { rules: EXHAUSTIVE, batch: 16, shouldStop: () => ++calls > 3 });
        expect(result.stopped).toBe(true);
        expect(readProgress(counters).status).toBe('stopped');
        expect(readProgress(counters).searched).toBeLessThan(readProgress(counters).planned);
    });

    it('stops when the cancel flag is set in the shared counters', () => {
        const { ctx } = small();
        const counters = makeCounters();
        requestStop(counters);
        const result = search(ctx, counters, { rules: EXHAUSTIVE, batch: 1 });
        expect(result.stopped).toBe(true);
        expect(Atomics.load(counters, COUNTER.cancel)).toBe(1n);
    });

    it('grows the planned count as it goes and never lets searched pass it', () => {
        const { ctx } = small();
        const counters = makeCounters();
        const seen: Array<[bigint, bigint]> = [];
        search(ctx, counters, {
            rules: EXHAUSTIVE,
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
        const result = search(ctx, makeCounters(), { rules: EXHAUSTIVE });
        expect(result.plans.every((p) => p.actions.some((a) => a.type === 'deploy'))).toBe(true);
        expect(result.plans.length).toBeGreaterThan(0);
        void cellKey;
    });
});


// ---- the rules that narrow the search ---------------------------------------------------------------------------------

/** A small deterministic random number generator, so the random scenarios are the same every run. */
function rng(seed: number) {
    let x = seed >>> 0 || 1;
    return () => {
        x ^= x << 13;
        x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5;
        x >>>= 0;
        return x / 4294967296;
    };
}

function randomScenario(seed: number, unitCount: number) {
    const r = rng(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const cols = 5;
    const rows = 5;
    const taken = new Set<string>();
    const free = () => {
        for (;;) {
            const c = { col: Math.floor(r() * cols), row: Math.floor(r() * rows) };
            if (!taken.has(cellKey(c))) {
                taken.add(cellKey(c));
                return c;
            }
        }
    };
    const names: UnitId[] = ['abaddon', 'ahriman', 'abraxas', 'archimatos', 'neurothrope'];
    const boss = free();
    const units: Partial<Record<UnitId, { col: number; row: number }>> = {};
    for (const name of [...names].sort(() => r() - 0.5).slice(0, unitCount)) units[name] = free();
    const minions = Array.from({ length: Math.floor(r() * 2) }, () => free());
    const effects: Record<string, 'fire1' | 'fire2' | 'despoiled' | 'contaminated'> = {};
    for (let i = 0; i < Math.floor(r() * 2); i++) effects[cellKey(free())] = pick(['fire1', 'fire2', 'despoiled', 'contaminated'] as const);
    effects[cellKey(boss)] = r() < 0.4 ? pick(['fire1', 'fire2', 'despoiled'] as const) : effects[cellKey(boss)];
    if (!effects[cellKey(boss)]) delete effects[cellKey(boss)];
    return scenario({
        cols,
        rows,
        boss: [boss],
        units,
        minions,
        effects,
        neuroStacks: Math.floor(r() * 4),
        abaddonStacks: Math.floor(r() * 4),
        abaddonExtra: pick(['off', 'available', 'on'] as const),
        hexes: { [cellKey(free())]: { elevation: 2 } },
    });
}


describe('the ten best plans', () => {
    const plan = (total: number, undesirable: number, signature: string): StoredPlan => ({ actions: [], total, reports: [], penalties: [], undesirable, signature });

    it('ranks by damage, then by fewer units on undesirable hexes, then by who came first', () => {
        let list: StoredPlan[] = [];
        for (const p of [plan(100, 0, 'a'), plan(200, 1, 'b'), plan(200, 0, 'c'), plan(200, 0, 'd'), plan(150, 0, 'e'), plan(200, 2, 'f')]) list = insertPlan(list, p, 10) ?? list;
        // 200 damage three times: c and d have no unit on an undesirable hex (c came first), then b (one), then f (two).
        expect(list.map((p) => p.signature)).toEqual(['c', 'd', 'b', 'f', 'e', 'a']);
    });

    it('keeps only the best ten, and tells a plan it did not make the list', () => {
        let list: StoredPlan[] = [];
        for (let i = 0; i < 15; i++) list = insertPlan(list, plan(i * 10, 0, `p${i}`), 10) ?? list;
        expect(list.map((p) => p.total)).toEqual([140, 130, 120, 110, 100, 90, 80, 70, 60, 50]);
        expect(insertPlan(list, plan(10, 0, 'low'), 10)).toBeUndefined();
        expect(insertPlan(list, plan(50, 0, 'tie'), 10)).toBeUndefined(); // equal to the tenth: it came later
        expect(insertPlan(list, plan(50, 1, 'worse'), 10)).toBeUndefined();
        expect(insertPlan(list, plan(50, 0, 'p5'), 10)).toBeUndefined(); // the same outcome as one listed
        expect(insertPlan(list, plan(55, 0, 'better'), 10)!.map((p) => p.signature)[9]).toBe('better');
    });

    it('never lists the same outcome twice', () => {
        const list = [plan(100, 0, 'x')];
        expect(insertPlan(list, plan(100, 0, 'x'), 10)).toBeUndefined();
        expect(insertPlan(list, plan(300, 0, 'x'), 10)).toBeUndefined(); // even if it somehow scored more: same signature means the same outcome
    });

    it('a search returns at most ten, best first, each replaying to its damage', { timeout: 120000 }, () => {
        const { ctx } = randomScenario(3, 2);
        const result = search(ctx, makeCounters(), { rules: { ...DEFAULT_OPTIONS, abaddonFirst: false } });
        expect(result.plans.length).toBeGreaterThan(1);
        expect(result.plans.length).toBeLessThanOrEqual(10);
        for (let i = 1; i < result.plans.length; i++) expect(result.plans[i - 1].total).toBeGreaterThanOrEqual(result.plans[i].total - 1e-6);
        for (const p of result.plans) expect(runPlan(ctx, p.actions).total).toBeCloseTo(p.total, 6);
        expect(new Set(result.plans.map((p) => p.signature)).size).toBe(result.plans.length);
    });

    it("among plans of equal damage, one with a unit on an undesirable hex comes after one without", { timeout: 120000 }, () => {
        // Archimatos has no enemy in reach wherever it goes, so it only matters where it ends. The boss is out of everyone's way.
        const { ctx, setup } = scenario({ cols: 6, rows: 6, boss: [{ col: 5, row: 5 }], units: { archimatos: { col: 0, row: 0 } }, abaddonExtra: 'off' });
        const bad = new Set(['0,0']);
        const marked = { ...ctx, setup: { ...setup, undesirable: [...bad] } };
        const result = search(marked, makeCounters(), { rules: { ...DEFAULT_OPTIONS, abaddonFirst: false }, top: 10 });
        expect(result.plans[0].undesirable).toBe(0);
        const ranks = result.plans.map((p) => p.undesirable);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b)); // equal damage throughout, so fewest-undesirable first
    });

    it('the state table only drops plans that tie, never the best damage', { timeout: 120000 }, () => {
        for (const seed of [2, 4, 7]) {
            const { ctx } = randomScenario(seed, 2);
            const base = { ...DEFAULT_OPTIONS, abaddonFirst: false };
            const without = search(ctx, makeCounters(), { rules: { ...base, tableBits: 0 }, top: 100000 });
            const withTable = search(ctx, makeCounters(), { rules: { ...base, tableBits: 16 }, top: 100000 });
            expect(withTable.bestScore).toBeCloseTo(without.bestScore!, 6);
            // Whatever the table lets through is a real plan.
            const all = new Set(without.plans.map((p) => p.signature));
            for (const p of withTable.plans) expect(all.has(p.signature)).toBe(true);
        }
    });
});

describe("Z'kar only where he could attack", () => {
    it('every deployment tried has an enemy in his reach', () => {
        const { ctx, state } = randomScenario(5, 2);
        const statics = makeStatics(ctx, state);
        const actions = legalActionsWith(ctx, state, DEFAULT_OPTIONS, statics);
        const deploys = actions.filter((a) => a.type === 'deploy');
        expect(deploys.length).toBeGreaterThan(0);
        for (const d of deploys) {
            if (d.type !== 'deploy') continue;
            const cells = deployHexes(ctx, state).find((h) => cellKey(h.at) === cellKey(d.at))!.cells;
            expect(zkarInReach(state, cells)).toBe(true);
        }
        // And the filter really removes some: the unrestricted list has deployments out of reach.
        const all = deployHexes(ctx, state);
        expect(all.length).toBeGreaterThan(deploys.length);
    });
});

import { legalActions as legalActionsWith } from './actions';

describe('moves that could not matter are left out', () => {
    it('keeps a move that lets the character attack, drops one that changes nothing', () => {
        const boss = { col: 3, row: 8 };
        const { ctx, state } = scenario({ cols: 8, rows: 10, boss: [boss], units: { archimatos: { col: 1, row: 1 } } });
        const statics = makeStatics(ctx, state);
        const an = analyse(ctx, state);
        const filtered = legalActionsWith(ctx, state, { ...EXHAUSTIVE, relevantMovesOnly: true }, statics, an).filter((a) => a.type === 'move');
        const everything = legalActionsWith(ctx, state, EXHAUSTIVE, statics, an).filter((a) => a.type === 'move');
        // Archimatos is far from the boss and nobody else is here: no move can bring an attack or a buff.
        expect(everything.length).toBeGreaterThan(0);
        expect(filtered).toEqual([]);

        const near = scenario({ cols: 8, rows: 10, boss: [boss], units: { archimatos: { col: 1, row: 6 } } });
        const kept = legalActionsWith(near.ctx, near.state, { ...EXHAUSTIVE, relevantMovesOnly: true }, makeStatics(near.ctx, near.state)).filter((a) => a.type === 'move');
        expect(kept.length).toBeGreaterThan(0); // some hexes within reach let it attack
        const all = legalActionsWith(near.ctx, near.state, EXHAUSTIVE, makeStatics(near.ctx, near.state)).filter((a) => a.type === 'move');
        expect(kept.length).toBeLessThan(all.length);
    });

    it('keeps a move that puts a buffer beside a friend who can attack', () => {
        const boss = { col: 3, row: 8 };
        // Neurothrope (six hexes from the boss) can't attack it even after moving, but Archimatos can; moving to within 2 of the
        // hexes Archimatos can attack from gives him Neurothrope's buff, so that move is worth trying.
        const { ctx, state } = scenario({ cols: 10, rows: 12, boss: [boss], units: { archimatos: { col: 3, row: 6 }, neurothrope: { col: 3, row: 2 } } });
        const moves = legalActionsWith(ctx, state, { ...EXHAUSTIVE, relevantMovesOnly: true }, makeStatics(ctx, state)).filter((a) => a.type === 'move' && a.unit === 'neurothrope');
        expect(moves.length).toBeGreaterThan(0);
    });
});

describe('Abaddon goes first', () => {
    it('every plan starts with Abaddon (or Abraxas moving next to him), unless he is full on stacks', { timeout: 120000 }, () => {
        const { ctx } = scenario({ cols: 8, rows: 8, boss: [{ col: 4, row: 5 }], units: { abaddon: { col: 3, row: 3 }, abraxas: { col: 5, row: 2 } }, abaddonExtra: 'off' });
        const result = search(ctx, makeCounters(), { rules: DEFAULT_OPTIONS, top: 100 });
        expect(result.plans.length).toBeGreaterThan(0);
        for (const p of result.plans) {
            const first = p.actions[0];
            const aboutAbaddon = 'unit' in first && first.unit === 'abaddon';
            const abraxasBeside = first.type === 'move' && first.unit === 'abraxas';
            expect(aboutAbaddon || abraxasBeside).toBe(true);
        }
    });

    it('uses his active first when he is in melee range and it is available', () => {
        const { ctx } = scenario({ cols: 8, rows: 8, boss: [{ col: 4, row: 5 }], units: { abaddon: { col: 4, row: 4 } }, abaddonExtra: 'available' });
        const result = search(ctx, makeCounters(), { rules: DEFAULT_OPTIONS, top: 1000 });
        const withMelee = result.plans.filter((p) => p.actions.some((a) => a.type === 'attack' && a.kind === 'melee'));
        expect(withMelee.length).toBeGreaterThan(0);
        for (const p of withMelee) {
            const i = p.actions.findIndex((a) => a.type === 'attack' && a.unit === 'abaddon');
            expect(p.actions.slice(0, i).some((a) => a.type === 'abaddonActive')).toBe(true);
        }
    });

    it('does not go first when he is already at 13 stacks', { timeout: 120000 }, () => {
        const { ctx } = scenario({ cols: 6, rows: 6, boss: [{ col: 3, row: 4 }], units: { abaddon: { col: 3, row: 3 }, archimatos: { col: 2, row: 2 } }, abaddonStacks: 13, abaddonExtra: 'off' });
        const result = search(ctx, makeCounters(), { rules: DEFAULT_OPTIONS, top: 100000 });
        const firsts = new Set(result.plans.map((p) => ('unit' in p.actions[0] ? p.actions[0].unit : p.actions[0].type)));
        expect(firsts.size).toBeGreaterThan(1);
    });

    describe('when he can only shoot', () => {
        // Rocks all round the boss so nobody can stand beside it: Abaddon can only shoot, from two hexes away.
        const rocks: Record<string, { passable: boolean }> = {};
        for (const c of ['4,7', '4,5', '5,6', '5,5', '3,6', '3,5']) rocks[c] = { passable: false };
        const lines = (units: Parameters<typeof scenario>[0]) => {
            const { ctx } = scenario({ cols: 9, rows: 10, hexes: rocks, boss: [{ col: 4, row: 6 }], abaddonExtra: 'off', ...units });
            const result = search(ctx, makeCounters(), { rules: DEFAULT_OPTIONS, top: 100000 });
            // Only the plans that do as much damage as the best: the rest are runners-up.
            return result.plans.filter((p) => p.total >= result.bestScore! - 1e-6).map((p) => p.actions.map((a) => a.type + ('unit' in a ? `:${a.unit}` : '')).join(' '));
        };

        it('shoots without help when there is nobody to help', () => {
            const l = lines({ units: { abaddon: { col: 4, row: 3 } } });
            expect(l.length).toBeGreaterThan(0);
            expect(l.every((x) => x.startsWith('attack:abaddon') || x.startsWith('move:abaddon'))).toBe(true);
        });

        it('has Abraxas step next to him before he shoots, when she can, since that scores more', () => {
            const l = lines({ units: { abaddon: { col: 4, row: 3 }, abraxas: { col: 6, row: 1 } } });
            // (Abaddon may move first; then Abraxas steps next to him; then he shoots.)
            expect(l.some((x) => /^(move:abaddon )?move:abraxas attack:abaddon/.test(x))).toBe(true);
        });
    });
});

describe('the default rules on a realistic board', () => {
    it('finishes the two-character board that the exhaustive search could not, and finds the best plans quickly', () => {
        const { ctx } = scenario({ cols: 8, rows: 8, boss: [{ col: 4, row: 5 }], units: { abaddon: { col: 2, row: 2 }, archimatos: { col: 3, row: 2 } } });
        const counters = makeCounters();
        const t0 = Date.now();
        const result = search(ctx, counters);
        expect(result.stopped).toBe(false);
        expect(readProgress(counters).searched).toBe(readProgress(counters).planned);
        expect(Date.now() - t0).toBeLessThan(15000);
        expect(result.bestScore).toBeGreaterThan(0);
    });
});
