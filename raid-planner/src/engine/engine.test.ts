import { describe, expect, it } from 'vitest';
import { abilityValue } from '../core/abilities';
import { hitDamage, pierceRatio } from '../core/damage';
import { Cell, cellKey } from '../core/hex';
import { Roster, maxedRoster, withRarity, withRelic } from '../core/roster';
import { UnitId } from '../core/setup';
import { characterStats } from '../core/stats';
import { AttackReport, legalAttacks, zkarAttack } from './attacks';
import { legalMoves } from './movement';
import { Action, PlanResult, applyAction, legalDeploys, runPlan } from './plan';
import { Enemy, State } from './state';
import { BOSS, go, minion, scenario } from './testkit';

const at = (col: number, row: number): Cell => ({ col, row });
const attack = (unit: UnitId, kind: 'ranged' | 'melee' | 'active' | 'physical', target = BOSS, extra?: Enemy): Action => ({ type: 'attack', unit, kind, target, ...(extra ? { extra } : {}) });
const only = (plan: PlanResult): AttackReport[] => plan.steps.flatMap((s) => s.reports);
const first = (plan: PlanResult): AttackReport => only(plan)[0];

// The boss is a single hex at (6,10). Straight "S" steps from it run down the column, so go(boss,'S',k) is k hexes away.
const boss = at(6, 10);
const south = (k: number) => go(boss, 'S', k);

// The units as the roster starts: Mythic, wings, Adamantine II, abilities at 60, relics at 10. Boss and minion armor are 1000.
const roster: Roster = maxedRoster();
const damageStat = (u: UnitId): number => characterStats(u, roster[u])!.damage;
const mythic = (id: string, variable: string, level = 60): number => abilityValue(id, variable, level, 'Mythic');
const flatOf = (g: { flat: Array<{ id: string; amount: number }> }): Record<string, number> => Object.fromEntries(g.flat.map((f) => [f.id, f.amount]));
const modsOf = (g: { modifiers: Array<{ id: string; multiplier: number }> }): Record<string, number> => Object.fromEntries(g.modifiers.map((m) => [m.id, m.multiplier]));
const avg = (a: number, b: number) => (a + b) / 2;
const ARMOR = 1000;
/** The damage of `hits` hits worked out the way core/damage.ts does. */
const hits = (n: number, damage: number, profile: string, fixed = 0, mods: number[] = [], armor = ARMOR): number => n * hitDamage({ damage, fixed, armor, pierce: pierceRatio(profile), modifiers: mods });

describe('damage: a hit takes armor off, and only damage to the boss counts', () => {
    it("Abaddon's melee is five Power hits, each losing the boss's armor", () => {
        const { ctx } = scenario({ units: { abaddon: south(1) } });
        const r = first(runPlan(ctx, [attack('abaddon', 'melee')]));
        expect(r.groups).toHaveLength(1);
        expect(r.groups[0]).toMatchObject({ hits: 5, profile: 'Power', base: damageStat('abaddon'), armor: ARMOR });
        expect(r.damage).toBe(5 * (damageStat('abaddon') - ARMOR)); // 5 x 1001
        expect(r.score).toBe(r.damage);
    });

    it('armor stops no more than the pierce ratio lets through', () => {
        const { ctx } = scenario({ units: { abaddon: south(1) }, armor: { boss: 5000, minion: 1000 } });
        expect(first(runPlan(ctx, [attack('abaddon', 'melee')])).damage).toBeCloseTo(5 * damageStat('abaddon') * 0.4, 6);
    });

    it('psychic hits ignore armor', () => {
        const { ctx } = scenario({ units: { archimatos: south(2) }, armor: { boss: 99999, minion: 99999 } });
        expect(first(runPlan(ctx, [attack('archimatos', 'ranged')])).damage).toBe(damageStat('archimatos'));
    });

    it('damage to a minion is worked out but does not count towards the plan', () => {
        const m = south(1);
        const { ctx } = scenario({ units: { archimatos: south(3) }, minions: [m] });
        const r = first(runPlan(ctx, [attack('archimatos', 'ranged', minion(m))]));
        expect(r.groups[0].target).toEqual(minion(m));
        expect(r.groups[0].damage).toBe(damageStat('archimatos'));
        expect(r.damage).toBe(0);
    });

    it('works in the roster: a lesser unit hits for less', () => {
        const weak: Roster = { ...roster, archimatos: withRarity('archimatos', roster.archimatos, 'Epic') };
        const { ctx } = scenario({ units: { archimatos: south(2) }, roster: weak });
        expect(first(runPlan(ctx, [attack('archimatos', 'ranged')])).damage).toBe(characterStats('archimatos', weak.archimatos)!.damage);
        expect(first(runPlan(ctx, [attack('archimatos', 'ranged')])).damage).toBeLessThan(damageStat('archimatos'));
    });
});

