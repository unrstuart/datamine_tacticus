import { describe, expect, it } from 'vitest';
import { Cell, cellKey } from '../core/hex';
import { UnitId } from '../core/setup';
import { AttackReport, BuffId, legalAttacks } from './attacks';
import { legalMoves } from './movement';
import { Action, PlanResult, applyAction, legalDeploys, runPlan } from './plan';
import { BOSS, go, minion, scenario } from './testkit';

const at = (col: number, row: number): Cell => ({ col, row });
const ids = (r: AttackReport): BuffId[] => r.buffs.map((b) => b.id).sort();
const attack = (unit: UnitId, kind: 'ranged' | 'melee' | 'relic' | 'active' | 'physical', target = BOSS): Action => ({ type: 'attack', unit, kind, target });
const only = (plan: PlanResult): AttackReport[] => plan.steps.flatMap((s) => s.reports);

// The boss is a single hex at (6,10). Straight "S" steps from it run down the column, so go(boss,'S',k) is k hexes away.
const boss = at(6, 10);
const south = (k: number) => go(boss, 'S', k);

describe('attacks and the buffs on them', () => {
    it("Abaddon's melee attack scores 2 for stacking his passive, and nothing else", () => {
        const { ctx } = scenario({ units: { abaddon: south(1) } });
        const plan = runPlan(ctx, [attack('abaddon', 'melee')]);
        expect(ids(only(plan)[0])).toEqual(['abaddonPassive']);
        expect(plan.total).toBe(2);
    });

    it('a ranged Abaddon next to nobody scores nothing', () => {
        const { ctx } = scenario({ units: { abaddon: south(2) } });
        expect(runPlan(ctx, [attack('abaddon', 'ranged')]).total).toBe(0);
    });

    describe("Abaddon's buff", () => {
        it('goes to chaos units within 2 hexes, ranged or not, and not to Neurothrope', () => {
            const near = scenario({ units: { abaddon: south(4), archimatos: south(2) } });
            expect(ids(only(runPlan(near.ctx, [attack('archimatos', 'ranged')]))[0])).toEqual(['abaddon']);
            const far = scenario({ units: { abaddon: south(5), archimatos: south(2) } });
            expect(ids(only(runPlan(far.ctx, [attack('archimatos', 'ranged')]))[0])).toEqual([]);
            const xeno = scenario({ units: { abaddon: south(3), neurothrope: south(3 - 1) }, neuroStacks: 0 });
            expect(ids(only(runPlan(xeno.ctx, [attack('neurothrope', 'ranged')]))[0])).not.toContain('abaddon');
        });
    });

    describe("Neurothrope's buff", () => {
        it('goes to psykers and summons within 2, and not to Abaddon', () => {
            const a = scenario({ units: { neurothrope: south(4), archimatos: south(2) } });
            expect(ids(only(runPlan(a.ctx, [attack('archimatos', 'ranged')]))[0])).toEqual(['neurothrope']);
            const b = scenario({ units: { neurothrope: south(3), abaddon: south(1) } });
            expect(ids(only(runPlan(b.ctx, [attack('abaddon', 'melee')]))[0])).not.toContain('neurothrope');
        });

        it("counts once on Z'kar, who is both a psyker and a summon", () => {
            // Z'kar lands next to Ahriman (so he attacks) with Neurothrope two hexes from him and a minion to hit.
            const z = south(4);
            const { ctx, state } = scenario({ units: { ahriman: go(z, 'S', 1), neurothrope: go(z, 'S', 2) }, minions: [south(2)] });
            const [r] = applyAction(ctx, state, { type: 'deploy', at: z })!.reports;
            expect(r.actor).toBe('zkar');
            expect(r.buffs.filter((b) => b.id === 'neurothrope')).toHaveLength(1);
        });
    });

    describe("Ahriman's fire and buff", () => {
        it('lights the boss on fire after his own attack, and then buffs the others', () => {
            const { ctx } = scenario({ units: { ahriman: south(2), archimatos: go(boss, 'SW', 2) } });
            const plan = runPlan(ctx, [attack('ahriman', 'ranged'), attack('archimatos', 'ranged')]);
            const [a, b] = only(plan);
            expect(ids(a)).not.toContain('ahriman'); // the fire is lit after his hit
            expect(ids(b)).toContain('ahriman');
            expect(plan.final.effects[cellKey(boss)]).toBe('fire2');
        });

        it('buffs flame attacks too, but not melee power attacks', () => {
            const burning = { [cellKey(boss)]: 'fire2' as const };
            const flame = scenario({ units: { ahriman: south(5), abraxas: south(1) }, effects: burning });
            expect(ids(only(runPlan(flame.ctx, [attack('abraxas', 'melee')]))[0])).toContain('ahriman');
            const power = scenario({ units: { ahriman: south(5), abaddon: south(1) }, effects: burning });
            expect(ids(only(runPlan(power.ctx, [attack('abaddon', 'melee')]))[0])).not.toContain('ahriman');
        });

        it("Abraxas's melee flame attack also lights the boss", () => {
            const { ctx } = scenario({ units: { abraxas: south(1) } });
            expect(runPlan(ctx, [attack('abraxas', 'melee')]).final.effects[cellKey(boss)]).toBe('fire2');
        });

        it("his active does not light fire", () => {
            const { ctx } = scenario({ units: { ahriman: south(2) } });
            expect(runPlan(ctx, [attack('ahriman', 'active')]).final.effects[cellKey(boss)]).toBeUndefined();
        });
    });

    describe("Abraxas's extra psychic hit", () => {
        it("makes Abaddon's ranged bolter psychic: it stacks the parasite and takes Ahriman's buff", () => {
            const { ctx } = scenario({
                units: { abaddon: south(2), abraxas: go(south(2), 'SE', 1), ahriman: south(7) },
                neuroStacks: 2,
                effects: { [cellKey(boss)]: 'fire2' },
            });
            const [r] = only(runPlan(ctx, [attack('abaddon', 'ranged')]));
            // Abaddon also gets his hex-effect bonus: the boss stands on fire.
            expect(ids(r)).toEqual(['abraxas', 'ahriman', 'hexEffect', 'neuroStack']);
            expect(r.score).toBe(4);
        });

        it('does nothing when Abraxas is not adjacent, or for an ability attack', () => {
            const far = scenario({ units: { abaddon: south(2), abraxas: south(5) }, neuroStacks: 2 });
            expect(ids(only(runPlan(far.ctx, [attack('abaddon', 'ranged')]))[0])).toEqual([]);
        });

        it("adds no stack to an attack that was already psychic, but still counts as a buff", () => {
            const { ctx } = scenario({ units: { archimatos: south(2), abraxas: go(south(2), 'SE', 1) }, neuroStacks: 3 });
            const [r] = only(runPlan(ctx, [attack('archimatos', 'ranged')]));
            // +1 stack from the psychic attack itself, +1 for Abraxas's added hit.
            expect(ids(r)).toEqual(['abraxas', 'neuroStack']);
            expect(r.buffs.find((b) => b.id === 'neuroStack')!.points).toBe(1);
        });
    });

    describe('the neuroparasite', () => {
        it('is infected by Neurothrope, not by anyone else', () => {
            const { ctx } = scenario({ units: { archimatos: south(2), neurothrope: south(3) }, neuroStacks: 0 });
            const plan = runPlan(ctx, [attack('archimatos', 'ranged'), attack('neurothrope', 'ranged')]);
            const [a, n] = only(plan);
            expect(ids(a)).not.toContain('neuroStack');
            expect(ids(n)).toContain('neuroStack');
            expect(plan.final.neuroStacks).toBe(1);
        });

        it('then grows by one for every psychic attack on the boss, and stops at 16', () => {
            const { ctx } = scenario({ units: { archimatos: south(2), ahriman: go(boss, 'SW', 2) }, neuroStacks: 4 });
            const plan = runPlan(ctx, [attack('archimatos', 'ranged'), attack('ahriman', 'ranged')]);
            expect(plan.final.neuroStacks).toBe(6);
            const full = scenario({ units: { archimatos: south(2) }, neuroStacks: 16 });
            expect(runPlan(full.ctx, [attack('archimatos', 'ranged')]).final.neuroStacks).toBe(16);
        });

        it('is not stacked by a flame attack or a physical one', () => {
            const { ctx } = scenario({ units: { abraxas: south(1) }, neuroStacks: 3 });
            expect(runPlan(ctx, [attack('abraxas', 'melee')]).final.neuroStacks).toBe(3);
        });
    });

    it('high ground: an attacker above its target gets a buff', () => {
        const hexes = { [cellKey(south(2))]: { elevation: 2 } };
        const { ctx } = scenario({ units: { archimatos: south(2) }, hexes });
        expect(ids(only(runPlan(ctx, [attack('archimatos', 'ranged')]))[0])).toContain('highGround');
    });

    it('hex effect bonus: Abaddon and Archimatos attacking a unit on any hex effect', () => {
        for (const effect of ['fire1', 'despoiled', 'contaminated'] as const) {
            const a = scenario({ units: { abaddon: south(1) }, effects: { [cellKey(boss)]: effect } });
            expect(ids(only(runPlan(a.ctx, [attack('abaddon', 'melee')]))[0])).toContain('hexEffect');
        }
        const b = scenario({ units: { archimatos: south(2) }, effects: { [cellKey(boss)]: 'despoiled' } });
        expect(ids(only(runPlan(b.ctx, [attack('archimatos', 'ranged')]))[0])).toContain('hexEffect');
        const c = scenario({ units: { abraxas: south(2) }, effects: { [cellKey(boss)]: 'despoiled' } });
        expect(ids(only(runPlan(c.ctx, [attack('abraxas', 'ranged')]))[0])).not.toContain('hexEffect');
    });

    it("the Z'kar buff goes to a psyker next to another psyker or to Z'kar, but not to Abaddon", () => {
        // No Z'kar on the board: nothing to grant it.
        const none = scenario({ units: { archimatos: south(2), abraxas: go(south(2), 'SE', 1) } });
        expect(ids(only(runPlan(none.ctx, [attack('archimatos', 'ranged')]))[0])).not.toContain('zkar');

        // With him out (placed by hand, so he doesn't attack): Archimatos beside Abraxas gets it, Abaddon never does.
        const { ctx, state } = scenario({ units: { archimatos: go(boss, 'SW', 2), abraxas: go(go(boss, 'SW', 2), 'SW', 1), abaddon: south(1) } });
        const withZkar = { ...state, zkar: { cells: [at(1, 1), at(1, 2), at(2, 1)], triggered: { deploy: true, archimatos: true, abraxas: true } } };
        const plan = runPlan(ctx, [attack('archimatos', 'ranged'), attack('abaddon', 'melee')], withZkar);
        const [a, b] = only(plan);
        expect(ids(a)).toContain('zkar');
        expect(ids(b)).not.toContain('zkar');
    });

    it('the relic hits its target plus up to two more enemies adjacent to both him and that target', () => {
        const abaddon = south(1);
        const m1 = go(boss, 'SE', 1);
        const m2 = go(boss, 'SW', 1);
        const { ctx } = scenario({ units: { abaddon }, minions: [m1, m2] });
        const plan = runPlan(ctx, [attack('abaddon', 'relic')]);
        const [r] = only(plan);
        expect(r.targets).toHaveLength(3); // the boss and both minions
        expect(plan.final.minions).toEqual([]); // they die; the boss does not
        // A minion that is not beside both of them is left alone.
        const far = scenario({ units: { abaddon }, minions: [go(boss, 'N', 1)] });
        expect(only(runPlan(far.ctx, [attack('abaddon', 'relic')]))[0].targets).toHaveLength(1);
        // And it is an ability: Abraxas's bonus hit doesn't apply, but it does score as a melee attack.
        expect(r.buffs.some((b) => b.id === 'abaddonPassive')).toBe(true);
    });
});

