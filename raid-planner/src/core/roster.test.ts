import { describe, expect, it } from 'vitest';
import {
    MAX_RELIC_LEVEL,
    RANK_NAMES,
    RARITIES,
    RARITY_RULES,
    ROSTER_ORDER,
    ROSTER_UNITS,
    STAR_NAMES,
    canEquipRelic,
    clampSpec,
    isValidSpec,
    maxedRoster,
    maxedSpec,
    mythicAbilityLevel,
    optionsFor,
    sanitizeRoster,
    withAbilityLevel,
    withRank,
    withRarity,
    withRelic,
    withStars,
} from './roster';

describe('the rarity rules', () => {
    it('match the game: stars and rank caps and ability caps climb with rarity, each rarity starts its stars where the last ended, and every rank starts at Stone I', () => {
        let previous = undefined as (typeof RARITY_RULES)[(typeof RARITIES)[number]] | undefined;
        for (const rarity of RARITIES) {
            const r = RARITY_RULES[rarity];
            expect(r.minStars).toBeLessThan(r.maxStars);
            expect(r.minRank).toBeLessThan(r.maxRank);
            expect(r.minRank).toBe(1);
            if (previous) {
                expect(r.minStars).toBe(previous.maxStars);
                expect(r.maxRank).toBeGreaterThan(previous.maxRank);
                expect(r.maxAbilityLevel).toBeGreaterThan(previous.maxAbilityLevel);
            }
            previous = r;
        }
        expect(RARITY_RULES.Mythic).toMatchObject({ minStars: 11, maxStars: 14, minRank: 1, maxRank: 20, maxAbilityLevel: 60 });
        expect(STAR_NAMES[RARITY_RULES.Mythic.minStars]).toBe('1 blue star');
        expect(STAR_NAMES[RARITY_RULES.Mythic.maxStars]).toBe('Mythic wings');
        expect(RANK_NAMES[RARITY_RULES.Mythic.maxRank]).toBe('Adamantine II');
        expect(RANK_NAMES[RARITY_RULES.Common.maxRank]).toBe('Iron I');
        expect(RANK_NAMES[RARITY_RULES.Legendary.maxRank]).toBe('Diamond III');
    });
});

describe('a unit starts maxed out', () => {
    it('is Mythic with wings, Adamantine II, abilities at 60 and relic level 10', () => {
        const abaddon = maxedSpec('abaddon');
        expect(abaddon).toEqual({ rarity: 'Mythic', stars: 14, rank: 20, abilityLevels: [60, 60], relicLevel: 10 });
        expect(STAR_NAMES[abaddon.stars]).toBe('Mythic wings');
        expect(RANK_NAMES[abaddon.rank]).toBe('Adamantine II');
    });

    it('has a level for every ability, and a relic only on units that can use one', () => {
        for (const unit of ROSTER_ORDER) {
            const spec = maxedSpec(unit);
            expect(spec.abilityLevels).toHaveLength(ROSTER_UNITS[unit].abilities.length);
            expect(spec.relicLevel !== undefined).toBe(canEquipRelic(unit));
        }
        expect(canEquipRelic('abaddon') && canEquipRelic('abraxas') && canEquipRelic('archimatos') && canEquipRelic('neurothrope')).toBe(true);
        expect(canEquipRelic('ahriman')).toBe(false);
        expect(canEquipRelic('zkar')).toBe(false);
        expect(ROSTER_UNITS.abaddon.relic!.name).toBe('Talon of Horus');
        expect(ROSTER_UNITS.archimatos.relic!.name).toBe('Book of Fate');
        expect(ROSTER_UNITS.abraxas.relic!.name).toBe('Book of Fate');
        expect(ROSTER_UNITS.neurothrope.relic!.name).toBe('Norn Crown');
    });

    it('is valid, for the whole roster', () => {
        for (const unit of ROSTER_ORDER) expect(isValidSpec(unit, maxedSpec(unit))).toBe(true);
        expect(Object.keys(maxedRoster())).toEqual([...ROSTER_ORDER]);
    });

    it('gives Archimatos and Abraxas a Book of Fate each, at their own level', () => {
        const archi = withRelic('archimatos', maxedSpec('archimatos'), 4);
        const abrax = withRelic('abraxas', maxedSpec('abraxas'), 9);
        expect(archi.relicLevel).toBe(4);
        expect(abrax.relicLevel).toBe(9);
    });
});

