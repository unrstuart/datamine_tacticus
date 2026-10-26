import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../core/board';
import { AttackReport } from '../engine/attacks';
import { Frame, Replay } from '../replay/replay';
import { Scene, sceneAt, timeline } from '../replay/timeline';
import { ReplayBoard, ZKAR_COLOR } from './ReplayBoard';
import { actorName, describeAction, fmt } from './describe';
import { UNITS, unitIconUrl } from './units';

/** The pause between one step and the next while playing. */
const GAP = 250;

const ringOf = (actor: string | undefined): string => (actor === 'zkar' ? ZKAR_COLOR : actor ? UNITS[actor as keyof typeof UNITS].color : 'var(--border)');

const triggerText = (r: AttackReport): string => (r.trigger ? { deploy: 'on deploying', archimatos: "after Archimatos's attack", abraxas: "after Abraxas's attack", nextRound: 'at the start of next round' }[r.trigger] : '');

/** What the current frame does, in a line. */
function frameTitle(frame: Frame): string {
    if (frame.kind === 'start') return 'Start of the round';
    if (frame.kind === 'end') return "End of the round: Z'kar's attack at the start of the next one, and anyone left on an undesirable hex is lost";
    return frame.actions.map(describeAction).join(', then ');
}

function ProgressBar({ replay, index, onSelect }: { replay: Replay; index: number; onSelect: (i: number) => void }) {
    const bar = useRef<HTMLDivElement>(null);
    const last = replay.frames.length - 1;
    // The tick nearest to where the pointer is, so the bar can be dragged as well as clicked.
    const pick = (clientX: number) => {
        const box = bar.current?.getBoundingClientRect();
        if (!box) return;
        const x = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
        onSelect(Math.round(x * last));
    };
    return (
        <div
            ref={bar}
            className="progress"
            role="slider"
            tabIndex={0}
            aria-label="Step"
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={index}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                pick(e.clientX);
            }}
            onPointerMove={(e) => {
                if (e.buttons === 1) pick(e.clientX);
            }}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onSelect(Math.max(0, index - 1));
                if (e.key === 'ArrowRight') onSelect(Math.min(last, index + 1));
            }}
        >
            <div className="progress-line">
                <div className="progress-fill" style={{ width: `${last > 0 ? (index / last) * 100 : 0}%` }} />
            </div>
            {replay.frames.map((f, i) => (
                <span key={i} className={`tick${i === index ? ' current' : i < index ? ' past' : ''}`} style={{ left: `${last > 0 ? (i / last) * 100 : 0}%`, borderColor: ringOf(f.icon) }} title={`${i}: ${frameTitle(f)}`}>
                    {f.icon ? <img src={unitIconUrl(f.icon)} alt={actorName(f.icon)} /> : <b>{f.kind === 'start' ? 'S' : 'E'}</b>}
                    {f.badge && <img className="tick-badge" src={unitIconUrl(f.badge)} alt="" style={{ borderColor: ZKAR_COLOR }} />}
                </span>
            ))}
        </div>
    );
}

