import { Rarity } from './roster';

// The bosses' and minions' own stats, from the game's guild raid config (public/raid/enemies.json, written by
// extract_raid_boards.ts): armor and health by rarity, stars and rank, the same three things a character has.

export interface EnemyRow {
    rarity: Rarity;
    stars: number;
    /** The planner's rank index (Stone I = 1); bosses can go to Adamantine III (21), which players can't reach yet. */
    rank: number;
    armor: number;
    health: number;
}

/** Every boss's and minion's stat rows, one per raid level (the row at index `level - 1`). */
export type EnemyData = Record<string, EnemyRow[]>;

/**
 * A raid tier as the live config lists them (public/raid/raid-tiers.json): Common 1 to 4, Uncommon 1 to 4, Rare 1 to 4, Epic 1 to 5,
 * Legendary 1 to 5, Mythic 1 to 3. Each fights at one stat row, which gives it a rarity, stars and rank.
 */
export interface RaidTier {
    /** 0 = Common .. 5 = Mythic. */
    tier: number;
    /** 0-based within the tier. */
    set: number;
    label: string;
    /** The stat row, 1-based. */
    level: number;
}

export interface EnemySelection {
    /** The raid level: a RaidTier's `level`. */
    level: number;
}

/** The hardest tier: the last the game defines. */
export function strongestSelection(tiers: readonly RaidTier[]): EnemySelection {
    return { level: Math.max(1, ...tiers.map((t) => t.level)) };
}

/** A selection that names a tier the game has; anything else (nothing chosen, or a stale value) becomes the hardest tier. */
export function normalizeSelection(tiers: readonly RaidTier[], selection: Partial<EnemySelection> | undefined): EnemySelection {
    const level = selection?.level;
    return tiers.some((t) => t.level === level) ? { level: level! } : strongestSelection(tiers);
}

/** A unit's stat row at a raid level (the last row if it has fewer). */
export const rowAt = (rows: readonly EnemyRow[], level: number): EnemyRow | undefined => rows[Math.min(rows.length, Math.max(1, level)) - 1];

export interface EnemyArmor {
    boss: number;
    minion: number;
}

/** The armor of the boss and of its minions (the first kind fighting with it, if there are several) at a raid level; the hardest if none is chosen. */
export function enemyArmor(data: EnemyData, bossId: string, minionIds: readonly string[], selection: EnemySelection | undefined): EnemyArmor {
    const bossRows = data[bossId] ?? [];
    const level = selection?.level ?? bossRows.length;
    const boss = rowAt(bossRows, level)?.armor ?? 0;
    return { boss, minion: rowAt(data[minionIds[0]] ?? [], level)?.armor ?? boss };
}
