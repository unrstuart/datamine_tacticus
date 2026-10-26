import { describe, expect, it } from 'vitest';
import { HIGH_GROUND_MULTIPLIER, attackDamage, hitDamage, pierceRatio } from './damage';

describe('pierce ratios come from the game', () => {
    it('are the shares of a hit that armor cannot stop', () => {
        expect(pierceRatio('Psychic')).toBe(1);
        expect(pierceRatio('Power')).toBe(0.4);
        expect(pierceRatio('Bolter')).toBe(0.2);
        expect(pierceRatio('Flame')).toBe(0.25);
        expect(pierceRatio('Physical')).toBe(0.01);
        expect(() => pierceRatio('Nonsense')).toThrow();
    });
});

describe('a hit', () => {
    it('loses the target\'s armor, but never more than the pierce ratio allows', () => {
        expect(hitDamage({ damage: 2000, armor: 500, pierce: 0.4 })).toBe(1500); // armor leaves 1500, above the 800 floor
        expect(hitDamage({ damage: 2000, armor: 1500, pierce: 0.4 })).toBe(800); // armor would leave 500: the floor is 800
        expect(hitDamage({ damage: 2000, armor: 99999, pierce: 0.4 })).toBe(800);
        expect(hitDamage({ damage: 2000, armor: 99999, pierce: 1 })).toBe(2000); // psychic ignores armor
    });

    it('includes fixed damage buffs before armor, on every hit', () => {
        expect(hitDamage({ damage: 2000, fixed: 1400, armor: 1500, pierce: 0.4 })).toBe(1900); // 3400 - 1500
        expect(attackDamage({ damage: 2000, fixed: 1400, hits: 5, armor: 1500, pierce: 0.4 })).toBe(9500);
    });

    it('applies percentage modifiers after armor, multiplying each other', () => {
        const base = hitDamage({ damage: 2000, armor: 1500, pierce: 0.4 }); // 800
        const withMods = hitDamage({ damage: 2000, armor: 1500, pierce: 0.4, modifiers: [1.2, 1.33, HIGH_GROUND_MULTIPLIER] });
        expect(withMods).toBeCloseTo(base * 1.2 * 1.33 * 1.5, 6);
        expect(1.2 * 1.33 * 1.5).toBeCloseTo(2.394, 6);
        // A modifier on a hit armor has mostly stopped is worth the same ratio, but the armor was taken first.
        expect(hitDamage({ damage: 1000, armor: 900, pierce: 0.2, modifiers: [2] })).toBe(2 * 200);
    });

    it('high ground is worth 50% on any attack', () => {
        const flat = attackDamage({ damage: 1000, hits: 3, armor: 200, pierce: 0.4 });
        const high = attackDamage({ damage: 1000, hits: 3, armor: 200, pierce: 0.4, modifiers: [HIGH_GROUND_MULTIPLIER] });
        expect(high / flat).toBeCloseTo(1.5, 10);
    });

    it('multiplies by the number of hits', () => {
        expect(attackDamage({ damage: 100, hits: 4, armor: 0, pierce: 1 })).toBe(400);
        expect(attackDamage({ damage: 100, hits: 0, armor: 0, pierce: 1 })).toBe(0);
    });
});