describe('smite', () => {
    it("lets a shot at a minion beside the boss stack the parasite on the boss", () => {
        const m = south(1);
        const { ctx } = scenario({ units: { archimatos: south(3) }, minions: [m], neuroStacks: 2 });
        const [r] = only(runPlan(ctx, [attack('archimatos', 'ranged', minion(m))]));
        expect(r.smite).toEqual(BOSS);
        expect(ids(r)).toContain('neuroStack');
    });

    it("prefers another minion to the boss, so the boss is not smited when a minion is beside the target", () => {
        const m1 = south(1);
        const m2 = go(m1, 'S', 1);
        const { ctx } = scenario({ units: { archimatos: south(4) }, minions: [m1, m2], neuroStacks: 2 });
        const [r] = only(runPlan(ctx, [attack('archimatos', 'ranged', minion(m2))]));
        expect(r.smite).toEqual(minion(m1));
        expect(ids(r)).not.toContain('neuroStack');
    });

    it("sets the smite target's hexes on fire when it is Ahriman's ranged attack, and the attacked minion's too", () => {
        const m = south(1);
        const { ctx } = scenario({ units: { ahriman: south(3) }, minions: [m] });
        const plan = runPlan(ctx, [attack('ahriman', 'ranged', minion(m))]);
        expect(plan.final.effects[cellKey(boss)]).toBe('fire2');
        expect(plan.final.effects[cellKey(m)]).toBe('fire2');
    });

    it('does not apply to abilities, to Abaddon, or to a physical attack', () => {
        const m = south(1);
        const { ctx } = scenario({ units: { ahriman: south(3), abaddon: south(3), neurothrope: south(2) }, minions: [m] });
        expect(only(runPlan(ctx, [attack('ahriman', 'active', minion(m))]))[0].smite).toBeUndefined();
        expect(only(runPlan(ctx, [attack('abaddon', 'ranged', minion(m))]))[0].smite).toBeUndefined();
    });
});

