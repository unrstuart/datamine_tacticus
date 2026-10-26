import { Board, BoardData, BossData } from './core/board';

// public/raid/ is written by extract_raid_boards.ts in the datamine repo; Vite serves public/ from the root.
const base = `${import.meta.env.BASE_URL}raid`;

export const bossIconUrl = (icon: string): string => `${base}/${icon}`;

export const boardImageUrl = (boardId: string): string => `${base}/boards/${boardId}.jpg`;

let cache: Promise<{ bosses: BossData[]; boards: Record<string, BoardData> }> | undefined;

export function loadData() {
    cache ??= Promise.all([fetch(`${base}/bosses.json`).then((r) => r.json()), fetch(`${base}/boards.json`).then((r) => r.json())]).then(
        ([bosses, boards]) => ({ bosses, boards })
    );
    return cache;
}

export const makeBoard = (data: BoardData): Board => new Board(data);
