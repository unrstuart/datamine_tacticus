import { useEffect, useMemo, useState } from 'react';
import { BoardData, BossData } from './core/board';
import { cellKey } from './core/hex';
import { loadData, makeBoard } from './data';
import { BoardView } from './ui/BoardView';

const encounterLabel = (type: string): string => (type === 'Boss' ? 'Boss' : type === 'Crystal' ? 'Support' : type);

export function App() {
    const [data, setData] = useState<{ bosses: BossData[]; boards: Record<string, BoardData> }>();
    const [bossType, setBossType] = useState('');
    const [boardId, setBoardId] = useState('');

    useEffect(() => {
        loadData().then((d) => {
            setData(d);
            setBossType(d.bosses[0]?.bossType ?? '');
        });
    }, []);

    const boss = data?.bosses.find((b) => b.bossType === bossType);
    useEffect(() => {
        if (boss && !boss.encounters.some((e) => e.boardId === boardId)) setBoardId(boss.encounters[0]?.boardId ?? '');
    }, [boss, boardId]);

    const board = useMemo(() => (data && data.boards[boardId] ? makeBoard(data.boards[boardId]) : undefined), [data, boardId]);
    const platformCells = useMemo(() => new Set(board?.bossPlatforms().flatMap((p) => p.cells.map(cellKey)) ?? []), [board]);

    if (!data) return <p className="loading">Loading boards...</p>;
    return (
        <main>
            <h1>Raid planner</h1>
            <div className="pickers">
                <label>
                    Boss
                    <select value={bossType} onChange={(e) => setBossType(e.target.value)}>
                        {data.bosses.map((b) => (
                            <option key={b.bossType} value={b.bossType}>
                                {b.bossType}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Map
                    <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                        {boss?.encounters.map((e) => (
                            <option key={e.boardId} value={e.boardId}>
                                {e.boardId} ({encounterLabel(e.type)})
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {board && <BoardView board={board} platformCells={platformCells} />}
        </main>
    );
}