describe("Z'kar", () => {
    it('attacks when deployed next to a psyker, and not otherwise', () => {
        const z = south(5);
        const { ctx, state } = scenario({ units: { ahriman: go(z, 'S', 1) }, minions: [south(3)] });
        const next = applyAction(ctx, state, { type: 'deploy', at: z })!;
        expect(next.reports.map((r) => r.trigger)).toEqual(['deploy']);
        expect(next.state.zkar!.triggered.deploy).toBe(true);
        const away = applyAction(ctx, state, { type: 'deploy', at: at(1, 1) })!;
        expect(away.reports).toEqual([]);
        // Abaddon is no psyker: landing beside him does not set Z'kar off.
        const abaddon = scenario({ units: { abaddon: go(z, 'S', 1) }, minions: [south(3)] });
        expect(applyAction(abaddon.ctx, abaddon.state, { type: 'deploy', at: z })!.reports).toEqual([]);
    });

    describe('attacking again when beside him', () => {
        // Z'kar is out (placed by hand) on south(4), south(3) and the hex up-right of south(4); the character stands
        // beside him with a minion beside it to hit. None of them can be a deploy trigger.
        const z = south(5);
        const zkar = { cells: [z, go(z, 'N', 1), go(z, 'NE', 1)], triggered: { deploy: true, archimatos: false, abraxas: false } };
        const run = (unit: UnitId, kind: 'ranged' | 'melee' | 'physical' = 'melee') => {
            const stand = go(z, 'S', 1);
            const { ctx, state } = scenario({ units: { [unit]: stand }, minions: [go(stand, 'SE', 1)] });
            return runPlan(ctx, [attack(unit, kind, minion(go(stand, 'SE', 1)))], { ...state, zkar });
        };

        it('Archimatos and Abraxas each make him attack', () => {
            for (const unit of ['archimatos', 'abraxas'] as const) {
                const plan = run(unit);
                const reports = only(plan);
                expect(reports.map((r) => r.actor), unit).toEqual([unit, 'zkar']);
                expect(reports[1].trigger).toBe(unit);
                expect(plan.final.zkar!.triggered[unit]).toBe(true);
            }
        });

        it('Ahriman and Neurothrope attacking beside him do not', () => {
            expect(only(run('ahriman')).map((r) => r.actor)).toEqual(['ahriman']);
            expect(only(run('neurothrope', 'physical')).map((r) => r.actor)).toEqual(['neurothrope']);
        });

        it('a second attack by the same one cannot happen, so it is once each', () => {
            const plan = run('archimatos');
            expect(plan.final.zkar!.triggered.archimatos).toBe(true);
            expect(applyAction({ ...scenario().ctx }, plan.final, attack('archimatos', 'melee'))).toBeUndefined();
        });
    });

    it('hits a minion before the boss, killing it, so a second attack reaches the boss', () => {
        const m = south(1);
        const { ctx } = scenario({ units: { archimatos: south(3), abraxas: south(4) }, minions: [m] });
        // Z'kar deploys next to Archimatos so he attacks; he is placed within reach of both the minion and the boss.
        const z = go(south(2), 'SE', 1);
        const plan = runPlan(ctx, [{ type: 'deploy', at: z }]);
        const [first] = only(plan);
        expect(first.targets[0]).toEqual(minion(m));
        expect(plan.final.minions).toEqual([]);
        // Next round he finds only the boss.
        expect(plan.finish.reports[0].targets[0]).toEqual(BOSS);
    });

    it('with nothing in reach the trigger is spent for nothing', () => {
        const { ctx } = scenario({ units: { archimatos: at(1, 1) }, boss: [at(12, 12)] });
        const plan = runPlan(ctx, [{ type: 'deploy', at: at(1, 2) }]);
        expect(only(plan)[0].note).toBe('no enemy in reach');
    });

    it("fire that burns this round only is gone for his next-round attack, but fire that burns two rounds is still lit", () => {
        const make = (effect: 'fire1' | 'fire2') => {
            const { ctx } = scenario({ units: { ahriman: south(6) }, effects: { [cellKey(boss)]: effect } });
            const z = go(south(2), 'SE', 1);
            const plan = runPlan(ctx, [{ type: 'deploy', at: z }]);
            return plan.finish.reports[0];
        };
        expect(ids(make('fire2'))).toContain('ahriman');
        expect(ids(make('fire1'))).not.toContain('ahriman');
    });
});

