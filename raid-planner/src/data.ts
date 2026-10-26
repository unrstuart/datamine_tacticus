import { Board, BoardData, BossData } from './core/board';
import { EnemyData, RaidTier } from './core/enemies';

// public/raid/ is written by extract_raid_boards.ts in the datamine repo; Vite serves public/ from the root.
const base = `${import.meta.env.BASE_URL}raid`;

export const bossIconUrl = (icon: string): string => `${base}/${icon}`;

export const boardImageUrl = (boardId: string): string => `${base}/boards/${boardId}.jpg`;

let cache: Promise<{ bosses: BossData[]; boards: Record<string, BoardData>; enemies: EnemyData; tiers: RaidTier[] }> | undefined;

export function loadData() {
    const get = (file: string) => fetch(`${base}/${file}`).then((r) => r.json());
    cache ??= Promise.all([get('bosses.json'), get('boards.json'), get('enemies.json'), get('raid-tiers.json')]).then(([bosses, boards, enemies, tiers]) => ({ bosses, boards, enemies, tiers }));
    return cache;
}

export const makeBoard = (data: BoardData): Board => new Board(data);