describe("Abaddon's passive: flat damage for Chaos units near him, growing with his attacks", () => {
    const passive = (stacks: number) => Math.min(mythic('FirstAmongTraitors', 'maxDmg'), mythic('FirstAmongTraitors', 'extraDmg') + stacks * mythic('FirstAmongTraitors', 'extraDmg_2'));

    it('adds to every hit of a Chaos unit within 2 hexes: 652 to start, 130 more for each attack he has made', () => {
        for (const stacks of [0, 3, 13]) {
            const { ctx } = scenario({ units: { abaddon: south(4), archimatos: south(2) }, abaddonStacks: stacks });
            const g = first(runPlan(ctx, [attack('archimatos', 'ranged')])).groups[0];
            expect(flatOf(g).abaddonPassive).toBe(passive(stacks));
            expect(g.damage).toBe(hits(1, damageStat('archimatos'), 'Psychic', passive(stacks)));
        }
        expect(passive(0)).toBe(652);
        expect(passive(13)).toBe(2342);
    });

    it('stops growing at the maximum, and his stacks stop at 13', () => {
        const { ctx } = scenario({ units: { abaddon: south(4), archimatos: south(2) }, abaddonStacks: 13 });
        expect(flatOf(first(runPlan(ctx, [attack('archimatos', 'ranged')])).groups[0]).abaddonPassive).toBe(2342);
    });

    it("is not for Abaddon, for units more than 2 away, or for Neurothrope (he is not Chaos)", () => {
        const far = scenario({ units: { abaddon: south(5), archimatos: south(2) } });
        expect(flatOf(first(runPlan(far.ctx, [attack('archimatos', 'ranged')])).groups[0]).abaddonPassive).toBeUndefined();
        const self = scenario({ units: { abaddon: south(1) } });
        expect(flatOf(first(runPlan(self.ctx, [attack('abaddon', 'melee')])).groups[0]).abaddonPassive).toBeUndefined();
        const xeno = scenario({ units: { abaddon: south(4), neurothrope: south(3) }, neuroStacks: 2 });
        expect(flatOf(first(runPlan(xeno.ctx, [attack('neurothrope', 'ranged')])).groups[0]).abaddonPassive).toBeUndefined();
    });

    it('counts attacks as he makes them: after his own attack the next unit gets more', () => {
        const { ctx } = scenario({ units: { abaddon: south(1), archimatos: south(2) } });
        const plan = runPlan(ctx, [attack('abaddon', 'melee'), attack('archimatos', 'ranged')]);
        const [, second] = only(plan);
        expect(flatOf(second.groups[0]).abaddonPassive).toBe(passive(1)); // his one attack
        expect(plan.final.abaddonStacks).toBe(1);
    });

    it('each enemy he hits is an attack: his ranged shot one, and Talon of Horus one more for each other enemy it reaches', () => {
        const ranged = scenario({ units: { abaddon: south(2) } });
        expect(runPlan(ranged.ctx, [attack('abaddon', 'ranged')]).final.abaddonStacks).toBe(1);
        const m1 = go(boss, 'SE', 1);
        const m2 = go(boss, 'SW', 1);
        const talon = scenario({ units: { abaddon: south(1) }, minions: [m1, m2] });
        expect(runPlan(talon.ctx, [attack('abaddon', 'melee')]).final.abaddonStacks).toBe(3);
        const capped = scenario({ units: { abaddon: south(1) }, minions: [m1, m2], abaddonStacks: 12 });
        expect(runPlan(capped.ctx, [attack('abaddon', 'melee')]).final.abaddonStacks).toBe(13);
    });
});

describe("Ahriman's Psychic Stalk: +33% on Flame and Psychic hits against a burning enemy, and flat damage for Chaos units", () => {
    const burning = { [cellKey(boss)]: 'fire2' as const };
    const flat = mythic('PsychicStalk', 'extraDmg');
    const pct = 1 + mythic('PsychicStalk', 'extraDmgPct') / 100;

    it('Archimatos (Chaos, psychic) gets both', () => {
        const { ctx } = scenario({ units: { ahriman: south(6), archimatos: south(2) }, effects: burning });
        const g = first(runPlan(ctx, [attack('archimatos', 'ranged')])).groups[0];
        expect(flatOf(g).psychicStalkFlat).toBe(flat);
        expect(modsOf(g).psychicStalk).toBeCloseTo(pct, 10);
        expect(g.hits).toBe(2); // Let the Galaxy Burn: the boss is on a hex with an effect, and fire is one
        expect(g.damage).toBeCloseTo(hits(2, damageStat('archimatos'), 'Psychic', flat, [pct]), 6);
    });

    it('Neurothrope (not Chaos) gets the percentage only', () => {
        const { ctx } = scenario({ units: { ahriman: south(6), neurothrope: south(3) }, effects: burning });
        const g = first(runPlan(ctx, [attack('neurothrope', 'ranged')])).groups[0];
        expect(flatOf(g).psychicStalkFlat).toBeUndefined();
        expect(modsOf(g).psychicStalk).toBeCloseTo(pct, 10);
    });

    it('Flame counts too (Abraxas in melee), but Power does not (Abaddon)', () => {
        const flame = scenario({ units: { ahriman: south(6), abraxas: south(1) }, effects: burning });
        const g = first(runPlan(flame.ctx, [attack('abraxas', 'melee')])).groups[0];
        expect(g).toMatchObject({ profile: 'Flame', hits: 2 });
        expect(modsOf(g).psychicStalk).toBeCloseTo(pct, 10);
        expect(flatOf(g).psychicStalkFlat).toBe(flat);
        const power = scenario({ units: { ahriman: south(6), abaddon: south(1) }, effects: burning });
        const p = first(runPlan(power.ctx, [attack('abaddon', 'melee')])).groups[0];
        expect(p.modifiers).toEqual([]);
        expect(flatOf(p).psychicStalkFlat).toBeUndefined();
    });

    it('needs a burning enemy, and Ahriman on the board', () => {
        const cold = scenario({ units: { ahriman: south(6), archimatos: south(2) } });
        expect(first(runPlan(cold.ctx, [attack('archimatos', 'ranged')])).groups[0].modifiers).toEqual([]);
        const alone = scenario({ units: { archimatos: south(2) }, effects: burning });
        expect(first(runPlan(alone.ctx, [attack('archimatos', 'ranged')])).groups[0].modifiers).toEqual([]);
    });

    it('does not help his own fire-lighting hit, but lights the boss for the next', () => {
        const { ctx } = scenario({ units: { ahriman: south(2), archimatos: go(boss, 'SW', 2) } });
        const plan = runPlan(ctx, [attack('ahriman', 'ranged'), attack('archimatos', 'ranged')]);
        const [a, b] = only(plan);
        expect(modsOf(a.groups[0]).psychicStalk).toBeUndefined();
        expect(modsOf(b.groups[0]).psychicStalk).toBeCloseTo(pct, 10);
        expect(plan.final.effects[cellKey(boss)]).toBe('fire2');
    });

    it("Abraxas's melee flame attack lights the boss too, and Ahriman's active does not", () => {
        const abraxas = scenario({ units: { abraxas: south(1) } });
        expect(runPlan(abraxas.ctx, [attack('abraxas', 'melee')]).final.effects[cellKey(boss)]).toBe('fire2');
        const doombolt = scenario({ units: { ahriman: south(2) } });
        expect(runPlan(doombolt.ctx, [attack('ahriman', 'active')]).final.effects[cellKey(boss)]).toBeUndefined();
    });
});

