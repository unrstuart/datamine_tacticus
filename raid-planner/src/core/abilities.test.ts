import { describe, expect, it } from 'vitest';
import { RARITY_FACTOR, abilityConstant, abilityData, abilityValue } from './abilities';

describe('ability values', () => {
    it('scale with rarity only where the game says so', () => {
        // Abaddon's passive is scaled: the table says 341 at level 60, doubled at Mythic.
        expect(abilityValue('FirstAmongTraitors', 'extraDmg', 60)).toBe(326);
        expect(abilityValue('FirstAmongTraitors', 'extraDmg', 60, 'Mythic')).toBe(652);
        expect(abilityValue('FirstAmongTraitors', 'extraDmg', 60, 'Legendary')).toBe(Math.round(326 * 1.8));
        // A relic's value is indexed by relic level and never scaled.
        expect(abilityValue('TalonOfHorus', 'maxDmg', 10)).toBe(2325);
        expect(abilityValue('TalonOfHorus', 'maxDmg', 10, 'Mythic')).toBe(2325);
        expect(RARITY_FACTOR.Common).toBe(1);
        expect(RARITY_FACTOR.Mythic).toBe(2);
    });

    it("reads what the game's description says it should (Mythic, ability level 60)", () => {
        // Abaddon: other Chaos units within 2 hexes deal +652, +130 more per attack he has made, up to +2342.
        expect([abilityValue('FirstAmongTraitors', 'extraDmg', 60, 'Mythic'), abilityValue('FirstAmongTraitors', 'extraDmg_2', 60, 'Mythic'), abilityValue('FirstAmongTraitors', 'maxDmg', 60, 'Mythic')]).toEqual([652, 130, 2342]);
        expect(abilityConstant('FirstAmongTraitors', 'range')).toBe(2);
        expect(abilityConstant('FirstAmongTraitors', 'buffMaxLevel')).toBe(13);
        // Ahriman: +33% on burning hexes, +652 for Chaos units' affected attacks.
        expect([abilityValue('PsychicStalk', 'extraDmgPct', 60, 'Mythic'), abilityValue('PsychicStalk', 'extraDmg', 60, 'Mythic')]).toEqual([33, 652]);
        // Abraxas: an extra psychic hit of 1306-2610.
        expect([abilityValue('InfernalPacts', 'minDmg', 60, 'Mythic'), abilityValue('InfernalPacts', 'maxDmg', 60, 'Mythic'), abilityConstant('InfernalPacts', 'nrOfHits')]).toEqual([1306, 2610, 1]);
        // Neurothrope: +2218 per parasite level, up to level 15 (16 with the Norn Crown).
        expect([abilityValue('Neuroparasite', 'extraDmg', 60, 'Mythic'), abilityValue('Neuroparasite', 'buffMaxLevel', 60, 'Mythic')]).toEqual([2218, 15]);
        // Z'kar: summoned with these stats; +784 per adjacent psyker when he attacks at the start of his next turn.
        expect([abilityValue('AetherStride', 'summonDmg', 60, 'Mythic'), abilityValue('AetherStride', 'summonArmor', 60, 'Mythic')]).toEqual([914, 2088]);
        expect(abilityValue('HunterOfSouls', 'extraDmg', 60, 'Mythic')).toBe(784);
        // The relics at level 10.
        expect([abilityConstant('TalonOfHorus', 'nrOfHits'), abilityValue('TalonOfHorus', 'minDmg', 10), abilityValue('TalonOfHorus', 'maxDmg', 10)]).toEqual([3, 1746, 2325]);
        expect(abilityValue('BookOfFate', 'extraDmg', 10)).toBe(1308);
        expect(abilityValue('NornCrown', 'extraDmg', 10)).toBe(1308);
    });

    it('clamps a level outside the table and knows what is not there', () => {
        expect(abilityValue('FirstAmongTraitors', 'extraDmg', 0)).toBe(abilityValue('FirstAmongTraitors', 'extraDmg', 1));
        expect(abilityValue('FirstAmongTraitors', 'extraDmg', 999)).toBe(abilityValue('FirstAmongTraitors', 'extraDmg', 65));
        expect(() => abilityValue('FirstAmongTraitors', 'nope', 1)).toThrow();
        expect(() => abilityData('NotAnAbility')).toThrow();
        expect(() => abilityConstant('InfernalPacts', 'nope')).toThrow();
    });

    it("keeps the game's own descriptions so a reader can see what each number means", () => {
        expect(abilityData('FirstAmongTraitors').description).toMatch(/Other friendly Chaos units within/);
        expect(abilityData('CabalOfSorcerers').description).toMatch(/Mythic Psyker characters/);
        expect(abilityData('BookOfFate').description).toMatch(/friendly adjacent Summon performs a normal attack/);
    });
});
