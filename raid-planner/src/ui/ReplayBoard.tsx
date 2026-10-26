import { Board } from '../core/board';
import { Cell, cellKey } from '../core/hex';
import { Effect, UNIT_IDS, UnitId } from '../core/setup';
import { Enemy, State } from '../engine/state';
import { ActorName } from '../engine/units';
import { Scene, along } from '../replay/timeline';
import { boardImageUrl } from '../data';
import { BOSS_ICON_SCALE, BossMark, hexPoints } from './BoardView';
import { EFFECT_TINT, EffectGlyph } from './EffectGlyph';
import { UNITS, unitIconUrl } from './units';

export const ZKAR_COLOR = '#9be15d';
const GOLD = '#ffd54a';
const smooth = (x: number): number => x * x * (3 - 2 * x);

interface ReplayBoardProps {
    board: Board;
    /** What to draw: the boss, minions, effects, stacks and characters as they stand. */
    state: State;
    /** Z'kar's hexes and how visible he is (he fades in on his deploy). */
    zkar?: { cells: Cell[]; alpha: number };
    /** What is moving, glowing and being hit right now; none when the board is at rest. */
    scene?: Scene;
    bossIcon?: string;
    /** Hexes marked undesirable in the setup. */
    undesirable: readonly string[];
}

/** The board image with the hexes and the round's state on top, and the animation of whatever is happening drawn over it. */
export function ReplayBoard({ board, state, zkar, scene, bossIcon, undesirable }: ReplayBoardProps) {
    const { imageWidth, imageHeight, hexWidth, hexHeight } = board.data;
    const tokenR = hexHeight * 0.42;
    const polygon = (x: number, y: number, scale?: number) => hexPoints(x, y, hexWidth, hexHeight, scale);
    const bossKeys = new Set(state.bossCells.map(cellKey));
    const bad = new Set(undesirable);

    const pixel = (c: Cell) => {
        const h = board.hexAt(c);
        return h ? { x: h.x, y: h.y } : { x: 0, y: 0 };
    };
    const centreOf = (cells: readonly Cell[]) => {
        const ps = cells.map(pixel);
        return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
    };
    const enemyCentre = (e: Enemy) => (e.kind === 'boss' ? centreOf(state.bossCells) : pixel(e.cell));
    const bossR = (hexHeight * (BOSS_ICON_SCALE[state.bossCells.length] ?? 1)) / 2;
    const enemyRadius = (e: Enemy) => (e.kind === 'boss' ? bossR : tokenR * 0.8);

    /** Where a character is drawn: at its hex, or part-way along its route while it walks. */
    const unitPoint = (id: UnitId) => {
        const walker = scene?.walkers.find((w) => w.actor === id);
        if (walker) {
            const { from, to, fraction } = along(walker.route, smooth(walker.progress));
            const a = pixel(from);
            const b = pixel(to);
            return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
        }
        return pixel(state.units[id]!.cell);
    };
    const zkarCentre = zkar ? centreOf(zkar.cells) : undefined;
    /** Nudged towards its target while it attacks. */
    const withNudge = (a: ActorName, p: { x: number; y: number }) => {
        const n = scene?.nudges.find((x) => x.actor === a);
        if (!n) return p;
        const t = enemyCentre(n.target);
        const d = Math.hypot(t.x - p.x, t.y - p.y) || 1;
        const k = n.amount * hexHeight * 0.4;
        return { x: p.x + ((t.x - p.x) / d) * k, y: p.y + ((t.y - p.y) / d) * k };
    };
    const glowOf = (a: ActorName) => scene?.glows.find((g) => g.actor === a);

    const stack = (n: number, x: number, y: number) =>
        n > 0 ? (
            <g transform={`translate(${x} ${y})`} pointerEvents="none">
                <circle r={hexHeight * 0.17} className="stack-badge" />
                <text className="stack-number" textAnchor="middle" dominantBaseline="central" fontSize={hexHeight * 0.2}>
                    {n}
                </text>
            </g>
        ) : null;

    const token = (a: ActorName, p: { x: number; y: number }, r: number, color: string, badge?: number) => {
        const glow = glowOf(a);
        return (
            <g key={`t-${a}`} transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
                {glow && <Glow r={r} phase={glow.phase} alpha={glow.alpha} />}
                <circle r={r + 2} fill={color} />
                <image href={unitIconUrl(a)} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#rclip-${a})`} />
                {badge !== undefined && stack(badge, r * 0.72, r * 0.72)}
            </g>
        );
    };

    const centre = centreOf(state.bossCells);
    return (
        <svg className="board replay-board" viewBox={`0 0 ${imageWidth} ${imageHeight}`} width={imageWidth} height={imageHeight}>
            <defs>
                <clipPath id="clip-boss">
                    <circle r={bossR} />
                </clipPath>
                {[...UNIT_IDS, 'zkar'].map((id) => (
                    <clipPath key={id} id={`rclip-${id}`}>
                        <circle r={id === 'zkar' ? tokenR * 1.45 : tokenR} />
                    </clipPath>
                ))}
            </defs>
            <image href={boardImageUrl(board.id)} width={imageWidth} height={imageHeight} />

            {board.hexes.map((h) => {
                const key = cellKey(h.cell);
                const effect: Effect | undefined = state.effects[key];
                return (
                    <g key={key}>
                        <polygon className={h.passable ? 'hex' : 'hex blocked'} points={polygon(h.x, h.y)} />
                        {bossKeys.has(key) && <polygon className="boss-hex" points={polygon(h.x, h.y)} />}
                        {effect && (
                            <>
                                <polygon fill={EFFECT_TINT[effect]} points={polygon(h.x, h.y, 0.8)} pointerEvents="none" />
                                <g transform={`translate(${h.x} ${h.y})`} pointerEvents="none">
                                    <EffectGlyph effect={effect} scale={hexHeight / 36} />
                                </g>
                            </>
                        )}
                        {bad.has(key) && <polygon className="undesirable" points={polygon(h.x, h.y, 0.94)} pointerEvents="none" />}
                    </g>
                );
            })}

            <BossMark icon={bossIcon} x={centre.x} y={centre.y} r={bossR} />
            {stack(state.neuroStacks, centre.x + bossR * 0.72, centre.y + bossR * 0.72)}

            {state.minions.map((m) => {
                const p = pixel(m);
                return (
                    <g key={`m-${cellKey(m)}`} transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
                        <circle r={tokenR * 0.8} className="minion" />
                        <text className="minion-label" textAnchor="middle" dominantBaseline="central">
                            M
                        </text>
                    </g>
                );
            })}

            {scene?.halos.map((h, i) => {
                const p = enemyCentre(h.enemy);
                return <circle key={`h-${i}`} cx={p.x} cy={p.y} r={enemyRadius(h.enemy) + 5} className="halo" opacity={h.alpha} pointerEvents="none" />;
            })}

            {zkar && zkarCentre && (
                <g opacity={zkar.alpha} pointerEvents="none">
                    {zkar.cells.map((c) => {
                        const p = pixel(c);
                        return <polygon key={`z-${cellKey(c)}`} fill={ZKAR_COLOR} fillOpacity={0.28} stroke={ZKAR_COLOR} strokeWidth={2} points={polygon(p.x, p.y, 0.94)} />;
                    })}
                    {token('zkar', withNudge('zkar', zkarCentre), tokenR * 1.45, ZKAR_COLOR)}
                </g>
            )}

            {UNIT_IDS.filter((id) => state.units[id]).map((id) => token(id, withNudge(id, unitPoint(id)), tokenR, UNITS[id].color, id === 'abaddon' ? state.abaddonStacks : undefined))}

            {scene?.pops.map((p, i) => {
                const c = enemyCentre(p.enemy);
                return (
                    <text key={`p-${i}`} className="damage-pop" x={c.x} y={c.y - p.age * hexHeight * 0.5} textAnchor="middle" fontSize={hexHeight * 0.5} opacity={1 - p.age} pointerEvents="none">
                        -{Math.round(p.damage).toLocaleString()}
                    </text>
                );
            })}
        </svg>
    );
}

/** A golden glow with sparks swirling round the portrait. */
function Glow({ r, phase, alpha }: { r: number; phase: number; alpha: number }) {
    const sparks = 6;
    return (
        <g opacity={alpha}>
            <circle r={r * 1.5} fill="url(#glow-gradient)" />
            <circle r={r + 4} fill="none" stroke={GOLD} strokeWidth={3} strokeOpacity={0.9} />
            {Array.from({ length: sparks }, (_, k) => {
                const a = phase * Math.PI * 4 + (k * 2 * Math.PI) / sparks;
                const wobble = 1.15 + 0.12 * Math.sin(phase * Math.PI * 6 + k);
                return <circle key={k} cx={Math.cos(a) * r * wobble} cy={Math.sin(a) * r * wobble} r={r * 0.11} fill={GOLD} />;
            })}
            <defs>
                <radialGradient id="glow-gradient">
                    <stop offset="55%" stopColor={GOLD} stopOpacity={0.75} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </radialGradient>
            </defs>
        </g>
    );
}