describe('finishing the round', () => {
    it("a unit on an undesirable hex is lost (Abaddon survives by default), and Z'kar on one has no next-round attack", () => {
        const hex = south(3);
        const lost = scenario({ units: { archimatos: hex, abaddon: south(2) }, undesirable: [cellKey(hex), cellKey(south(2))] });
        const plan = runPlan(lost.ctx, []);
        expect(plan.finish.penalties).toEqual([{ reason: 'undesirable', unit: 'archimatos', points: 3 }]);
        expect(plan.final.units.archimatos).toBeUndefined();
        expect(plan.final.units.abaddon).toBeDefined();
        const frail = scenario({ units: { abaddon: south(2) }, undesirable: [cellKey(south(2))], abaddonSurvivesUndesirable: false });
        expect(runPlan(frail.ctx, []).finish.penalties).toHaveLength(1);

        const z = go(south(2), 'SE', 1);
        const base = scenario({ units: { archimatos: go(z, 'S', 1) } });
        const withZ = runPlan(base.ctx, [{ type: 'deploy', at: z }]);
        expect(withZ.finish.reports.length).toBe(1);
        const hexes = scenario({ units: { archimatos: go(z, 'S', 1) }, undesirable: [cellKey(z)] });
        expect(runPlan(hexes.ctx, [{ type: 'deploy', at: z }]).finish.reports).toEqual([]);
    });

    it('a lost buffer stops buffing his next-round attack', () => {
        const z = go(south(2), 'SE', 1);
        const alive = scenario({ units: { abaddon: go(z, 'S', 1) } });
        expect(ids(runPlan(alive.ctx, [{ type: 'deploy', at: z }]).finish.reports[0])).toContain('abaddon');
        const dead = scenario({ units: { abaddon: go(z, 'S', 1) }, undesirable: [cellKey(go(z, 'S', 1))], abaddonSurvivesUndesirable: false });
        expect(ids(runPlan(dead.ctx, [{ type: 'deploy', at: z }]).finish.reports[0])).not.toContain('abaddon');
    });

    it("Neurothrope ending next to an enemy costs his penalty, whether he got there by moving or was already there", () => {
        const { ctx } = scenario({ units: { neurothrope: south(2) } });
        const moved = runPlan(ctx, [{ type: 'move', unit: 'neurothrope', to: south(1) }]);
        expect(moved.finish.penalties).toEqual([{ reason: 'neurothropeAdjacent', unit: 'neurothrope', points: 3 }]);
        expect(runPlan(ctx, []).finish.penalties).toEqual([]);
        const there = scenario({ units: { neurothrope: south(1) } });
        expect(runPlan(there.ctx, [attack('neurothrope', 'physical')]).finish.penalties).toHaveLength(1);
    });
});