/** Steps through a plan on the map: the action, the damage it does, and the whole damage series below. */
export function ReplayPanel({ board, replay, title, bossIcon, undesirable, onClose, startAt = 0 }: { board: Board; replay: Replay; title: string; bossIcon?: string; undesirable: readonly string[]; onClose: () => void; startAt?: number }) {
    const last = replay.frames.length - 1;
    const [index, setIndex] = useState(startAt);
    // While a frame's animation runs: which frame, when it began, and how far along it is.
    const [anim, setAnim] = useState<{ frame: number; startedAt: number }>();
    const [clock, setClock] = useState(0);
    const [playing, setPlaying] = useState(false);

    const goTo = (i: number, animate: boolean) => {
        setIndex(i);
        setClock(0);
        setAnim(animate && replay.frames[i].beats.length > 0 ? { frame: i, startedAt: performance.now() } : undefined);
    };
    const jump = (i: number) => {
        setPlaying(false);
        goTo(i, false);
    };

    // Run the frame's animation, drawing every display frame until it is over.
    useEffect(() => {
        if (!anim) return;
        const total = timeline(replay.frames[anim.frame]).total;
        let id = 0;
        const tick = () => {
            const t = performance.now() - anim.startedAt;
            if (t >= total) {
                setAnim(undefined);
                return;
            }
            setClock(t);
            id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [anim, replay]);

    // Playing: a quarter second after a step finishes, take the next.
    useEffect(() => {
        if (!playing || anim) return;
        if (index >= last) {
            setPlaying(false);
            return;
        }
        const id = setTimeout(() => goTo(index + 1, true), GAP);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, anim, index]);

    const frame = replay.frames[index];
    const animating = anim !== undefined;
    const scene: Scene | undefined = useMemo(() => (anim ? sceneAt(replay.frames[anim.frame], clock) : undefined), [anim, clock, replay]);
    // At rest the board shows the state after the frame; while it plays, the state before it with the animation over it.
    const shown = animating ? frame.before : frame.after;
    const zkar = animating ? (frame.before.zkar ? { cells: frame.before.zkar.cells, alpha: 1 } : scene?.deployed && frame.after.zkar ? { cells: frame.after.zkar.cells, alpha: scene.deployed.alpha } : undefined) : frame.after.zkar ? { cells: frame.after.zkar.cells, alpha: 1 } : undefined;

    let running = 0;
    const rows = replay.series.map((e) => ({ ...e, running: (running += e.report.damage) }));

    return (
        <section className="replay">
            <div className="replay-head">
                <h2>{title}</h2>
                <button type="button" className="tool" onClick={onClose}>
                    Back to plans
                </button>
            </div>

            <div className="replay-now">
                <div className="replay-what">
                    <span className="replay-step">
                        {index} / {last}
                    </span>{' '}
                    {frameTitle(frame)}
                </div>
                <div className="replay-damage">
                    {frame.reports.length > 0 ? (
                        <>
                            {frame.reports.map((r, i) => (
                                <span key={i}>
                                    {i > 0 && ' + '}
                                    {actorName(r.actor)} {fmt(r.damage)}
                                </span>
                            ))}
                            {frame.reports.length > 1 && <strong> = {fmt(frame.damage)}</strong>}
                        </>
                    ) : (
                        <span className="muted">no damage</span>
                    )}
                </div>
            </div>

            <div className="replay-controls">
                <button type="button" className="tool" onClick={() => jump(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous step">
                    ◀ Prev
                </button>
                <button
                    type="button"
                    className="tool"
                    onClick={() => {
                        if (playing) {
                            setPlaying(false);
                        } else {
                            if (index >= last) goTo(0, false);
                            setPlaying(true);
                        }
                    }}
                >
                    {playing ? '❚❚ Pause' : '▶ Play'}
                </button>
                <button
                    type="button"
                    className="tool"
                    onClick={() => {
                        setPlaying(false);
                        goTo(Math.min(last, index + 1), true);
                    }}
                    disabled={index >= last}
                    aria-label="Next step"
                >
                    Next ▶
                </button>
                <ProgressBar replay={replay} index={index} onSelect={jump} />
            </div>

            <ReplayBoard board={board} state={shown} zkar={zkar} scene={scene} bossIcon={bossIcon} undesirable={undesirable} />

            <h3>The damage, attack by attack</h3>
            <table className="series">
                <tbody>
                    {rows.map((r, i) => {
                        const state = r.frame < index ? 'past' : r.frame === index ? 'now' : 'later';
                        return (
                            <tr key={i} className={`series-${state}`}>
                                <td className="series-mark">{state === 'now' ? '>' : ''}</td>
                                <td>
                                    {actorName(r.report.actor)}
                                    {r.report.extra ? ' (extra attack)' : ''} {r.report.kind}
                                    {r.report.trigger ? <span className="muted"> {triggerText(r.report)}</span> : null}
                                </td>
                                <td className="num">{fmt(r.report.damage)}</td>
                                <td className="num muted">{fmt(r.running)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </section>
    );
}