describe('the Norn Crown and the Neuroparasite', () => {
    const crown = abilityValue('NornCrown', 'extraDmg', 10);
    const perLevel = mythic('Neuroparasite', 'extraDmg');

    it('the crown gives psykers and summons within 2 of Neurothrope +1308 against an infected enemy', () => {
        const { ctx } = scenario({ units: { neurothrope: south(4), archimatos: south(2) }, neuroStacks: 3 });
        const g = first(runPlan(ctx, [attack('archimatos', 'ranged')])).groups[0];
        expect(flatOf(g).nornCrown).toBe(crown);
        expect(g.damage).toBe(hits(1, damageStat('archimatos'), 'Psychic', crown));
    });

    it('but not against an uninfected one, not without the crown, not beyond 2, and not for Neurothrope or Abaddon', () => {
        const clean = scenario({ units: { neurothrope: south(4), archimatos: south(2) }, neuroStacks: 0 });
        expect(flatOf(first(runPlan(clean.ctx, [attack('archimatos', 'ranged')])).groups[0]).nornCrown).toBeUndefined();
        const noCrown: Roster = { ...roster, neurothrope: withRelic('neurothrope', roster.neurothrope, undefined) };
        const bare = scenario({ units: { neurothrope: south(4), archimatos: south(2) }, neuroStacks: 3, roster: noCrown });
        expect(flatOf(first(runPlan(bare.ctx, [attack('archimatos', 'ranged')])).groups[0]).nornCrown).toBeUndefined();
        const far = scenario({ units: { neurothrope: south(6), archimatos: south(2) }, neuroStacks: 3 });
        expect(flatOf(first(runPlan(far.ctx, [attack('archimatos', 'ranged')])).groups[0]).nornCrown).toBeUndefined();
        const self = scenario({ units: { neurothrope: south(3) }, neuroStacks: 3 });
        expect(flatOf(first(runPlan(self.ctx, [attack('neurothrope', 'ranged')])).groups[0]).nornCrown).toBeUndefined();
        const brute = scenario({ units: { neurothrope: south(3), abaddon: south(1) }, neuroStacks: 3 });
        expect(flatOf(first(runPlan(brute.ctx, [attack('abaddon', 'melee')])).groups[0]).nornCrown).toBeUndefined();
    });

    it("Neurothrope's own psychic hits get +2218 for each level the parasite had before the attack", () => {
        const { ctx } = scenario({ units: { neurothrope: south(3) }, neuroStacks: 4 });
        const plan = runPlan(ctx, [attack('neurothrope', 'ranged')]);
        const g = first(plan).groups[0];
        expect(flatOf(g).neuroparasite).toBe(4 * perLevel);
        expect(g.damage).toBe(hits(1, damageStat('neurothrope'), 'Psychic', 4 * perLevel));
        expect(plan.final.neuroStacks).toBe(5); // and then it grows
    });

    it('the first Neurothrope hit infects the boss without any bonus; nobody else infects it', () => {
        const { ctx } = scenario({ units: { archimatos: south(2), neurothrope: south(3) }, neuroStacks: 0 });
        const plan = runPlan(ctx, [attack('archimatos', 'ranged'), attack('neurothrope', 'ranged')]);
        const [a, n] = only(plan);
        expect(flatOf(a.groups[0]).nornCrown).toBeUndefined();
        expect(flatOf(n.groups[0]).neuroparasite).toBeUndefined();
        expect(plan.final.neuroStacks).toBe(1);
    });

    it('grows by one for every psychic attack on an infected boss, but not for a flame or a physical one', () => {
        const psychic = scenario({ units: { archimatos: south(2), ahriman: go(boss, 'SW', 2) }, neuroStacks: 4 });
        expect(runPlan(psychic.ctx, [attack('archimatos', 'ranged'), attack('ahriman', 'ranged')]).final.neuroStacks).toBe(6);
        const flame = scenario({ units: { abraxas: south(1) }, neuroStacks: 3 });
        expect(runPlan(flame.ctx, [attack('abraxas', 'melee')]).final.neuroStacks).toBe(3);
    });

    it('stops at 16 with the Norn Crown and 15 without it', () => {
        const withCrown = scenario({ units: { archimatos: south(2) }, neuroStacks: 16 });
        expect(runPlan(withCrown.ctx, [attack('archimatos', 'ranged')]).final.neuroStacks).toBe(16);
        const noCrown: Roster = { ...roster, neurothrope: withRelic('neurothrope', roster.neurothrope, undefined) };
        const without = scenario({ units: { archimatos: south(2), neurothrope: south(9) }, neuroStacks: 14, roster: noCrown });
        expect(runPlan(without.ctx, [attack('archimatos', 'ranged')]).final.neuroStacks).toBe(15);
        const full = scenario({ units: { archimatos: south(2) }, neuroStacks: 15, roster: noCrown });
        expect(runPlan(full.ctx, [attack('archimatos', 'ranged')]).final.neuroStacks).toBe(15);
    });
});

