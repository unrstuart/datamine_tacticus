import { RARITIES, Rarity } from './roster';

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

export type EnemyData = Record<string, EnemyRow[]>;

export interface EnemySelection {
    rarity: Rarity;
    stars: number;
    rank: number;
}

const order = (r: { rarity: Rarity; stars: number; rank: number }): number => RARITIES.indexOf(r.rarity) * 100000 + r.stars * 1000 + r.rank;

/** The strongest row: the last the game defines (a boss at its highest rarity, stars and rank). */
export function strongestSelection(rows: readonly EnemyRow[]): EnemySelection {
    const last = [...rows].sort((a, b) => order(a) - order(b)).at(-1);
    return last ? { rarity: last.rarity, stars: last.stars, rank: last.rank } : { rarity: 'Mythic', stars: 14, rank: 21 };
}

/** The row for a selection: the exact one, or the nearest step (a minion may not have a row at every boss rank). */
export function enemyRow(rows: readonly EnemyRow[], selection: EnemySelection): EnemyRow | undefined {
    const target = order(selection);
    let best: EnemyRow | undefined;
    for (const row of rows) if (best === undefined || Math.abs(order(row) - target) < Math.abs(order(best) - target)) best = row;
    return best;
}

/** What to offer when choosing a boss's rarity, stars and rank: only the combinations the game has. */
export function selectionOptions(rows: readonly EnemyRow[]) {
    const rarities = RARITIES.filter((r) => rows.some((row) => row.rarity === r));
    const starsFor = (rarity: Rarity): number[] => [...new Set(rows.filter((r) => r.rarity === rarity).map((r) => r.stars))].sort((a, b) => a - b);
    const ranksFor = (rarity: Rarity, stars: number): number[] => [...new Set(rows.filter((r) => r.rarity === rarity && r.stars === stars).map((r) => r.rank))].sort((a, b) => a - b);
    return { rarities, starsFor, ranksFor };
}

/** Make a selection the game has: the exact row if there is one, else the nearest. */
export function normalizeSelection(rows: readonly EnemyRow[], selection: EnemySelection): EnemySelection {
    const row = enemyRow(rows, selection);
    return row ? { rarity: row.rarity, stars: row.stars, rank: row.rank } : selection;
}

export interface EnemyArmor {
    boss: number;
    minion: number;
}

/**
 * The armor of the boss and of its minions for a selection. The boss uses the selected row; the minions (the first kind fighting
 * with it, if there are several) take the row nearest the same step.
 */
export function enemyArmor(data: EnemyData, bossId: string, minionIds: readonly string[], selection: EnemySelection | undefined): EnemyArmor {
    const bossRows = data[bossId] ?? [];
    const chosen = selection ?? strongestSelection(bossRows);
    const boss = enemyRow(bossRows, chosen)?.armor ?? 0;
    const minionRows = data[minionIds[0]] ?? [];
    return { boss, minion: enemyRow(minionRows, chosen)?.armor ?? boss };
}
