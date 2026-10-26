import { Cell } from '../core/hex';
import { UnitId } from '../core/setup';
import { AttackReport } from '../engine/attacks';
import { Action, applyAction, finishRound } from '../engine/plan';
import { movePath } from '../engine/movement';
import { Context, Enemy, State, initialState, sameEnemy } from '../engine/state';
import { ActorName } from '../engine/units';

// A plan turned into something to watch: a list of frames (the start, one for each action that does something, the end of the
// round), each with what to animate in it, one beat after another, and the state before and after. Pure data, so it can be tested
// without a screen; timeline.ts says when each beat happens and ReplayBoard draws it.

export type Beat =
    /** A character walks along `path` (the hexes it steps through, ending at its destination). */
    | { kind: 'move'; actor: UnitId; path: Cell[] }
    /** Z'kar appears on `cells`. */
    | { kind: 'deploy'; actor: 'zkar'; cells: Cell[] }
    /** A character uses an active: its portrait glows. */
    | { kind: 'active'; actor: ActorName }
    /**
     * An attack: the actor nudges towards `target`, which takes `damage` (what the attack's hits on it add up to); `haloed` are the
     * other enemies it reached (Abaddon's relic, Talon of Horus), flashed red.
     */
    | { kind: 'attack'; actor: ActorName; target: Enemy; damage: number; haloed: Enemy[]; report: AttackReport };

export interface Frame {
    kind: 'start' | 'action' | 'end';
    /** The actions this frame plays (Abaddon's active and the attack after it are one frame). */
    actions: Action[];
    /** Whose icon marks the frame on the progress bar, and a second icon for Z'kar when an attack of his follows. */
    icon?: ActorName;
    badge?: ActorName;
    beats: Beat[];
    before: State;
    after: State;
    reports: AttackReport[];
    /** Damage to the boss in this frame. */
    damage: number;
}

export interface SeriesEntry {
    frame: number;
    report: AttackReport;
}

export interface Replay {
    frames: Frame[];
    /** Every attack that hit something, in order, for the damage list. */
    series: SeriesEntry[];
}

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

/** The beats of one attack report: a flash of gold for an active, then the nudge and the damage. */
function attackBeats(report: AttackReport): Beat[] {
    const [target, ...others] = report.targets;
    if (!target) return [];
    const beats: Beat[] = [];
    if (report.kind === 'active' && report.actor !== 'zkar') beats.push({ kind: 'active', actor: report.actor });
    const damage = sum(report.groups.filter((g) => sameEnemy(g.target, target)).map((g) => g.damage));
    beats.push({ kind: 'attack', actor: report.actor, target, damage, haloed: others, report });
    return beats;
}

export function buildReplay(ctx: Context, actions: readonly Action[]): Replay {
    let state = initialState(ctx.setup);
    const start: Frame = { kind: 'start', actions: [], beats: [], before: state, after: state, reports: [], damage: 0 };
    const frames: Frame[] = [start];

    for (let i = 0; i < actions.length; i++) {
        const first = actions[i];
        // Abaddon's active and the attack that follows it are one turn.
        const merged = first.type === 'abaddonActive' && actions[i + 1]?.type === 'attack' && (actions[i + 1] as { unit: UnitId }).unit === 'abaddon';
        const played = merged ? [first, actions[i + 1]] : [first];
        if (merged) i++;

        const before = state;
        const beats: Beat[] = [];
        const reports: AttackReport[] = [];
        let icon: ActorName | undefined;
        let shown = false;
        for (const action of played) {
            const result = applyAction(ctx, state, action);
            if (!result) throw new Error(`illegal action: ${JSON.stringify(action)}`);
            switch (action.type) {
                case 'move':
                    beats.push({ kind: 'move', actor: action.unit, path: movePath(ctx.board, state, action.unit, action.to) ?? [action.to] });
                    icon = action.unit;
                    shown = true;
                    break;
                case 'abaddonActive':
                    beats.push({ kind: 'active', actor: 'abaddon' });
                    icon = 'abaddon';
                    shown = true;
                    break;
                case 'deploy':
                    beats.push({ kind: 'deploy', actor: 'zkar', cells: result.state.zkar!.cells });
                    icon = 'zkar';
                    shown = true;
                    break;
                case 'attack':
                    icon = action.unit;
                    shown = true;
                    break;
                case 'pass':
                    break;
            }
            for (const r of result.reports) {
                reports.push(r);
                beats.push(...attackBeats(r));
            }
            state = result.state;
        }
        if (!shown) continue; // a pass changes nothing worth watching
        const badge = reports.some((r) => r.actor === 'zkar') && icon !== 'zkar' ? 'zkar' : undefined;
        frames.push({ kind: 'action', actions: played, icon, badge, beats, before, after: state, reports, damage: sum(reports.map((r) => r.damage)) });
    }

    // The end of the round: Z'kar's attack at the start of the next one, and anyone lost on an undesirable hex.
    const done = finishRound(ctx, state);
    const lost = Object.keys(state.units).length !== Object.keys(done.state.units).length;
    if (done.reports.length > 0 || lost) {
        const beats = done.reports.flatMap(attackBeats);
        frames.push({ kind: 'end', actions: [], icon: done.reports.length > 0 ? 'zkar' : undefined, beats, before: state, after: done.state, reports: done.reports, damage: sum(done.reports.map((r) => r.damage)) });
    }

    const series: SeriesEntry[] = [];
    frames.forEach((f, i) => {
        for (const report of f.reports) if (report.targets.length > 0) series.push({ frame: i, report });
    });
    return { frames, series };
}