describe('extra hits', () => {
    it("Infernal Pacts: a Chaos unit beside Abraxas adds a Psychic hit of the average of 1306 and 2610 to its ranged attack", () => {
        const { ctx } = scenario({ units: { abaddon: south(2), abraxas: go(south(2), 'SE', 1) }, neuroStacks: 2 });
        const plan = runPlan(ctx, [attack('abaddon', 'ranged')]);
        const r = first(plan);
        expect(r.groups.map((g) => g.label)).toEqual(['Bolter ranged attack', 'Infernal Pacts bonus hit']);
        const bonus = r.groups[1];
        expect(bonus).toMatchObject({ hits: 1, profile: 'Psychic', base: avg(1306, 2610) });
        expect(r.damage).toBeCloseTo(hits(3, damageStat('abaddon'), 'Bolter') + avg(1306, 2610), 6);
        expect(plan.final.neuroStacks).toBe(3); // the psychic hit grows the parasite
    });

    it('is not for Abraxas himself, for units not beside him, or for a melee attack (but a Daemon gets it there too)', () => {
        const far = scenario({ units: { abaddon: south(2), abraxas: south(6) } });
        expect(first(runPlan(far.ctx, [attack('abaddon', 'ranged')])).groups).toHaveLength(1);
        const self = scenario({ units: { abraxas: south(2) } });
        expect(first(runPlan(self.ctx, [attack('abraxas', 'ranged')])).groups).toHaveLength(1);
        const melee = scenario({ units: { abaddon: south(1), abraxas: go(south(1), 'SE', 1) } });
        expect(first(runPlan(melee.ctx, [attack('abaddon', 'melee')])).groups.some((g) => g.label.includes('Infernal Pacts'))).toBe(false);
    });

    it("Z'kar is a Chaos Daemon, so Infernal Pacts adds its hit to his melee attack too when he is beside Abraxas", () => {
        const { ctx, state } = scenario({ units: { abraxas: south(3) } });
        const z: State = { ...state, zkar: { cells: [south(1), go(south(1), 'SE', 1), go(south(1), 'S', 1)], triggered: { deploy: true, archimatos: false, abraxas: false } } };
        const r = zkarAttack(ctx, z, 'deploy').reports[0];
        expect(r.kind).toBe('melee');
        expect(r.groups.map((g) => g.label)).toContain('Infernal Pacts bonus hit');
    });

    it("Let the Galaxy Burn: Abaddon and Archimatos get an extra hit when the enemy is on a hex with an effect", () => {
        for (const effect of ['fire1', 'despoiled', 'contaminated'] as const) {
            const a = scenario({ units: { abaddon: south(1) }, effects: { [cellKey(boss)]: effect } });
            expect(first(runPlan(a.ctx, [attack('abaddon', 'melee')])).groups[0].hits).toBe(6);
            const b = scenario({ units: { archimatos: south(2) }, effects: { [cellKey(boss)]: effect } });
            expect(first(runPlan(b.ctx, [attack('archimatos', 'ranged')])).groups[0].hits).toBe(2);
        }
        const plain = scenario({ units: { abaddon: south(1) } });
        expect(first(runPlan(plain.ctx, [attack('abaddon', 'melee')])).groups[0].hits).toBe(5);
        const other = scenario({ units: { abraxas: south(2) }, effects: { [cellKey(boss)]: 'despoiled' } });
        expect(first(runPlan(other.ctx, [attack('abraxas', 'ranged')])).groups[0].hits).toBe(1);
    });

    describe('the Talon of Horus', () => {
        const m1 = go(boss, 'SE', 1);
        const m2 = go(boss, 'SW', 1);
        const talon = avg(abilityValue('TalonOfHorus', 'minDmg', 10), abilityValue('TalonOfHorus', 'maxDmg', 10));

        it("also hits the other enemies beside both him and his target: three Power hits each, and they die", () => {
            const { ctx } = scenario({ units: { abaddon: south(1) }, minions: [m1, m2] });
            const plan = runPlan(ctx, [attack('abaddon', 'melee')]);
            const r = first(plan);
            expect(r.groups.map((g) => g.label)).toEqual(['Power melee attack', 'Talon of Horus', 'Talon of Horus']);
            for (const g of r.groups.slice(1)) expect(g).toMatchObject({ hits: 3, profile: 'Power', base: talon });
            expect(r.groups.slice(1).map((g) => cellKey((g.target as { cell: Cell }).cell)).sort()).toEqual([cellKey(m1), cellKey(m2)].sort());
            expect(r.damage).toBe(hits(5, damageStat('abaddon'), 'Power')); // the Talon's hits were on minions
            expect(plan.final.minions).toEqual([]);
        });

        it('hits the boss when the target is a minion beside both', () => {
            const { ctx } = scenario({ units: { abaddon: south(1) }, minions: [m1] });
            const r = first(runPlan(ctx, [attack('abaddon', 'melee', minion(m1))]));
            expect(r.damage).toBeCloseTo(hits(3, talon, 'Power'), 6);
        });

        it('is only there when he has it equipped', () => {
            const none: Roster = { ...roster, abaddon: withRelic('abaddon', roster.abaddon, undefined) };
            const { ctx } = scenario({ units: { abaddon: south(1) }, minions: [m1, m2], roster: none });
            const plan = runPlan(ctx, [attack('abaddon', 'melee')]);
            expect(first(plan).groups).toHaveLength(1);
            expect(plan.final.minions).toHaveLength(2);
            expect(plan.final.abaddonStacks).toBe(1);
        });
    });

    it("Drach'nyen's second attack is three Piercing hits of the average of its range, with its own armor math", () => {
        const { ctx } = scenario({ units: { abaddon: south(1) }, abaddonExtra: 'on' });
        const [, second] = only(runPlan(ctx, [attack('abaddon', 'melee', BOSS, BOSS)]));
        const base = avg(mythic('Drachnyen', 'minDmg'), mythic('Drachnyen', 'maxDmg'));
        expect(second.extra).toBe(true);
        expect(second.groups).toHaveLength(1);
        expect(second.groups[0]).toMatchObject({ label: "Drach'nyen", hits: 3, profile: 'Piercing', base });
        expect(second.damage).toBeCloseTo(hits(3, base, 'Piercing'), 6);
    });
});

