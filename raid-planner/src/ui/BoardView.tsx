import { useRef } from 'react';
import { Board } from '../core/board';
import { Point } from '../core/drag';
import { Cell, cellKey } from '../core/hex';
import { Effect, Setup, UNIT_IDS, UnitId } from '../core/setup';
import { boardImageUrl, bossIconUrl } from '../data';
import { EFFECT_TINT, EffectGlyph } from './EffectGlyph';
import { UNITS, unitIconUrl } from './units';

/** Where the thing being dragged would land. */
export interface DragGhost {
    cells: Cell[];
    valid: boolean;
    /** Set when a character is being dragged (the boss is when this is absent). */
    unit?: UnitId;
}

interface BoardViewProps {
    board: Board;
    setup: Setup;
    /** The boss's round portrait. */
    bossIcon?: string;
    ghost?: DragGhost;
    /** A press on a hex, with the pointer's position on the board image. */
    onCellDown: (cell: Cell, point: Point) => void;
    onCellEnter: (cell: Cell) => void;
    /** The pointer moved over the board (position on the board image). */
    onPointerMove: (point: Point) => void;
    /** The pointer was released over the board (commit = true) or left it / was cancelled (false). */
    onPointerEnd: (commit: boolean) => void;
}

/** The boss portrait's diameter as a multiple of a hex's height, by how many hexes the boss covers. */
const BOSS_ICON_SCALE: Record<number, number> = { 1: 0.8, 3: 1.4, 7: 2.2 };

const DRAW_SCALE = 0.88;

function hexPoints(x: number, y: number, w: number, h: number, scale = DRAW_SCALE): string {
    const w2 = (w / 2) * scale;
    const h2 = (h / 2) * scale;
    const w4 = w2 / 2;
    return [
        [x + w2, y],
        [x + w4, y - h2],
        [x - w4, y - h2],
        [x - w2, y],
        [x - w4, y + h2],
        [x + w4, y + h2],
    ]
        .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
        .join(' ');
}

