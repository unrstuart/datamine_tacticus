import { Cell } from '../core/hex';
import { UnitId } from '../core/setup';
import { Enemy } from '../engine/state';
import { ActorName } from '../engine/units';
import { Beat, Frame } from './replay';

// When each beat of a frame happens. Beats play one after another; the damage number and the red halos start with their attack
// and outlast it a little (they run alongside the next beat). Times are in milliseconds from the start of the frame.

export const DURATION = {
    move: 300,
    deploy: 250,
    active: 400,
    /** The nudge towards the target and back. */
    attack: 250,
    /** The damage number's rise and fade. */
    pop: 400,
    halo: 500,
};

const beatLength = (beat: Beat): number => DURATION[beat.kind];

export interface Timed {
    beat: Beat;
    start: number;
    end: number;
}

export function timeline(frame: Frame): { items: Timed[]; total: number } {
    const items: Timed[] = [];
    let at = 0;
    let total = 0;
    for (const beat of frame.beats) {
        const end = at + beatLength(beat);
        items.push({ beat, start: at, end });
        total = Math.max(total, end, beat.kind === 'attack' ? at + (beat.haloed.length > 0 ? DURATION.halo : 0) : 0, beat.kind === 'attack' && beat.damage > 0 ? at + DURATION.pop : 0);
        at = end;
    }
    return { items, total };
}

export interface Scene {
    /** Characters walking in this frame: where they are along their route (the start hex, then the path), 0 to 1. */
    walkers: Array<{ actor: UnitId; route: Cell[]; progress: number }>;
    /** Z'kar is on the board (fading in) because of a deploy in this frame. */
    deployed?: { alpha: number };
    /** Portraits glowing gold, with how far round the swirl is (0 to 1). */
    glows: Array<{ actor: ActorName; phase: number; alpha: number }>;
    /** Attackers nudged towards their target: `amount` goes 0 -> 1 -> 0. */
    nudges: Array<{ actor: ActorName; target: Enemy; amount: number }>;
    halos: Array<{ enemy: Enemy; alpha: number }>;
    /** Damage numbers: `age` goes 0 -> 1 as the number rises and fades. */
    pops: Array<{ enemy: Enemy; damage: number; age: number }>;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * What is happening `t` ms into a frame. (When t is past the end, `walkers` have all arrived, and the board should be drawn
 * from the frame's `after` state.)
 */
export function sceneAt(frame: Frame, t: number): Scene {
    const scene: Scene = { walkers: [], glows: [], nudges: [], halos: [], pops: [] };
    for (const { beat, start, end } of timeline(frame).items) {
        const p = clamp01((t - start) / (end - start));
        switch (beat.kind) {
            case 'move': {
                const origin = frame.before.units[beat.actor]?.cell;
                if (origin) scene.walkers.push({ actor: beat.actor, route: [origin, ...beat.path], progress: p });
                break;
            }
            case 'deploy':
                if (t >= start) scene.deployed = { alpha: p };
                break;
            case 'active':
                if (t >= start && t < end) scene.glows.push({ actor: beat.actor, phase: p, alpha: Math.sin(Math.PI * p) });
                break;
            case 'attack':
                if (t >= start && t < end) scene.nudges.push({ actor: beat.actor, target: beat.target, amount: Math.sin(Math.PI * p) });
                if (beat.damage > 0 && t >= start && t < start + DURATION.pop) scene.pops.push({ enemy: beat.target, damage: beat.damage, age: (t - start) / DURATION.pop });
                if (t >= start && t < start + DURATION.halo) for (const enemy of beat.haloed) scene.halos.push({ enemy, alpha: 1 - (t - start) / DURATION.halo });
                break;
        }
    }
    return scene;
}

/** The spot `progress` (0 to 1) of the way along a route of hexes, as two neighbouring hexes and how far between them. */
export function along(route: readonly Cell[], progress: number): { from: Cell; to: Cell; fraction: number } {
    if (route.length < 2) return { from: route[0], to: route[0], fraction: 0 };
    const legs = route.length - 1;
    const x = clamp01(progress) * legs;
    const i = Math.min(legs - 1, Math.floor(x));
    return { from: route[i], to: route[i + 1], fraction: x - i };
}