describe('high ground and the Cabal of Sorcerers: percentage modifiers', () => {
    it('high ground is +50% on every hit of an attacker standing above its target, whoever it is', () => {
        for (const unit of ['archimatos', 'abraxas', 'neurothrope'] as const) {
            const hexes = { [cellKey(south(2))]: { elevation: 2 } };
            const { ctx } = scenario({ units: { [unit]: south(2) }, hexes, neuroStacks: 0 });
            const kind = unit === 'neurothrope' ? 'ranged' : 'ranged';
            const g = first(runPlan(ctx, [attack(unit, kind)])).groups[0];
            expect(modsOf(g).highGround).toBe(1.5);
            expect(g.damage).toBeCloseTo(hits(g.hits, g.base, g.profile, 0, [1.5]), 6);
        }
        const level = scenario({ units: { archimatos: south(2) } });
        expect(first(runPlan(level.ctx, [attack('archimatos', 'ranged')])).groups[0].modifiers).toEqual([]);
    });

    const zkar = (cells: Cell[]) => ({ cells, triggered: { deploy: true, archimatos: true, abraxas: true } });

    it("Cabal: Mythic psykers beside Z'kar deal +20% at his level 4 (the table's 20, not doubled)", () => {
        const { ctx, state } = scenario({ units: { archimatos: south(2) } });
        const withZkar: State = { ...state, zkar: zkar([south(3), go(south(3), 'SE', 1), go(south(3), 'S', 1)]) };
        const g = first(runPlan(ctx, [attack('archimatos', 'ranged')], withZkar)).groups[0];
        expect(modsOf(g).cabal).toBeCloseTo(1.2, 10);
    });

    it("follows Z'kar's stars (level 3 at 13 stars is +16%), and is not for non-Mythic units, Abaddon or when not beside him", () => {
        const three: Roster = { ...roster, zkar: { ...roster.zkar, stars: 13, abilityLevels: [60, 60, 3] } };
        const near = scenario({ units: { archimatos: south(2) }, roster: three });
        const placed: State = { ...near.state, zkar: zkar([south(3), go(south(3), 'SE', 1), go(south(3), 'S', 1)]) };
        expect(modsOf(first(runPlan(near.ctx, [attack('archimatos', 'ranged')], placed)).groups[0]).cabal).toBeCloseTo(1.16, 10);

        const lesser: Roster = { ...roster, archimatos: withRarity('archimatos', roster.archimatos, 'Legendary') };
        const l = scenario({ units: { archimatos: south(2) }, roster: lesser });
        expect(modsOf(first(runPlan(l.ctx, [attack('archimatos', 'ranged')], { ...l.state, zkar: placed.zkar })).groups[0]).cabal).toBeUndefined();

        const brute = scenario({ units: { abaddon: south(2) } });
        const noPsyker = first(runPlan(brute.ctx, [attack('abaddon', 'ranged')], { ...brute.state, zkar: placed.zkar }));
        expect(noPsyker.groups[0].modifiers).toEqual([]);

        // Not beside him: Z'kar is two hexes off.
        const apart = scenario({ units: { archimatos: south(2) } });
        const away: State = { ...apart.state, zkar: zkar([south(5), go(south(5), 'SE', 1), go(south(5), 'S', 1)]) };
        expect(modsOf(first(runPlan(apart.ctx, [attack('archimatos', 'ranged')], away)).groups[0]).cabal).toBeUndefined();
    });

    it('also applies beside another Mythic psyker, with Z\'kar anywhere on the board', () => {
        const { ctx, state } = scenario({ units: { archimatos: south(2), abraxas: south(3) } });
        const away: State = { ...state, zkar: zkar([at(1, 1), at(1, 2), at(2, 1)]) };
        expect(modsOf(first(runPlan(ctx, [attack('archimatos', 'ranged')], away)).groups[0]).cabal).toBeCloseTo(1.2, 10);
        const alone = scenario({ units: { archimatos: south(2) } });
        expect(modsOf(first(runPlan(alone.ctx, [attack('archimatos', 'ranged')], { ...alone.state, zkar: zkar([at(1, 1), at(1, 2), at(2, 1)]) })).groups[0]).cabal).toBeUndefined();
    });

    it("the modifiers multiply each other: high ground, the Stalk and Cabal together are x1.5 x1.33 x1.2", () => {
        const hexes = { [cellKey(south(2))]: { elevation: 2 } };
        const { ctx, state } = scenario({ units: { archimatos: south(2), ahriman: south(7) }, hexes, effects: { [cellKey(boss)]: 'fire2' } });
        const placed: State = { ...state, zkar: zkar([south(3), go(south(3), 'SE', 1), go(south(3), 'S', 1)]) };
        const g = first(runPlan(ctx, [attack('archimatos', 'ranged')], placed)).groups[0];
        expect(g.modifiers.map((m) => m.id).sort()).toEqual(['cabal', 'highGround', 'psychicStalk']);
        const product = g.modifiers.reduce((p, m) => p * m.multiplier, 1);
        expect(product).toBeCloseTo(1.5 * 1.33 * 1.2, 10);
    });
});

describe('smite', () => {
    it("lets a shot at a minion beside the boss grow the parasite on the boss, though its damage is not counted", () => {
        const m = south(1);
        const { ctx } = scenario({ units: { archimatos: south(3) }, minions: [m], neuroStacks: 2 });
        const plan = runPlan(ctx, [attack('archimatos', 'ranged', minion(m))]);
        expect(first(plan).smite).toEqual(BOSS);
        expect(plan.final.neuroStacks).toBe(3);
        expect(first(plan).damage).toBe(0);
    });

    it("prefers another minion to the boss, so the boss is not smited when a minion is beside the target", () => {
        const m1 = south(1);
        const m2 = go(m1, 'S', 1);
        const { ctx } = scenario({ units: { archimatos: south(4) }, minions: [m1, m2], neuroStacks: 2 });
        const plan = runPlan(ctx, [attack('archimatos', 'ranged', minion(m2))]);
        expect(first(plan).smite).toEqual(minion(m1));
        expect(plan.final.neuroStacks).toBe(2);
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
        const { ctx } = scenario({ units: { ahriman: south(3), abaddon: south(3) }, minions: [m] });
        expect(first(runPlan(ctx, [attack('ahriman', 'active', minion(m))])).smite).toBeUndefined();
        expect(first(runPlan(ctx, [attack('abaddon', 'ranged', minion(m))])).smite).toBeUndefined();
    });
});

