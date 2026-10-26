import { Cell, cellKey, neighbors } from '../core/hex';
import { UNIT_IDS, UnitId } from '../core/setup';
import { AttackReport, legalAttacks } from '../engine/attacks';
import { Action, applyAction, finishRound } from '../engine/plan';
import { Context, State, enemyCells, initialState, unitIds } from '../engine/state';
import { Analysis, analyse, makeStatics } from './analysis';
import { deployHexes, zkarInReach } from './actions';
import { allows, arrange, pinnedCell, satisfied, zkarPin } from './rules';
import { COUNTER, Counters } from './counters';
import { SearchOptions, SearchResult, StoredPlan, insertPlan, signatureOf } from './search';

// Local search (simulated annealing with restarts) over a compact description of a plan, as an alternative to the exhaustive
// search. A plan is "who attacks in which order, where each unit moves and just before which attack, and where and when
// Z'kar lands". It decodes to the same Action list the exhaustive search produces and is scored by the same engine, so it
// can find a very good plan fast but, unlike the exhaustive search, cannot say that no better one exists.

/** What one character does: where it goes, when, and how it attacks. */
export interface Gene {
    /** Where it moves to, or undefined to stay put. */
    dest?: Cell;
    /** It moves just before the attack at this position in the order (never later than its own). */
    moveSlot: number;
    /** Which of its legal attacks on the boss to use: an index into them, wrapping round. */
    pick: number;
    /** Abaddon only: use his active first (when it is available). */
    useActive: boolean;
}

export interface Genome {
    /** The characters in attack order. */
    order: UnitId[];
    genes: Record<UnitId, Gene>;
    /** Where Z'kar is clicked, or undefined to leave him out. */
    zkarAt?: Cell;
    /** He lands just before the attack at this position in the order (the number of characters means after them all). */
    zkarSlot: number;
    /** Within that slot, he lands before the moves rather than after them. */
    zkarFirst: boolean;
}

export interface LocalOptions extends SearchOptions {
    /** Plans to evaluate before stopping (default 200000). */
    evaluations?: number;
    /** Plans per annealing run before it restarts (default 3000). */
    runLength?: number;
    /** Seed for the random choices, so a run can be repeated (default 1). */
    seed?: number;
}

// ---- random numbers ----------------------------------------------------------------------------------------------------

/** mulberry32: small, fast and good enough for choosing neighbours. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- decoding ----------------------------------------------------------------------------------------------------------

export interface Decoded {
    actions: Action[];
    total: number;
    reports: AttackReport[];
    penalties: ReturnType<typeof finishRound>['penalties'];
    /** The state at the end of the round, after the end-of-round attack and the units lost on undesirable hexes. */
    final: State;
    /** How many units (Z'kar counting as one) end the round standing on an undesirable hex. */
    undesirable: number;
    /** How many of the user's rules the plan breaks (a plan that breaks any is never kept). */
    violations: number;
}

/**
 * Play a genome: at each position in the attack order, the moves due then (and Z'kar, if he lands then), then the attack. A step
 * that isn't legal when its turn comes (a hex taken, nothing in reach, no room for Z'kar) is skipped: the character stays, or
 * passes, so every genome decodes to a legal plan.
 */
export function decode(ctx: Context, genome: Genome, from?: State): Decoded {
    let state = from ?? initialState(ctx.setup);
    const actions: Action[] = [];
    const reports: AttackReport[] = [];
    let score = 0;
    let violations = 0;
    const apply = (action: Action): boolean => {
        const result = applyAction(ctx, state, action);
        if (!result) return false;
        if (!allows(ctx, state, action)) violations++;
        state = result.state;
        actions.push(action);
        for (const r of result.reports) {
            reports.push(r);
            score += r.score;
        }
        return true;
    };
    const present = arrange(ctx, genome.order.filter((id) => state.units[id]));
    const zAt = zkarPin(ctx) ?? genome.zkarAt;
    const moves = (slot: number) => {
        for (const id of present) {
            const gene = genome.genes[id];
            const dest = pinnedCell(ctx, id) ?? gene.dest;
            if (dest && Math.min(gene.moveSlot, present.indexOf(id)) === slot) apply({ type: 'move', unit: id, to: dest });
        }
    };
    const deploy = (slot: number, first: boolean) => {
        if (zAt && Math.min(genome.zkarSlot, present.length) === slot && genome.zkarFirst === first) apply({ type: 'deploy', at: zAt });
    };

    present.forEach((id, slot) => {
        deploy(slot, true);
        moves(slot);
        deploy(slot, false);
        const gene = genome.genes[id];
        if (id === 'abaddon' && gene.useActive) apply({ type: 'abaddonActive' });
        const choices = legalAttacks(ctx, state, id);
        const onBoss = choices.filter((c) => c.target.kind === 'boss');
        const pool = onBoss.length > 0 ? onBoss : choices;
        const attackOf = (c: (typeof pool)[number]): Action => ({ type: 'attack', unit: id, kind: c.kind, target: c.target, ...(c.extra ? { extra: c.extra } : {}) });
        // Prefer an attack the rules allow; failing that, passing if they allow it; failing that, break a rule and say so.
        const okPool = pool.filter((c) => allows(ctx, state, attackOf(c)));
        if (okPool.length > 0) apply(attackOf(okPool[gene.pick % okPool.length]));
        else if (allows(ctx, state, { type: 'pass', unit: id }) || pool.length === 0) apply({ type: 'pass', unit: id });
        else apply(attackOf(pool[gene.pick % pool.length]));
    });
    deploy(present.length, true);
    deploy(present.length, false);

    if (!satisfied(ctx, state)) violations++;
    const done = finishRound(ctx, state);
    const total = score + done.reports.reduce((s, r) => s + r.score, 0) - done.penalties.reduce((s, p) => s + p.points, 0);
    const bad = new Set(ctx.setup.undesirable);
    const undesirable = Object.values(state.units).filter((u) => bad.has(cellKey(u!.cell))).length + (state.zkar?.cells.some((c) => bad.has(cellKey(c))) ? 1 : 0);
    return { actions, total, reports: [...reports, ...done.reports], penalties: done.penalties, final: done.state, undesirable, violations };
}