describe('changing a unit keeps it legal', () => {
    it('lowering the rarity pulls stars, rank and ability levels down into the new range', () => {
        const epic = withRarity('abaddon', maxedSpec('abaddon'), 'Epic');
        expect(epic).toMatchObject({ rarity: 'Epic', stars: 8, rank: 13, abilityLevels: [35, 35] });
        expect(isValidSpec('abaddon', epic)).toBe(true);
        const common = withRarity('abaddon', maxedSpec('abaddon'), 'Common');
        expect(common).toMatchObject({ stars: 2, rank: 4, abilityLevels: [8, 8] });
    });

    it('raising the rarity lifts stars to the new minimum but leaves the rank and ability levels that still fit', () => {
        const rare = { rarity: 'Rare', stars: 4, rank: 7, abilityLevels: [10, 20], relicLevel: undefined } as const;
        const mythic = withRarity('abaddon', { ...rare, abilityLevels: [10, 20] }, 'Mythic');
        expect(mythic).toMatchObject({ rarity: 'Mythic', stars: 11, rank: 7, abilityLevels: [10, 20] });
    });

    it('clamps stars, rank and ability levels to the rarity, and to at least 1 for abilities', () => {
        let s = withRarity('ahriman', maxedSpec('ahriman'), 'Rare');
        expect(withStars('ahriman', s, 14).stars).toBe(6);
        expect(withStars('ahriman', s, 0).stars).toBe(4);
        expect(withRank('ahriman', s, 20).rank).toBe(10);
        expect(withRank('ahriman', s, 1).rank).toBe(1); // Stone I is allowed at any rarity
        expect(withRank('ahriman', s, -4).rank).toBe(1);
        expect(withAbilityLevel('ahriman', s, 0, 60).abilityLevels[0]).toBe(26);
        expect(withAbilityLevel('ahriman', s, 1, 0).abilityLevels[1]).toBe(1);
        expect(withAbilityLevel('ahriman', s, 1, 12.4).abilityLevels[1]).toBe(12);
        s = withAbilityLevel('ahriman', s, 0, 7);
        expect(s.abilityLevels[0]).toBe(7);
    });

    it('relics: only where they exist, between 1 and 10, and removable', () => {
        const abaddon = maxedSpec('abaddon');
        expect(withRelic('abaddon', abaddon, 99).relicLevel).toBe(MAX_RELIC_LEVEL);
        expect(withRelic('abaddon', abaddon, 0).relicLevel).toBe(1);
        expect(withRelic('abaddon', abaddon, undefined).relicLevel).toBeUndefined();
        const ahriman = maxedSpec('ahriman');
        expect(withRelic('ahriman', ahriman, 5)).toBe(ahriman); // no relic to equip
        expect(withRelic('zkar', maxedSpec('zkar'), 5).relicLevel).toBeUndefined();
    });

    it('offers exactly the legal choices for a rarity', () => {
        const mythic = optionsFor('Mythic');
        expect(mythic.stars).toEqual([11, 12, 13, 14]);
        expect(mythic.ranks).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
        expect(mythic.maxAbilityLevel).toBe(60);
        expect(optionsFor('Common').stars).toEqual([0, 1, 2]);
        expect(optionsFor('Common').ranks).toEqual([1, 2, 3, 4]);
        for (const rarity of RARITIES) {
            const o = optionsFor(rarity);
            for (const stars of o.stars) expect(clampSpec('abaddon', { ...maxedSpec('abaddon'), rarity, stars }).stars).toBe(stars);
        }
    });
});