describe("the actives: Doombolt and Spirit Leech", () => {
    it('Doombolt is three Psychic hits plus one for every burning hex (at most nine), each the average of its range', () => {
        const base = avg(mythic('Doombolt', 'minDmg'), mythic('Doombolt', 'maxDmg'));
        const none = scenario({ units: { ahriman: south(2) } });
        expect(first(runPlan(none.ctx, [attack('ahriman', 'active')])).groups[0]).toMatchObject({ hits: 3, profile: 'Psychic', base });
        const fires = { [cellKey(at(1, 1))]: 'fire2' as const, [cellKey(at(1, 2))]: 'fire1' as const };
        const burning = scenario({ units: { ahriman: south(2) }, effects: fires });
        expect(first(runPlan(burning.ctx, [attack('ahriman', 'active')])).groups[0].hits).toBe(5);
        const many: Record<string, 'fire2'> = {};
        for (let r = 0; r < 12; r++) many[cellKey(at(0, r))] = 'fire2';
        const lots = scenario({ units: { ahriman: south(2) }, effects: many });
        expect(first(runPlan(lots.ctx, [attack('ahriman', 'active')])).groups[0].hits).toBe(9);
    });

    it('shares its hits evenly among the enemies in range, the boss getting its share rounded down', () => {
        const fires = { [cellKey(at(1, 1))]: 'fire2' as const, [cellKey(at(1, 2))]: 'fire2' as const };
        const { ctx } = scenario({ units: { ahriman: south(2) }, minions: [south(3)], effects: fires });
        const r = first(runPlan(ctx, [attack('ahriman', 'active')]));
        expect(r.groups[0].hits).toBe(Math.floor(5 / 2));
    });

    it("Spirit Leech is one Psychic hit of the average of its range, with the parasite's bonus", () => {
        const base = avg(mythic('SpiritLeech', 'minDmg'), mythic('SpiritLeech', 'maxDmg'));
        const { ctx } = scenario({ units: { neurothrope: south(3) }, neuroStacks: 2 });
        const g = first(runPlan(ctx, [attack('neurothrope', 'active')])).groups[0];
        expect(g).toMatchObject({ label: 'Spirit Leech', hits: 1, profile: 'Psychic', base });
        expect(flatOf(g).neuroparasite).toBe(2 * mythic('Neuroparasite', 'extraDmg'));
    });

    it('are used once, and not when the setup says they are spent', () => {
        const spent = scenario({ units: { ahriman: south(2) }, ahrimanActiveAvailable: false });
        expect(legalAttacks(spent.ctx, spent.state, 'ahriman').some((c) => c.kind === 'active')).toBe(false);
    });
});

