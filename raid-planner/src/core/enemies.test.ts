import { describe, expect, it } from 'vitest';
import enemies from '../../public/raid/enemies.json';
import tiers from '../../public/raid/raid-tiers.json';
import { EnemyData, enemyArmor, normalizeSelection, rowAt, strongestSelection } from './enemies';

const data = enemies as unknown as EnemyData;
const MORTARION = 'GuildBoss5Boss1DeathMortarion';

describe('raid tiers', () => {
    it('match the live config: Common 1-4, Uncommon 1-4, Rare 1-4, Epic 1-5, Legendary 1-5, Mythic 1-3', () => {
        const counts = [0, 1, 2, 3, 4, 5].map((tier) => tiers.filter((t) => t.tier === tier).length);
        expect(counts).toEqual([4, 4, 4, 5, 5, 3]);
        expect(tiers.map((t) => t.label).slice(0, 2)).toEqual(['Common 1', 'Common 2']);
        expect(tiers.at(-1)).toMatchObject({ label: 'Mythic 3', level: 25 });
    });

    it('each resolves a rarity, stars and rank', () => {
        const mythic1 = rowAt(data[MORTARION], tiers.find((t) => t.label === 'Mythic 1')!.level)!;
        expect(mythic1).toMatchObject({ rarity: 'Mythic', stars: 12, rank: 19 });
        const common1 = rowAt(data[MORTARION], 1)!;
        expect(common1).toMatchObject({ rarity: 'Common', stars: 0 });
        // The rarity of each tier's levels matches its name.
        for (const t of tiers) expect(rowAt(data[MORTARION], t.level)!.rarity).toBe(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'][t.tier]);
    });

    it('two tiers with the same rarity, stars and rank can still differ (Rare 3 and Rare 2)', () => {
        const a = rowAt(data[MORTARION], 10)!;
        const b = rowAt(data[MORTARION], 11)!;
        expect([a.rarity, a.stars, a.rank]).toEqual([b.rarity, b.stars, b.rank]);
        expect(a.armor).not.toBe(b.armor);
    });

    it('default to the hardest tier, and a stale selection falls back to it', () => {
        expect(strongestSelection(tiers)).toEqual({ level: 25 });
        expect(normalizeSelection(tiers, undefined)).toEqual({ level: 25 });
        expect(normalizeSelection(tiers, { level: 99 })).toEqual({ level: 25 });
        expect(normalizeSelection(tiers, { level: 7 })).toEqual({ level: 7 });
        expect(normalizeSelection(tiers, { rarity: 'Mythic', stars: 14, rank: 21 } as never)).toEqual({ level: 25 });
    });

    it("armor comes from the tier's row, for the boss and its minions", () => {
        const armor = enemyArmor(data, MORTARION, ['GuildBoss5Npc1Poxwalker'], { level: 25 });
        expect(armor.boss).toBe(rowAt(data[MORTARION], 25)!.armor);
        expect(armor.minion).toBe(rowAt(data['GuildBoss5Npc1Poxwalker'], 25)!.armor);
        expect(enemyArmor(data, MORTARION, [], { level: 1 }).boss).toBeLessThan(armor.boss);
    });
});
