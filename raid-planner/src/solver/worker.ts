/// <reference lib="webworker" />
import { Board, BoardData } from '../core/board';
import { EnemyArmor } from '../core/enemies';
import { Roster } from '../core/roster';
import { Setup } from '../core/setup';
import { COUNTER_LENGTH, makeCounters } from './counters';
import { StoredPlan, search } from './search';

// The search, off the page's thread. The page makes the counters (see counters.ts), hands the buffer over, and watches it;
// when the buffer is shared the page also stops the search through it. Without a shared buffer the worker posts the counters
// as messages instead, and the page stops it by terminating the worker.

export type ToWorker = { type: 'start'; board: BoardData; setup: Setup; roster: Roster; armor: EnemyArmor; counters: ArrayBufferLike; top: number };
export type FromWorker =
    | { type: 'best'; plans: StoredPlan[] }
    | { type: 'progress'; counters: string[] }
    | { type: 'done'; bestScore: number | undefined; plans: StoredPlan[]; stopped: boolean };

const post = (message: FromWorker) => (self as unknown as Worker).postMessage(message);

self.onmessage = (event: MessageEvent<ToWorker>) => {
    const msg = event.data;
    if (msg.type !== 'start') return;
    const counters = makeCounters(msg.counters);
    const snapshot = () => post({ type: 'progress', counters: Array.from({ length: COUNTER_LENGTH }, (_, i) => String(Atomics.load(counters, i))) });
    let last = 0;
    const board = new Board(msg.board);
    const result = search({ board, setup: msg.setup, roster: msg.roster, armor: msg.armor }, counters, {
        top: msg.top,
        onBest: (plans) => post({ type: 'best', plans }),
        shouldStop: () => {
            const now = Date.now();
            if (now - last > 250) {
                last = now;
                snapshot();
            }
            return false;
        },
    });
    snapshot();
    post({ type: 'done', bestScore: result.bestScore, plans: result.plans, stopped: result.stopped });
};