describe("Z'kar", () => {
    const zbase = abilityValue('AetherStride', 'summonDmg', 60, 'Mythic');

    it("is summoned with Aether Stride's damage: 914 at level 60", () => {
        expect(zbase).toBe(914);
    });

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

    it('his attack hits with his own damage, four melee hits when an enemy is beside him', () => {
        const z = south(2);
        const { ctx, state } = scenario({ units: { ahriman: go(z, 'S', 1) } });
        const r = applyAction(ctx, state, { type: 'deploy', at: z })!.reports[0];
        expect(r.actor).toBe('zkar');
        expect(r.groups[0]).toMatchObject({ hits: 4, profile: 'Psychic', base: zbase });
    });

    describe('attacking again when a bearer of the Book of Fate attacks beside him', () => {
        // Z'kar stands beside the boss; the bearer stands beside Z'kar with a minion beside it, which it kills; then Z'kar has the boss.
        const z = south(2);
        const zkar = { cells: [z, south(1), go(z, 'NE', 1)], triggered: { deploy: true, archimatos: false, abraxas: false } };
        const run = (unit: UnitId, kind: 'ranged' | 'melee' | 'physical' = 'melee', r: Roster = roster) => {
            const stand = south(3);
            const m = go(stand, 'SE', 1);
            const { ctx, state } = scenario({ units: { [unit]: stand }, minions: [m], roster: r });
            return runPlan(ctx, [attack(unit, kind, minion(m))], { ...state, zkar });
        };

        it('Archimatos and Abraxas each make him attack, with the Book\'s extra damage', () => {
            for (const unit of ['archimatos', 'abraxas'] as const) {
                const plan = run(unit);
                const reports = only(plan);
                expect(reports.map((r) => r.actor), unit).toEqual([unit, 'zkar']);
                expect(reports[1].trigger).toBe(unit);
                expect(flatOf(reports[1].groups[0]).bookOfFate).toBe(abilityValue('BookOfFate', 'extraDmg', 10));
                expect(plan.final.zkar!.triggered[unit]).toBe(true);
            }
        });

        it('only if they have the Book equipped, at its level', () => {
            const without: Roster = { ...roster, archimatos: withRelic('archimatos', roster.archimatos, undefined) };
            expect(only(run('archimatos', 'melee', without)).map((r) => r.actor)).toEqual(['archimatos']);
            const low: Roster = { ...roster, archimatos: withRelic('archimatos', roster.archimatos, 1) };
            const [, z2] = only(run('archimatos', 'melee', low));
            expect(flatOf(z2.groups[0]).bookOfFate).toBe(abilityValue('BookOfFate', 'extraDmg', 1));
        });

        it('Ahriman and Neurothrope attacking beside him do not', () => {
            expect(only(run('ahriman')).map((r) => r.actor)).toEqual(['ahriman']);
            expect(only(run('neurothrope', 'physical')).map((r) => r.actor)).toEqual(['neurothrope']);
        });
    });

    it('hits a minion before the boss, killing it, so a second attack reaches the boss', () => {
        const m = south(1);
        const { ctx } = scenario({ units: { archimatos: south(3), abraxas: south(4) }, minions: [m] });
        const z = go(south(2), 'SE', 1);
        const plan = runPlan(ctx, [{ type: 'deploy', at: z }]);
        const [firstReport] = only(plan);
        expect(firstReport.targets[0]).toEqual(minion(m));
        expect(firstReport.damage).toBe(0);
        expect(plan.final.minions).toEqual([]);
        expect(plan.finish.reports[0].targets[0]).toEqual(BOSS);
        expect(plan.finish.reports[0].damage).toBeGreaterThan(0);
    });

    it('with nothing in reach the trigger is spent for nothing', () => {
        const { ctx } = scenario({ units: { archimatos: at(1, 1) }, boss: [at(12, 12)] });
        const plan = runPlan(ctx, [{ type: 'deploy', at: at(1, 2) }]);
        expect(only(plan)[0].note).toBe('no enemy in reach');
    });

    it("at the start of the next round Hunter of Souls adds 784 for each friendly psyker beside him", () => {
        const z = south(2);
        const cells = [z, go(z, 'N', 1), go(z, 'NE', 1)];
        const two = scenario({ units: { archimatos: go(z, 'S', 1), abraxas: go(z, 'SW', 1) } });
        const plan = runPlan(two.ctx, [], { ...two.state, zkar: { cells, triggered: { deploy: true, archimatos: true, abraxas: true } } });
        const g = plan.finish.reports[0].groups[0];
        expect(flatOf(g).hunterOfSouls).toBe(2 * abilityValue('HunterOfSouls', 'extraDmg', 60, 'Mythic'));
        const lonely = scenario({ units: {} });
        const alone = runPlan(lonely.ctx, [], { ...lonely.state, zkar: { cells, triggered: { deploy: true, archimatos: true, abraxas: true } } });
        expect(flatOf(alone.finish.reports[0].groups[0]).hunterOfSouls).toBeUndefined();
    });

    it("fire that burns this round only is gone for his next-round attack, but fire that burns two rounds still helps", () => {
        const make = (effect: 'fire1' | 'fire2') => {
            const { ctx } = scenario({ units: { ahriman: south(6) }, effects: { [cellKey(boss)]: effect } });
            const z = go(south(2), 'SE', 1);
            return runPlan(ctx, [{ type: 'deploy', at: z }]).finish.reports[0].groups[0];
        };
        expect(modsOf(make('fire2')).psychicStalk).toBeCloseTo(1.33, 10);
        expect(modsOf(make('fire1')).psychicStalk).toBeUndefined();
    });
});

describe('finishing the round', () => {
    it("a unit on an undesirable hex is lost (Abaddon survives by default), costing the setup's penalty in damage", () => {
        const hex = south(3);
        const lost = scenario({ units: { archimatos: hex, abaddon: south(2) }, undesirable: [cellKey(hex), cellKey(south(2))], undesirablePenalty: 500 });
        const plan = runPlan(lost.ctx, []);
        expect(plan.finish.penalties).toEqual([{ reason: 'undesirable', unit: 'archimatos', points: 500 }]);
        expect(plan.total).toBe(-500);
        expect(plan.final.units.archimatos).toBeUndefined();
        expect(plan.final.units.abaddon).toBeDefined();
        const frail = scenario({ units: { abaddon: south(2) }, undesirable: [cellKey(south(2))], abaddonSurvivesUndesirable: false });
        expect(runPlan(frail.ctx, []).finish.penalties).toHaveLength(1);
    });

    it("Z'kar on an undesirable hex has no next-round attack", () => {
        const z = go(south(2), 'SE', 1);
        const base = scenario({ units: { archimatos: go(z, 'S', 1) } });
        expect(runPlan(base.ctx, [{ type: 'deploy', at: z }]).finish.reports.length).toBe(1);
        const hexes = scenario({ units: { archimatos: go(z, 'S', 1) }, undesirable: [cellKey(z)] });
        expect(runPlan(hexes.ctx, [{ type: 'deploy', at: z }]).finish.reports).toEqual([]);
    });

    it('a lost buffer stops helping his next-round attack', () => {
        const z = go(south(2), 'SE', 1);
        const alive = scenario({ units: { abaddon: go(z, 'S', 1) } });
        expect(flatOf(runPlan(alive.ctx, [{ type: 'deploy', at: z }]).finish.reports[0].groups[0]).abaddonPassive).toBeDefined();
        const dead = scenario({ units: { abaddon: go(z, 'S', 1) }, undesirable: [cellKey(go(z, 'S', 1))], abaddonSurvivesUndesirable: false });
        expect(flatOf(runPlan(dead.ctx, [{ type: 'deploy', at: z }]).finish.reports[0].groups[0]).abaddonPassive).toBeUndefined();
    });

    it("Neurothrope ending next to an enemy costs the setup's penalty, whether he got there by moving or was already there", () => {
        const { ctx } = scenario({ units: { neurothrope: south(2) }, neuroAdjacentPenalty: 250 });
        const moved = runPlan(ctx, [{ type: 'move', unit: 'neurothrope', to: south(1) }]);
        expect(moved.finish.penalties).toEqual([{ reason: 'neurothropeAdjacent', unit: 'neurothrope', points: 250 }]);
        expect(runPlan(ctx, []).finish.penalties).toEqual([]);
        const there = scenario({ units: { neurothrope: south(1) }, neuroAdjacentPenalty: 250 });
        expect(runPlan(there.ctx, [attack('neurothrope', 'physical')]).finish.penalties).toHaveLength(1);
    });
});