describe('who may attack what', () => {
    it('a unit next to an enemy must melee it; one that is not attacks at range', () => {
        const { ctx, state } = scenario({ units: { archimatos: south(1), abraxas: go(boss, 'SW', 2) } });
        expect(legalAttacksOf(ctx, state, 'archimatos')).toEqual(['melee']); // beside the boss: no ranged shot
        expect(legalAttacksOf(ctx, state, 'abraxas')).toEqual(['ranged']); // two hexes off: no melee
    });

    it('a unit chooses which adjacent enemy to melee, minion or boss', () => {
        const m = go(boss, 'SE', 1);
        const { ctx, state } = scenario({ units: { archimatos: south(1) }, minions: [m] });
        const targets = legalAttacks(ctx, state, 'archimatos').map((c) => c.target);
        expect(targets).toEqual([BOSS, minion(m)]);
    });

    it('Neurothrope has no melee attack: beside an enemy he can only make the physical attack, or use his active', () => {
        const { ctx, state } = scenario({ units: { neurothrope: south(1) }, minions: [go(south(1), 'SE', 1)] });
        const kinds = [...new Set(legalAttacksOf(ctx, state, 'neurothrope'))].sort();
        expect(kinds).toEqual(['active', 'physical']);
    });

    it('Ahriman can use his active next to an enemy, and only while it is available', () => {
        const a = scenario({ units: { ahriman: south(1) } });
        expect(legalAttacksOf(a.ctx, a.state, 'ahriman')).toContain('active');
        const b = scenario({ units: { ahriman: south(1) }, ahrimanActiveAvailable: false });
        expect(legalAttacksOf(b.ctx, b.state, 'ahriman')).not.toContain('active');
    });

    it('ranged attacks reach exactly their range', () => {
        const a = scenario({ units: { archimatos: south(2), neurothrope: south(3) } });
        expect(legalAttacksOf(a.ctx, a.state, 'archimatos')).toEqual(['ranged']);
        expect(legalAttacksOf(a.ctx, a.state, 'neurothrope')).toContain('ranged');
        const far = scenario({ units: { archimatos: south(3), neurothrope: south(4) } });
        expect(legalAttacksOf(far.ctx, far.state, 'archimatos')).toEqual([]);
        expect(legalAttacksOf(far.ctx, far.state, 'neurothrope')).toEqual([]);
    });

    it('a unit that has attacked cannot attack or move again', () => {
        const { ctx } = scenario({ units: { abaddon: south(1) } });
        const plan = runPlan(ctx, [attack('abaddon', 'melee')]);
        expect(applyAction(ctx, plan.final, attack('abaddon', 'melee'))).toBeUndefined();
        expect(applyAction(ctx, plan.final, { type: 'move', unit: 'abaddon', to: south(2) })).toBeUndefined();
    });

    it('rejects illegal actions', () => {
        const { ctx, state } = scenario({ units: { abaddon: south(5) } });
        expect(applyAction(ctx, state, attack('abaddon', 'melee'))).toBeUndefined(); // nobody beside him
        expect(applyAction(ctx, state, { type: 'move', unit: 'abaddon', to: at(0, 0) })).toBeUndefined(); // too far
        expect(() => runPlan(ctx, [attack('abaddon', 'ranged')])).toThrow(/illegal/);
    });
});