// ---- the search --------------------------------------------------------------------------------------------------------

export function localSearch(ctx: Context, counters: Counters, options: LocalOptions = {}): SearchResult {
    const top = options.top ?? 10;
    const budget = options.evaluations ?? 200000;
    const runLength = options.runLength ?? 3000;
    const random = rng(options.seed ?? 1);
    const batch = options.batch ?? 256;
    const start = initialState(ctx.setup);
    const statics = makeStatics(ctx, start);
    const an: Analysis = analyse(ctx, start);
    const units = unitIds(start);

    const int = (n: number) => Math.floor(random() * n);
    const choose = <T>(items: readonly T[]): T => items[int(items.length)];

    // Where each character could go: anywhere it can move to, and (more often tried) the hexes it could attack from.
    const reach: Partial<Record<UnitId, Cell[]>> = {};
    const strike: Partial<Record<UnitId, Cell[]>> = {};
    const boss = enemyCells(start, { kind: 'boss' });
    const byBoss = (cs: Cell[]) => [...cs].sort((a, b) => dist(a, boss) - dist(b, boss));
    for (const id of units) {
        reach[id] = an.moves[id] ?? [];
        strike[id] = byBoss(an.attackCells[id] ?? []);
    }
    function dist(c: Cell, cells: readonly Cell[]): number {
        return Math.min(...cells.map((o) => Math.max(Math.abs(c.col - o.col), Math.abs(c.row - o.row))));
    }
    // Z'kar's clicks: anywhere a triangle fits now and he'd have an enemy in reach.
    const deploys = deployHexes(ctx, start, statics.deployCandidates).filter((d) => zkarInReach(start, d.cells));

    const randomDest = (id: UnitId): Cell | undefined => {
        const pin = pinnedCell(ctx, id);
        if (pin) return pin;
        const near = strike[id]!;
        const all = reach[id]!;
        const r = random();
        if (r < 0.15 || all.length === 0) return undefined;
        if (r < 0.7 && near.length > 0) return near[Math.min(near.length - 1, int(Math.ceil(near.length / 2)))]; // the nearer half
        return choose(all);
    };
    const randomZkar = (g: Genome): Cell | undefined => {
        const pin = zkarPin(ctx);
        if (pin) return pin;
        if (deploys.length === 0 || random() < 0.05) return undefined;
        // Often next to where somebody is going, so the book holders and psykers are beside him.
        if (random() < 0.5) {
            const id = choose(units);
            const spot = g.genes[id].dest ?? start.units[id]!.cell;
            const near = deploys.filter((d) => d.cells.some((c) => neighbors(spot).some((n) => cellKey(n) === cellKey(c))));
            if (near.length > 0) return choose(near).at;
        }
        return choose(deploys).at;
    };

    const randomGenome = (): Genome => {
        const order = [...units];
        for (let i = order.length - 1; i > 0; i--) {
            const j = int(i + 1);
            [order[i], order[j]] = [order[j], order[i]];
        }
        // Neurothrope usually attacks last.
        if (random() < 0.6 && order.includes('neurothrope')) order.push(...order.splice(order.indexOf('neurothrope'), 1));
        const genes = {} as Record<UnitId, Gene>;
        for (const id of UNIT_IDS) genes[id] = { dest: units.includes(id) ? randomDest(id) : undefined, moveSlot: 0, pick: int(4), useActive: random() < 0.5 };
        for (const id of units) genes[id].moveSlot = int(order.indexOf(id) + 1);
        const g: Genome = { order, genes, zkarSlot: int(order.length + 1), zkarFirst: random() < 0.3 };
        g.zkarAt = randomZkar(g);
        return g;
    };

    const clone = (g: Genome): Genome => ({ ...g, order: [...g.order], genes: Object.fromEntries(UNIT_IDS.map((id) => [id, { ...g.genes[id] }])) as Record<UnitId, Gene> });

    const mutate = (g: Genome): Genome => {
        const n = clone(g);
        const once = () => {
            const r = random();
            if (r < 0.28) {
                const id = choose(units);
                n.genes[id].dest = randomDest(id);
            } else if (r < 0.43) {
                const i = int(n.order.length);
                const j = random() < 0.6 ? Math.min(n.order.length - 1, i + 1) : int(n.order.length);
                [n.order[i], n.order[j]] = [n.order[j], n.order[i]];
            } else if (r < 0.53) {
                const id = choose(units);
                n.genes[id].moveSlot = int(n.order.indexOf(id) + 1);
            } else if (r < 0.63) {
                n.genes[choose(units)].pick = int(4);
            } else if (r < 0.78) {
                n.zkarAt = randomZkar(n);
            } else if (r < 0.85) {
                n.zkarSlot = int(n.order.length + 1);
            } else if (r < 0.9) {
                n.zkarFirst = !n.zkarFirst;
            } else if (r < 0.95) {
                n.genes.abaddon.useActive = !n.genes.abaddon.useActive;
            } else {
                const a = choose(units);
                const b = choose(units);
                [n.genes[a].dest, n.genes[b].dest] = [n.genes[b].dest, n.genes[a].dest];
            }
        };
        once();
        if (random() < 0.3) once();
        for (const id of units) n.genes[id].moveSlot = Math.min(n.genes[id].moveSlot, n.order.indexOf(id));
        return n;
    };

    // ---- bookkeeping, as in the exhaustive search --------------------------------------------------------------------
    let plans: StoredPlan[] = [];
    const genomes = new Map<string, Genome>(); // by signature, for the plans kept
    let evaluated = 0;
    let sinceCheck = 0;
    let stopped = false;
    let changed = false;
    let lastPost = Date.now();

    // The budget is the whole of what is planned, so searched / planned reads as the share of the run done.
    Atomics.add(counters, COUNTER.planned, BigInt(budget));
    const flush = (n: number) => {
        if (n === 0) return;
        Atomics.add(counters, COUNTER.searched, BigInt(n));
        Atomics.add(counters, COUNTER.complete, BigInt(n));
    };
    const checkIn = () => {
        flush(sinceCheck);
        sinceCheck = 0;
        if (Atomics.load(counters, COUNTER.cancel) !== 0n || options.shouldStop?.()) stopped = true;
        if (changed && options.onBest && Date.now() - lastPost > 250) {
            options.onBest(plans);
            changed = false;
            lastPost = Date.now();
        }
    };

    /** Score a genome, keep it if it makes the list, and return its damage (less any penalties). */
    const evaluate = (g: Genome): number => {
        const d = decode(ctx, g);
        evaluated++;
        if (++sinceCheck >= batch) checkIn();
        // A plan that breaks a rule is never kept, but is scored just below the ones that keep to them, so the search can still
        // walk through them towards plans that do not.
        if (d.violations > 0) return d.total - d.violations * 1e7;
        const worst = plans[plans.length - 1];
        if (plans.length >= top && !(d.total > worst.total + 1e-6 || (Math.abs(d.total - worst.total) <= 1e-6 && d.undesirable < worst.undesirable))) return d.total;
        const signature = signatureOf(d.final, d.reports);
        const updated = insertPlan(plans, { actions: d.actions, total: d.total, reports: d.reports, penalties: d.penalties, undesirable: d.undesirable, signature }, top);
        if (updated) {
            plans = updated;
            genomes.set(signature, g);
            Atomics.store(counters, COUNTER.bestScore, BigInt(Math.round(plans[0].total)));
            Atomics.store(counters, COUNTER.bestRuns, BigInt(plans.length));
            changed = true;
        }
        return d.total;
    };

    // ---- annealing runs ----------------------------------------------------------------------------------------------
    while (!stopped && evaluated < budget) {
        // Start from a fresh random plan, or (half the time once there are some) from one of the best so far.
        const kept = [...genomes.values()];
        let current = kept.length > 0 && random() < 0.5 ? clone(choose(plans.map((p) => genomes.get(p.signature)!).filter(Boolean))) : randomGenome();
        let score = evaluate(current);
        const t0 = Math.max(1000, (plans[0]?.total ?? score) * 0.08);
        for (let i = 0; i < runLength && !stopped && evaluated < budget; i++) {
            const temperature = t0 * (1 - i / runLength) + 1;
            const next = mutate(current);
            const nextScore = evaluate(next);
            if (nextScore >= score || random() < Math.exp((nextScore - score) / temperature)) {
                current = next;
                score = nextScore;
            }
        }
        if (genomes.size > 4 * top) for (const k of [...genomes.keys()]) if (!plans.some((p) => p.signature === k)) genomes.delete(k);
    }

    flush(sinceCheck);
    if (options.onBest && changed) options.onBest(plans);
    Atomics.store(counters, COUNTER.status, stopped ? 2n : 1n);
    return { bestScore: plans[0]?.total, plans, stopped };
}
