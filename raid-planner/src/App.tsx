import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardData, BossData } from './core/board';
import { Cell } from './core/hex';
import { Drag, Point, dragPreview, dropDrag, startDrag } from './core/drag';
import { Setup, initialSetup } from './core/setup';
import { PaintMode, Tool, applyTool, isPaintTool, paintModeFor } from './core/tools';
import { loadData, makeBoard } from './data';
import { BoardView, DragGhost } from './ui/BoardView';
import { Sidebar } from './ui/Sidebar';
import { RosterPanel } from './ui/RosterPanel';
import { SolverPanel } from './ui/SolverPanel';
import { useRoster } from './ui/useRoster';

const encounterLabel = (type: string): string => (type === 'Boss' ? 'Boss' : type === 'Crystal' ? 'Support' : type);

const storageKey = (boardId: string) => `raid-planner:setup:${boardId}`;

function loadSetup(boardId: string): Setup | undefined {
    try {
        const raw = localStorage.getItem(storageKey(boardId));
        return raw ? (JSON.parse(raw) as Setup) : undefined;
    } catch {
        return undefined;
    }
}

const SELECTION_KEY = 'raid-planner:selection';

function loadSelection(): { bossType?: string; boardId?: string } {
    try {
        return JSON.parse(localStorage.getItem(SELECTION_KEY) ?? '{}');
    } catch {
        return {};
    }
}

function saveSetup(setup: Setup) {
    try {
        localStorage.setItem(storageKey(setup.boardId), JSON.stringify(setup));
    } catch {
        // Private windows and blocked storage just don't remember.
    }
}

export function App() {
    const [data, setData] = useState<{ bosses: BossData[]; boards: Record<string, BoardData> }>();
    const [bossType, setBossType] = useState('');
    const [boardId, setBoardId] = useState('');
    const [tool, setTool] = useState<Tool>({ kind: 'move' });
    const [drag, setDrag] = useState<{ drag: Drag; hover: Cell; point: Point }>();
    const [setup, setSetup] = useState<Setup>();
    const [tab, setTab] = useState<'board' | 'characters'>(() => (new URLSearchParams(location.search).get('tab') === 'characters' ? 'characters' : 'board'));
    const { roster, setUnit, replace, reset } = useRoster();
    const painting = useRef<{ tool: Tool; mode: PaintMode } | undefined>(undefined);

    useEffect(() => {
        loadData().then((d) => {
            setData(d);
            // Come back to the map you were last on.
            const saved = loadSelection();
            const savedBoss = d.bosses.find((b) => b.bossType === saved.bossType && b.encounters.some((e) => e.boardId === saved.boardId));
            setBossType(savedBoss?.bossType ?? d.bosses[0]?.bossType ?? '');
            if (savedBoss) setBoardId(saved.boardId!);
        });
    }, []);

    const boss = data?.bosses.find((b) => b.bossType === bossType);
    useEffect(() => {
        if (boss && !boss.encounters.some((e) => e.boardId === boardId)) setBoardId(boss.encounters[0]?.boardId ?? '');
    }, [boss, boardId]);

    useEffect(() => {
        if (!bossType || !boardId) return;
        try {
            localStorage.setItem(SELECTION_KEY, JSON.stringify({ bossType, boardId }));
        } catch {
            // Not remembered.
        }
    }, [bossType, boardId]);

    const board = useMemo(() => (data && data.boards[boardId] ? makeBoard(data.boards[boardId]) : undefined), [data, boardId]);

    // Each map remembers its own setup in this browser.
    useEffect(() => {
        // A saved setup may predate newer fields: anything it lacks takes its default.
        if (board) setSetup({ ...initialSetup(board), ...loadSetup(board.id) });
    }, [board]);
    useEffect(() => {
        if (setup) saveSetup(setup);
    }, [setup]);

    // Pick up the boss or a character with any tool that doesn't paint; otherwise the tool acts on the hex.
    const cellDown = useCallback(
        (cell: Cell, point: Point) => {
            if (!board || !setup) return;
            const grabbed = isPaintTool(tool) ? undefined : startDrag(board, setup, cell, point);
            if (grabbed) {
                setDrag({ drag: grabbed, hover: cell, point });
                return;
            }
            const mode = paintModeFor(setup, tool, cell);
            painting.current = isPaintTool(tool) ? { tool, mode } : undefined;
            setSetup(applyTool(board, setup, tool, cell, mode));
        },
        [board, setup, tool]
    );
    const cellEnter = useCallback(
        (cell: Cell) => {
            if (drag) {
                setDrag({ ...drag, hover: cell });
                return;
            }
            const paint = painting.current;
            if (!board || !paint) return;
            setSetup((s) => (s ? applyTool(board, s, paint.tool, cell, paint.mode) : s));
        },
        [board, drag]
    );
    const pointerEnd = useCallback(
        (commit: boolean) => {
            painting.current = undefined;
            if (!drag) return;
            if (commit && board && setup) setSetup(dropDrag(board, setup, drag.drag, drag.hover, drag.point));
            setDrag(undefined);
        },
        [board, setup, drag]
    );

    const pointerMove = useCallback((point: Point) => {
        setDrag((d) => (d ? { ...d, point } : d));
    }, []);

    const ghost: DragGhost | undefined =
        board && setup && drag
            ? { ...dragPreview(board, setup, drag.drag, drag.hover, drag.point), unit: drag.drag.kind === 'unit' ? drag.drag.unit : undefined }
            : undefined;
    const bossIcon = boss?.encounters.find((e) => e.boardId === boardId)?.icon;
    if (!data) return <p className="loading">Loading boards...</p>;
    return (
        <main>
            <h1>Raid planner</h1>
            <nav className="tabs">
                <button type="button" className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>
                    Board
                </button>
                <button type="button" className={tab === 'characters' ? 'active' : ''} onClick={() => setTab('characters')}>
                    Characters
                </button>
            </nav>
            {tab === 'characters' && <RosterPanel roster={roster} setUnit={setUnit} replace={replace} reset={reset} />}
            <div className="pickers" hidden={tab !== 'board'}>
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
            {tab === 'board' && board && setup && (
                <div className="layout">
                    <BoardView board={board} setup={setup} bossIcon={bossIcon} ghost={ghost} onCellDown={cellDown} onCellEnter={cellEnter} onPointerMove={pointerMove} onPointerEnd={pointerEnd} />
                    <Sidebar
                        tool={tool}
                        setTool={setTool}
                        setup={setup}
                        update={(patch) => setSetup({ ...setup, ...patch })}
                        platformCount={board.bossPlatforms().length}
                        onResetBoss={(i) => setSetup({ ...setup, bossCells: board.bossPlatforms()[i]?.cells ?? setup.bossCells })}
                        onClearAll={() => setSetup(initialSetup(board))}
                    />
                </div>
            )}
            {tab === 'board' && board && setup && data && <SolverPanel board={data.boards[board.id]} setup={setup} />}
        </main>
    );
}
