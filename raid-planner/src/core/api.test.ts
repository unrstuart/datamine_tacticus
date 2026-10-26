import { describe, expect, it } from 'vitest';
import player from './fixtures/player.json';
import { API_UNIT_IDS, rarityAndStars, rosterFromPlayer } from './api';
import { RANK_NAMES, ROSTER_ORDER, STAR_NAMES, maxedRoster } from './roster';

describe('progression index', () => {
    it('is rarity plus stars', () => {
        expect(rarityAndStars(0)).toEqual({ rarity: 'Common', stars: 0 });
        expect(rarityAndStars(3)).toEqual({ rarity: 'Uncommon', stars: 2 });
        expect(rarityAndStars(12)).toEqual({ rarity: 'Legendary', stars: 8 });
        expect(rarityAndStars(15)).toEqual({ rarity: 'Legendary', stars: 11 });
        expect(rarityAndStars(16)).toEqual({ rarity: 'Mythic', stars: 11 });
        expect(rarityAndStars(19)).toEqual({ rarity: 'Mythic', stars: 14 });
        expect(rarityAndStars(25)).toEqual({ rarity: 'Mythic', stars: 14 }); // beyond what exists: the last step
        expect(rarityAndStars(-2)).toEqual({ rarity: 'Common', stars: 0 });
    });
});

describe('reading an account', () => {
    const result = rosterFromPlayer(player, maxedRoster());

    it('finds all six units and the player', () => {
        expect(result.found).toEqual([...ROSTER_ORDER]);
        expect(result.missing).toEqual([]);
        expect(result.playerName).toBe('Test Player');
        expect(Object.values(API_UNIT_IDS)).toHaveLength(6);
    });

    it("reads Abaddon: Mythic, one blue star, Adamantine II (the API's rank 19), his abilities and his Talon", () => {
        const a = result.roster.abaddon;
        expect(a.rarity).toBe('Mythic');
        expect(STAR_NAMES[a.stars]).toBe('1 blue star');
        expect(RANK_NAMES[a.rank]).toBe('Adamantine II');
        expect(a.abilityLevels).toEqual([50, 60]); // Drach'nyen, First Among Traitors
        expect(a.relicLevel).toBe(6);
    });

    it('reads each unit\'s abilities by name, not by position, and the right relic', () => {
        expect(result.roster.ahriman.abilityLevels).toEqual([55, 55]);
        expect(result.roster.ahriman.relicLevel).toBeUndefined(); // he has no relic that counts
        expect(result.roster.abraxas.abilityLevels).toEqual([60, 55]);
        expect(result.roster.abraxas.relicLevel).toBe(6); // Book of Fate
        expect(result.roster.archimatos.abilityLevels).toEqual([50, 50]);
        expect(result.roster.archimatos.relicLevel).toBe(6);
        expect(result.roster.neurothrope.abilityLevels).toEqual([38, 60]);
        expect(result.roster.neurothrope.relicLevel).toBe(10); // Norn Crown
    });

    it("reads Z'kar's three abilities and his Mythic wings; a machine of war keeps no rank or relic", () => {
        const z = result.roster.zkar;
        expect(STAR_NAMES[z.stars]).toBe('Mythic wings');
        expect(z.abilityLevels).toEqual([60, 35, 4]);
        expect(z.relicLevel).toBeUndefined();
    });

    it('leaves a unit the account lacks as it was, and says so', () => {
        const without = { player: { units: (player as { player: { units: Array<{ id: string }> } }).player.units.filter((u) => u.id !== 'tyranNeurothrope') } };
        const current = maxedRoster();
        const r = rosterFromPlayer(without, current);
        expect(r.missing).toEqual(['neurothrope']);
        expect(r.roster.neurothrope).toEqual(current.neurothrope);
        expect(r.found).toContain('abaddon');
    });

    it('does not trip over a response that is not one', () => {
        for (const junk of [undefined, null, 5, 'x', {}, { player: {} }, { player: { units: 'no' } }, { player: { units: [null, 3, { id: 7 }] } }]) {
            const r = rosterFromPlayer(junk, maxedRoster());
            expect(r.found).toEqual([]);
            expect(r.roster).toEqual(maxedRoster());
        }
    });

    it('keeps everything within what the rarity allows', () => {
        const odd = { player: { units: [{ id: 'blackAbaddon', progressionIndex: 2, rank: 19, abilities: [{ id: 'Drachnyen', level: 60 }], items: [{ id: 'R_Crit_TalonOfHorus', level: 99 }] }] } };
        const a = rosterFromPlayer(odd, maxedRoster()).roster.abaddon;
        expect(a.rarity).toBe('Common');
        expect(a.rank).toBe(4); // clamped to Iron I
        expect(a.abilityLevels[0]).toBe(8);
        expect(a.relicLevel).toBe(10);
    });
});
