import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/plan';
import { go, scenario } from '../engine/testkit';
import { analyse } from './analysis';
import { hintScore } from './hints';

const boss = { col: 4, row: 6 };
const south = (n: number) => go(boss, 'S', n);

const score = (ctx: ReturnType<typeof scenario>['ctx'], state: ReturnType<typeof scenario>['state'], action: Parameters<typeof applyAction>[2]) => {
    const r = applyAction(ctx, state, action)!;
    return hintScore(ctx, state, analyse(ctx, state), action, r.state, r.reports);
};

describe('hints', () => {
    it('put Neurothrope after everyone else, and Abaddon first', () => {
        const { ctx, state } = scenario({ cols: 9, rows: 10, boss: [boss], units: { abaddon: south(1), neurothrope: south(2), archimatos: go(south(2), 'SE', 1) } });
        const neuro = score(ctx, state, { type: 'attack', unit: 'neurothrope', kind: 'ranged', target: { kind: 'boss' } });
        const abaddon = score(ctx, state, { type: 'attack', unit: 'abaddon', kind: 'melee', target: { kind: 'boss' } });
        expect(neuro).toBeLessThan(abaddon);
        expect(neuro).toBeLessThan(0);
    });

    it("leave Neurothrope's move unpenalised, since it may be needed early for his buffs", () => {
        const { ctx, state } = scenario({ cols: 9, rows: 10, boss: [boss], units: { abaddon: south(1), neurothrope: south(3) } });
        expect(score(ctx, state, { type: 'move', unit: 'neurothrope', to: south(2) })).toBeGreaterThanOrEqual(0);
    });

    it('prefer a move into melee range for Abaddon and Archimatos', () => {
        const { ctx, state } = scenario({ cols: 9, rows: 10, boss: [boss], units: { abaddon: south(3) } });
        const near = score(ctx, state, { type: 'move', unit: 'abaddon', to: south(1) });
        const far = score(ctx, state, { type: 'move', unit: 'abaddon', to: south(2) });
        expect(near).toBeGreaterThan(far);
    });
});
