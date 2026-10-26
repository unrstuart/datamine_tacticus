import { describe, expect, it } from 'vitest';
import { RARITY_RULES, ROSTER_ORDER, UnitSpec, maxedSpec, withRank, withRarity, withStars } from './roster';
import { characterStats, hasStats, progressionIndex, weaponsOf } from './stats';

describe('character stats', () => {
    it('the progression index is rarity plus stars: Mythic wings is the last step, 19', () => {
        expect(progressionIndex(maxedSpec('abaddon'))).toBe(19);
        expect(progressionIndex({ rarity: 'Mythic', stars: RARITY_RULES.Mythic.minStars })).toBe(16);
        expect(progressionIndex({ rarity: 'Common', stars: 0 })).toBe(0);
        expect(progressionIndex({ rarity: 'Legendary', stars: 8 })).toBe(12);
    });

    it("Abaddon maxed (Mythic wings, Adamantine II) has 2001 damage: his base 15 plus 19 rank-ups, times 240%", () => {
        expect(characterStats('abaddon', maxedSpec('abaddon'))).toEqual({ damage: 2001, health: 13351, armor: 3338 });
    });

    it('is the base stat at the lowest rank, scaled by the stars', () => {
        // Abaddon starts at Legendary, three red stars (step 12, 180%), with the first rank and no rank-ups yet.
        const spec: UnitSpec = { rarity: 'Legendary', stars: 8, rank: 1, abilityLevels: [1, 1] };
        expect(characterStats('abaddon', spec)).toEqual({ damage: 27, health: 180, armor: 45 });
    });

    it('grows with rank and with stars', () => {
        const maxed = maxedSpec('ahriman');
        const damage = (s: typeof maxed) => characterStats('ahriman', s)!.damage;
        expect(damage(withRank('ahriman', maxed, 19))).toBeLessThan(damage(maxed));
        expect(damage(withRank('ahriman', maxed, 18))).toBeLessThan(damage(withRank('ahriman', maxed, 19)));
        expect(damage(withStars('ahriman', maxed, 12))).toBeLessThan(damage(maxed));
        // A lower rarity at its own maximum is weaker than a higher one at its own.
        const epicMax = withRarity('ahriman', maxed, 'Epic');
        expect(damage(epicMax)).toBeLessThan(damage(maxed));
    });

    it('rank increases add up row by row (rank index r has r - 1 rank-ups)', () => {
        // Rank 2 has one row: Abaddon's first is [13,13,2,2,3,3]: +4 damage on a base of 15, at the same 180% as above.
        const spec: UnitSpec = { rarity: 'Legendary', stars: 8, rank: 2, abilityLevels: [1, 1] };
        expect(characterStats('abaddon', spec)!.damage).toBe(Math.trunc(((15 + 4) * 180) / 100));
    });

    it('has none for a machine of war, and weapons for everyone', () => {
        expect(hasStats('zkar')).toBe(false);
        expect(characterStats('zkar', maxedSpec('zkar'))).toBeUndefined();
        for (const unit of ROSTER_ORDER) expect(weaponsOf(unit).length).toBe(2);
        expect(weaponsOf('abaddon')).toEqual([
            { hits: 5, profile: 'Power' },
            { hits: 3, profile: 'Bolter', range: 2 },
        ]);
        expect(weaponsOf('zkar')).toEqual([
            { hits: 4, profile: 'Psychic' },
            { hits: 3, profile: 'Psychic', range: 2 },
        ]);
    });
});