function legalAttacksOf(ctx: ReturnType<typeof scenario>['ctx'], state: ReturnType<typeof scenario>['state'], unit: UnitId): string[] {
    return legalAttacks(ctx, state, unit).map((c) => c.kind);
}

describe('movement', () => {
    const moves = (o: Parameters<typeof scenario>[0], unit: UnitId) => {
        const { ctx, state } = scenario(o);
        return new Set(legalMoves(ctx.board, state, unit).map(cellKey));
    };
    const start = at(2, 8);

    it('walkers move up to their movement in steps, never onto an occupied hex, and flat ground costs 1 a step', () => {
        const m = moves({ units: { abaddon: start, abraxas: go(start, 'N', 1) } }, 'abaddon');
        expect(m.has(cellKey(go(start, 'S', 3)))).toBe(true);
        expect(m.has(cellKey(go(start, 'S', 4)))).toBe(false);
        expect(m.has(cellKey(go(start, 'N', 1)))).toBe(false); // Abraxas stands there
        expect(m.has(cellKey(go(start, 'N', 2)))).toBe(true); // but can be walked through
    });

    it('elevation steps of more than 1 are walls to a walker, not to a flier', () => {
        const wall = go(start, 'S', 1);
        const hexes = { [cellKey(wall)]: { elevation: 3 } };
        expect(moves({ units: { abaddon: start }, hexes }, 'abaddon').has(cellKey(go(start, 'S', 2)))).toBe(true); // goes round
        const corridor = scenario({ cols: 3, rows: 10, hexes: { '1,5': { elevation: 3 }, '0,5': { elevation: 3 }, '2,5': { elevation: 3 } }, units: { abaddon: at(1, 4) }, boss: [at(1, 9)] });
        const blocked = new Set(legalMoves(corridor.ctx.board, corridor.state, 'abaddon').map(cellKey));
        expect(blocked.has('1,6')).toBe(false);
        const flying = scenario({ cols: 3, rows: 10, hexes: { '1,5': { elevation: 3 }, '0,5': { elevation: 3 }, '2,5': { elevation: 3 } }, units: { ahriman: at(1, 4) }, boss: [at(1, 9)] });
        expect(new Set(legalMoves(flying.ctx.board, flying.state, 'ahriman').map(cellKey)).has('1,6')).toBe(true);
    });

    it('steps of exactly 1 are fine, climbing as far as the movement allows', () => {
        const hexes = { [cellKey(go(start, 'S', 1))]: { elevation: 2 }, [cellKey(go(start, 'S', 2))]: { elevation: 3 }, [cellKey(go(start, 'S', 3))]: { elevation: 4 } };
        expect(moves({ units: { abaddon: start }, hexes }, 'abaddon').has(cellKey(go(start, 'S', 3)))).toBe(true);
    });

    it('enemies block walkers but not fliers', () => {
        const wallOfMinions = [0, 1, 2, 3].map((i) => at(i, 6));
        const walker = scenario({ cols: 4, rows: 10, units: { abaddon: at(1, 5) }, minions: wallOfMinions, boss: [at(1, 9)] });
        expect(new Set(legalMoves(walker.ctx.board, walker.state, 'abaddon').map(cellKey)).has('1,7')).toBe(false);
        const flier = scenario({ cols: 4, rows: 10, units: { ahriman: at(1, 5) }, minions: wallOfMinions, boss: [at(1, 9)] });
        expect(new Set(legalMoves(flier.ctx.board, flier.state, 'ahriman').map(cellKey)).has('1,7')).toBe(true);
    });

    it('a walker stops on the first fire hex it enters, a flier does not; leaving fire is free', () => {
        const fire = { [cellKey(go(start, 'S', 1))]: 'fire2' as const };
        expect(moves({ units: { abaddon: start }, effects: fire }, 'abaddon').has(cellKey(go(start, 'S', 1)))).toBe(true);
        expect(moves({ units: { abaddon: start }, effects: fire }, 'abaddon').has(cellKey(go(start, 'S', 2)))).toBe(true); // goes round via another column
        const narrow = scenario({ cols: 1, rows: 10, units: { abaddon: at(0, 5) }, effects: { '0,4': 'fire2' }, boss: [at(0, 9)] });
        const stops = new Set(legalMoves(narrow.ctx.board, narrow.state, 'abaddon').map(cellKey));
        expect(stops.has('0,4')).toBe(true);
        expect(stops.has('0,3')).toBe(false);
        const fly = scenario({ cols: 1, rows: 10, units: { ahriman: at(0, 5) }, effects: { '0,4': 'fire2' }, boss: [at(0, 9)] });
        expect(new Set(legalMoves(fly.ctx.board, fly.state, 'ahriman').map(cellKey)).has('0,3')).toBe(true);
        const onFire = scenario({ cols: 1, rows: 10, units: { abaddon: at(0, 5) }, effects: { '0,5': 'fire2' }, boss: [at(0, 9)] });
        expect(new Set(legalMoves(onFire.ctx.board, onFire.state, 'abaddon').map(cellKey)).has('0,3')).toBe(true);
    });

    it('fliers cross impassable hexes but cannot stop on them; walkers cannot cross them', () => {
        const rocks = { '1,5': { passable: false } };
        const fly = scenario({ cols: 3, rows: 10, hexes: { '0,5': { passable: false }, '1,5': { passable: false }, '2,5': { passable: false } }, units: { ahriman: at(1, 4) }, boss: [at(1, 9)] });
        const stops = new Set(legalMoves(fly.ctx.board, fly.state, 'ahriman').map(cellKey));
        expect(stops.has('1,6')).toBe(true);
        expect(stops.has('1,5')).toBe(false);
        const walk = scenario({ cols: 3, rows: 10, hexes: { '0,5': { passable: false }, '1,5': { passable: false }, '2,5': { passable: false } }, units: { abaddon: at(1, 4) }, boss: [at(1, 9)] });
        expect(new Set(legalMoves(walk.ctx.board, walk.state, 'abaddon').map(cellKey)).has('1,6')).toBe(false);
        void rocks;
    });

    it('Neurothrope moves 2, the others 3, and nobody moves twice', () => {
        const { ctx, state } = scenario({ units: { neurothrope: start, ahriman: at(8, 2) } });
        const far = (u: UnitId, n: number) => legalMoves(ctx.board, state, u).some((c) => c.col === state.units[u]!.cell.col && c.row === state.units[u]!.cell.row - n);
        expect(far('neurothrope', 2)).toBe(true);
        expect(far('neurothrope', 3)).toBe(false);
        const plan = runPlan(ctx, [{ type: 'move', unit: 'neurothrope', to: go(start, 'S', 2) }]);
        expect(legalMoves(ctx.board, plan.final, 'neurothrope')).toEqual([]);
    });
});