describe("Abaddon's extra melee attack", () => {
    const m1 = go(boss, 'SE', 1);
    const m2 = go(boss, 'SW', 1);
    const abaddon = south(1);

    it('comes with the active: a normal melee attack is followed by a second one on an adjacent enemy', () => {
        const { ctx } = scenario({ units: { abaddon }, abaddonExtra: 'on' });
        const plan = runPlan(ctx, [attack('abaddon', 'melee', BOSS, BOSS)]);
        const reports = only(plan);
        expect(reports.map((r) => !!r.extra)).toEqual([false, true]);
        expect(reports.every((r) => r.damage > 0)).toBe(true);
        expect(plan.final.abaddonStacks).toBe(2);
    });

    it('is not offered without the active, and the Talon does not run again', () => {
        const off = scenario({ units: { abaddon }, minions: [m1], abaddonExtra: 'off' });
        expect(legalAttacks(off.ctx, off.state, 'abaddon').every((c) => c.extra === undefined)).toBe(true);
        const on = scenario({ units: { abaddon }, minions: [m1, m2], abaddonExtra: 'on' });
        // The first attack (with the Talon) kills both minions; the second hits the boss alone.
        const plan = runPlan(on.ctx, [attack('abaddon', 'melee', BOSS, BOSS)]);
        expect(only(plan).map((r) => r.targets.length)).toEqual([3, 1]);
        expect(plan.final.abaddonStacks).toBe(4); // up to four attacks in a turn: three with the Talon, one extra
    });

    it('can pick a different enemy from the first attack, if one is left', () => {
        const { ctx, state } = scenario({ units: { abaddon }, minions: [go(abaddon, 'S', 1)], abaddonExtra: 'on' });
        const choices = legalAttacks(ctx, state, 'abaddon').filter((c) => c.kind === 'melee' && c.target.kind === 'boss');
        expect(choices.map((c) => c.extra)).toEqual([BOSS, minion(go(abaddon, 'S', 1))]);
    });

    it('has nothing to do when the first attack kills the only enemy beside him', () => {
        const far = at(2, 3);
        const lone = go(far, 'N', 1);
        const { ctx, state } = scenario({ units: { abaddon: far }, minions: [lone], abaddonExtra: 'on' });
        expect(legalAttacks(ctx, state, 'abaddon')).toEqual([{ unit: 'abaddon', kind: 'melee', target: minion(lone) }]);
        expect(only(runPlan(ctx, [attack('abaddon', 'melee', minion(lone))]))).toHaveLength(1);
    });

    it("is switched on by using the active, once, before he attacks", () => {
        const { ctx, state } = scenario({ units: { abaddon }, abaddonExtra: 'available' });
        expect(legalAttacks(ctx, state, 'abaddon').every((c) => c.extra === undefined)).toBe(true);
        const used = applyAction(ctx, state, { type: 'abaddonActive' })!;
        expect(used.state.abaddonExtra).toBe('on');
        expect(applyAction(ctx, used.state, { type: 'abaddonActive' })).toBeUndefined();
        const plan = runPlan(ctx, [{ type: 'abaddonActive' }, attack('abaddon', 'melee', BOSS, BOSS)]);
        expect(only(plan)).toHaveLength(2);
        const after = runPlan(ctx, [attack('abaddon', 'melee')]);
        expect(applyAction(ctx, after.final, { type: 'abaddonActive' })).toBeUndefined();
        for (const mode of ['off', 'on'] as const) {
            const other = scenario({ units: { abaddon }, abaddonExtra: mode });
            expect(applyAction(other.ctx, other.state, { type: 'abaddonActive' })).toBeUndefined();
        }
    });

    it('needs the extra target named when there is one to hit', () => {
        const { ctx, state } = scenario({ units: { abaddon }, abaddonExtra: 'on' });
        expect(applyAction(ctx, state, attack('abaddon', 'melee', BOSS))).toBeUndefined();
        expect(applyAction(ctx, state, attack('abaddon', 'melee', BOSS, BOSS))).toBeDefined();
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

describe('a full plan, in the order the strategy calls for', () => {
    // Abaddon hits first (his passive then helps everyone after); Ahriman lights the boss; Z'kar lands next to two psykers; Archimatos
    // and Abraxas hit beside him (their Books send him in again); Neurothrope goes last, on a boss the others have infected.
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

    it('adds up the damage of every attack, Z\'kar\'s included, and his next-round one', () => {
        const reports = [...only(plan), ...plan.finish.reports];
        expect(reports.map((r) => `${r.actor}${r.trigger ? ':' + r.trigger : ''}`)).toEqual(['abaddon', 'ahriman', 'zkar:deploy', 'archimatos', 'zkar:archimatos', 'abraxas', 'zkar:abraxas', 'neurothrope', 'zkar:nextRound']);
        expect(plan.total).toBeCloseTo(reports.reduce((s, r) => s + r.damage, 0), 6);
        expect(plan.total).toBeGreaterThan(0);
        for (const r of reports) expect(r.damage).toBeGreaterThan(0);
    });

    it('later attacks get more from Abaddon\'s passive, because he attacked first', () => {
        const flats = only(plan)
            .filter((r) => r.actor === 'archimatos' || r.actor === 'ahriman')
            .map((r) => flatOf(r.groups[0]).abaddonPassive);
        // Ahriman and Archimatos are both within 2 of Abaddon, after one attack of his.
        expect(flats[0]).toBe(mythic('FirstAmongTraitors', 'extraDmg') + mythic('FirstAmongTraitors', 'extraDmg_2'));
    });

    it('Neurothrope, last, gets the parasite the others grew and the maximum is respected', () => {
        const neuro = only(plan).find((r) => r.actor === 'neurothrope')!;
        expect(flatOf(neuro.groups[0]).neuroparasite).toBeGreaterThan(0);
        expect(plan.final.neuroStacks).toBeLessThanOrEqual(16);
    });
});