/** The board image with the hexes, the setup (boss, minions, effects, marks, characters) and the click/drag handling on top. */
export function BoardView({ board, setup, bossIcon, ghost, onCellDown, onCellEnter, onPointerMove, onPointerEnd }: BoardViewProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    // Pointer position in the board image's own pixels, whatever size the board is shown at.
    const toPoint = (e: { clientX: number; clientY: number }): Point => {
        const svg = svgRef.current;
        const m = svg?.getScreenCTM();
        if (!svg || !m) return { x: 0, y: 0 };
        const p = svg.createSVGPoint();
        p.x = e.clientX;
        p.y = e.clientY;
        const q = p.matrixTransform(m.inverse());
        return { x: q.x, y: q.y };
    };
    const { imageWidth, imageHeight, hexWidth, hexHeight } = board.data;
    const bossKeys = new Set(setup.bossCells.map(cellKey));
    const undesirable = new Set(setup.undesirable);
    const tokenR = hexHeight * 0.42;
    const polygon = (x: number, y: number, scale?: number) => hexPoints(x, y, hexWidth, hexHeight, scale);

    // The boss's portrait (or label) sits on the middle of its footprint, which is the ghost's while the boss is dragged.
    const centreOf = (cells: Cell[]) => {
        const hexes = cells.flatMap((c) => board.hexAt(c) ?? []);
        return hexes.length ? { x: hexes.reduce((s, h) => s + h.x, 0) / hexes.length, y: hexes.reduce((s, h) => s + h.y, 0) / hexes.length } : undefined;
    };
    const draggingBoss = ghost !== undefined && ghost.unit === undefined;
    const bossCentre = centreOf(setup.bossCells);
    const ghostCentre = draggingBoss ? centreOf(ghost.cells) : undefined;
    const iconR = (hexHeight * (BOSS_ICON_SCALE[setup.bossCells.length] ?? 1)) / 2;

    return (
        <svg
            ref={svgRef}
            className="board"
            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
            width={imageWidth}
            height={imageHeight}
            onPointerMove={(e) => onPointerMove(toPoint(e))}
            onPointerUp={() => onPointerEnd(true)}
            onPointerLeave={() => onPointerEnd(false)}
            onPointerCancel={() => onPointerEnd(false)}
        >
            <defs>
                <clipPath id="clip-boss">
                    <circle r={iconR} />
                </clipPath>
                {UNIT_IDS.map((id) => (
                    <clipPath key={id} id={`clip-${id}`}>
                        <circle r={tokenR} />
                    </clipPath>
                ))}
            </defs>
            <image href={boardImageUrl(board.id)} width={imageWidth} height={imageHeight} />

            {board.hexes.map((h) => {
                const key = cellKey(h.cell);
                const effect: Effect | undefined = setup.effects[key];
                const cls = !h.passable ? 'hex blocked' : 'hex';
                return (
                    <g key={key}>
                        <polygon className={cls} points={polygon(h.x, h.y)} />
                        {bossKeys.has(key) && <polygon className="boss-hex" points={polygon(h.x, h.y)} />}
                        {effect && (
                            <>
                                <polygon fill={EFFECT_TINT[effect]} points={polygon(h.x, h.y, 0.8)} pointerEvents="none" />
                                <g transform={`translate(${h.x} ${h.y})`} pointerEvents="none">
                                    <EffectGlyph effect={effect} scale={hexHeight / 36} />
                                </g>
                            </>
                        )}
                        {undesirable.has(key) && (
                            <g pointerEvents="none">
                                <polygon className="undesirable" points={polygon(h.x, h.y, 0.94)} />
                                <path
                                    className="undesirable-x"
                                    d={`M${h.x - tokenR * 0.6},${h.y - tokenR * 0.6} L${h.x + tokenR * 0.6},${h.y + tokenR * 0.6} M${h.x + tokenR * 0.6},${h.y - tokenR * 0.6} L${h.x - tokenR * 0.6},${h.y + tokenR * 0.6}`}
                                />
                            </g>
                        )}
                    </g>
                );
            })}

            {bossCentre && !draggingBoss && <BossMark icon={bossIcon} x={bossCentre.x} y={bossCentre.y} r={iconR} />}

            {setup.minions.map((m) => {
                const h = board.hexAt(m);
                return h ? (
                    <g key={`m-${cellKey(m)}`} transform={`translate(${h.x} ${h.y})`} pointerEvents="none">
                        <circle r={tokenR * 0.8} className="minion" />
                        <text className="minion-label" textAnchor="middle" dominantBaseline="central">
                            M
                        </text>
                    </g>
                ) : null;
            })}

            {(Object.entries(setup.units) as Array<[UnitId, Cell]>).map(([id, cell]) => {
                if (ghost?.unit === id) return null; // being dragged: drawn at the ghost instead
                const h = board.hexAt(cell);
                return h ? (
                    <g key={`u-${id}`} transform={`translate(${h.x} ${h.y})`} pointerEvents="none">
                        <circle r={tokenR + 2} fill={UNITS[id].color} />
                        <image href={unitIconUrl(id)} x={-tokenR} y={-tokenR} width={tokenR * 2} height={tokenR * 2} clipPath={`url(#clip-${id})`} />
                    </g>
                ) : null;
            })}

            {ghost && (
                <g pointerEvents="none">
                    {ghost.cells.flatMap((c) => board.hexAt(c) ?? []).map((h) => (
                        <polygon key={`g-${cellKey(h.cell)}`} className={ghost.valid ? 'ghost valid' : 'ghost invalid'} points={polygon(h.x, h.y, 0.96)} />
                    ))}
                    {ghost.unit &&
                        (() => {
                            const h = board.hexAt(ghost.cells[0]);
                            return h ? (
                                <g transform={`translate(${h.x} ${h.y})`} opacity={ghost.valid ? 0.85 : 0.45}>
                                    <circle r={tokenR + 2} fill={UNITS[ghost.unit].color} />
                                    <image href={unitIconUrl(ghost.unit)} x={-tokenR} y={-tokenR} width={tokenR * 2} height={tokenR * 2} clipPath={`url(#clip-${ghost.unit})`} />
                                </g>
                            ) : null;
                        })()}
                    {ghostCentre && <BossMark icon={bossIcon} x={ghostCentre.x} y={ghostCentre.y} r={iconR} opacity={ghost.valid ? 0.8 : 0.4} />}
                </g>
            )}

            {/* The click targets sit on top of everything, so every hex takes the click wherever its token is. */}
            {board.hexes
                .filter((h) => h.passable)
                .map((h) => (
                    <polygon
                        key={`t-${cellKey(h.cell)}`}
                        className="target"
                        points={polygon(h.x, h.y, 1)}
                        onPointerDown={(e) => {
                            (e.target as Element).releasePointerCapture?.(e.pointerId);
                            onCellDown(h.cell, toPoint(e));
                        }}
                        onPointerEnter={(e) => {
                            if (e.buttons === 1) onCellEnter(h.cell);
                        }}
                    />
                ))}
        </svg>
    );
}

/** The boss's round portrait ringed in red, sized for its footprint; the word BOSS when the dump has no portrait for it. */
function BossMark({ icon, x, y, r, opacity = 1 }: { icon?: string; x: number; y: number; r: number; opacity?: number }) {
    return (
        <g transform={`translate(${x} ${y})`} opacity={opacity} pointerEvents="none">
            {icon ? (
                <>
                    <circle r={r + 2.5} className="boss-ring" />
                    <image href={bossIconUrl(icon)} x={-r} y={-r} width={r * 2} height={r * 2} clipPath="url(#clip-boss)" />
                </>
            ) : (
                <text className="boss-label" textAnchor="middle" dominantBaseline="central">
                    BOSS
                </text>
            )}
        </g>
    );
}