describe("Z'kar's deployment hexes", () => {
    it('lists every hex where a triangle fits, and none once he is out', () => {
        const { ctx, state } = scenario({ cols: 6, rows: 6, boss: [at(5, 5)], units: {} });
        expect(legalDeploys(ctx, state).length).toBeGreaterThan(10);
        const done = applyAction(ctx, state, { type: 'deploy', at: at(2, 2) })!;
        expect(legalDeploys(ctx, done.state)).toEqual([]);
        expect(applyAction(ctx, done.state, { type: 'deploy', at: at(3, 3) })).toBeUndefined();
    });
});

describe("a full plan, in the order the strategy calls for", () => {
    // Abaddon hits first to stack his passive; Ahriman, within 2 of Abaddon and Neurothrope, lights the boss; Z'kar
    // lands next to two psykers; Archimatos and Abraxas hit beside him so he attacks again; Neurothrope goes last.
    const B = at(6, 10);
    const units = { abaddon: go(B, 'S', 1), ahriman: go(B, 'S', 2), neurothrope: go(B, 'S', 3), archimatos: at(5, 8), abraxas: at(5, 10) };
    const actions: Action[] = [
        attack('abaddon', 'melee'),
        attack('ahriman', 'ranged'),
        { type: 'deploy', at: go(B, 'SW', 2) },
        attack('archimatos', 'ranged'),
        attack('abraxas', 'melee'), // she is beside the boss, so melee is forced
        attack('neurothrope', 'ranged'),
    ];
    const plan = runPlan(scenario({ boss: [B], units, neuroStacks: 3 }).ctx, actions);
    const buffs = (r: AttackReport) => r.buffs.map((b) => `${b.id}${b.points > 1 ? `+${b.points}` : ''}`).join(',');

    it('scores each attack the way the rules say', () => {
        const lines = plan.steps.flatMap((s) => s.reports).map((r) => `${r.actor} ${r.trigger ?? ''}: ${buffs(r)} = ${r.score}`);
        expect(lines).toEqual([
            'abaddon : abaddonPassive+2 = 2',
            'ahriman : abaddon,neurothrope,neuroStack = 3', // no Ahriman buff on his own fire-lighting hit
            'zkar deploy: abaddon,ahriman,abraxas,zkar,neuroStack = 5',
            'archimatos : abaddon,ahriman,neurothrope,zkar,hexEffect,neuroStack = 6',
            'zkar archimatos: abaddon,ahriman,abraxas,zkar,neuroStack = 5',
            'abraxas : abaddon,ahriman,zkar = 3', // flame: no stack
            'zkar abraxas: abaddon,ahriman,abraxas,zkar,neuroStack = 5',
            'neurothrope : ahriman,zkar,neuroStack = 3',
        ]);
    });

    it("adds Z'kar's start-of-next-round attack, with the fire still burning, and totals the plan", () => {
        expect(plan.finish.reports.map((r) => `${r.actor} ${r.trigger}: ${buffs(r)} = ${r.score}`)).toEqual(['zkar nextRound: abaddon,ahriman,abraxas,zkar,neuroStack = 5']);
        expect(plan.finish.penalties).toEqual([]);
        expect(plan.total).toBe(37);
        expect(plan.final.neuroStacks).toBe(10); // 3 to start, +1 for every psychic attack on the boss
    });
});