describe('reading a roster back', () => {
    it('keeps a good one as it is', () => {
        const roster = maxedRoster();
        roster.abaddon = withRarity('abaddon', roster.abaddon, 'Legendary');
        expect(sanitizeRoster(JSON.parse(JSON.stringify(roster)))).toEqual(roster);
    });

    it('falls back to maxed for garbage, and fixes what is out of range', () => {
        expect(sanitizeRoster(undefined)).toEqual(maxedRoster());
        expect(sanitizeRoster('nope')).toEqual(maxedRoster());
        expect(sanitizeRoster({})).toEqual(maxedRoster());
        const bad = sanitizeRoster({ abaddon: { rarity: 'Epic', stars: 99, rank: -3, abilityLevels: [500, 'x'], relicLevel: 40 }, ahriman: { rarity: 'Nonsense' }, zkar: { relicLevel: 5 } });
        expect(bad.abaddon).toEqual({ rarity: 'Epic', stars: 8, rank: 1, abilityLevels: [35, 35], relicLevel: 10 });
        expect(bad.ahriman).toEqual(maxedSpec('ahriman'));
        expect(bad.zkar.relicLevel).toBeUndefined();
    });

    it('keeps an unequipped relic unequipped', () => {
        const roster = maxedRoster();
        roster.neurothrope = withRelic('neurothrope', roster.neurothrope, undefined);
        expect(sanitizeRoster(JSON.parse(JSON.stringify(roster))).neurothrope.relicLevel).toBeUndefined();
    });
});

describe("Z'kar's mythic ability (Cabal of Sorcerers)", () => {
    it('is not levelled: it follows the stars, and only exists at Mythic', () => {
        expect(mythicAbilityLevel('Mythic', 11)).toBe(1);
        expect(mythicAbilityLevel('Mythic', 12)).toBe(2);
        expect(mythicAbilityLevel('Mythic', 13)).toBe(3);
        expect(mythicAbilityLevel('Mythic', 14)).toBe(4);
        for (const rarity of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const) expect(mythicAbilityLevel(rarity, 11)).toBe(0);
    });

    it('is level 4 on a maxed Z\'kar and the only derived ability', () => {
        expect(maxedSpec('zkar').abilityLevels).toEqual([60, 60, 4]);
        expect(ROSTER_UNITS.zkar.abilities.filter((a) => a.derived).map((a) => a.id)).toEqual(['CabalOfSorcerers']);
        for (const unit of ROSTER_ORDER) if (unit !== 'zkar') expect(ROSTER_UNITS[unit].abilities.some((a) => a.derived)).toBe(false);
    });

    it('changes with his stars and disappears below Mythic, and cannot be set by hand', () => {
        const z = maxedSpec('zkar');
        expect(withStars('zkar', z, 12).abilityLevels[2]).toBe(2);
        expect(withStars('zkar', z, 11).abilityLevels[2]).toBe(1);
        expect(withRarity('zkar', z, 'Legendary').abilityLevels[2]).toBe(0);
        expect(withRarity('zkar', withRarity('zkar', z, 'Legendary'), 'Mythic').abilityLevels[2]).toBe(1); // back at Mythic, at its first blue star
        expect(withAbilityLevel('zkar', z, 2, 1).abilityLevels[2]).toBe(4);
        expect(withAbilityLevel('zkar', z, 2, 99).abilityLevels[2]).toBe(4);
        // The other two abilities are still his to level.
        expect(withAbilityLevel('zkar', z, 0, 20).abilityLevels).toEqual([20, 60, 4]);
    });

    it('is recomputed from the stars when read back, whatever was stored', () => {
        const r = sanitizeRoster({ zkar: { rarity: 'Mythic', stars: 12, rank: 20, abilityLevels: [60, 35, 99] } });
        expect(r.zkar.abilityLevels).toEqual([60, 35, 2]);
        expect(isValidSpec('zkar', { ...maxedSpec('zkar'), abilityLevels: [60, 60, 1] })).toBe(false);
    });
});
