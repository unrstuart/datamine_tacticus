import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardData } from '../core/board';
import { EnemyArmor } from '../core/enemies';
import { Roster } from '../core/roster';
import { Setup } from '../core/setup';
import { COUNTER, COUNTER_LENGTH, Counters, NO_SCORE, Progress, bytesForCounters, makeCounters, readProgress, requestStop } from '../solver/counters';
import { StoredPlan } from '../solver/search';
import type { FromWorker, ToWorker } from '../solver/worker';

export interface SolverState {
    running: boolean;
    progress: Progress | undefined;
    plans: StoredPlan[];
    /** Milliseconds since it started. */
    elapsed: number;
    /** True when the counters are shared with the worker (so the page reads them live, and the worker can be stopped cleanly). */
    shared: boolean;
}

const idle: SolverState = { running: false, progress: undefined, plans: [], elapsed: 0, shared: false };

/**
 * Runs the search in a worker. The page polls the counters about ten times a second; with a SharedArrayBuffer (a cross-origin
 * isolated page) it reads the worker's atomics directly, otherwise the worker posts them.
 */
export function useSolver(): { state: SolverState; start: (board: BoardData, setup: Setup, roster: Roster, armor: EnemyArmor) => void; stop: () => void } {
    const [state, setState] = useState<SolverState>(idle);
    const worker = useRef<Worker | undefined>(undefined);
    const counters = useRef<Counters | undefined>(undefined);
    const shared = useRef(false);
    const startedAt = useRef(0);
    const plans = useRef<StoredPlan[]>([]);
    const running = useRef(false);

    const publish = useCallback(() => {
        if (!counters.current) return;
        setState({ running: running.current, progress: readProgress(counters.current), plans: plans.current, elapsed: Date.now() - startedAt.current, shared: shared.current });
    }, []);

    useEffect(() => {
        const id = setInterval(() => {
            if (running.current) publish();
        }, 100);
        return () => {
            clearInterval(id);
            worker.current?.terminate();
        };
    }, [publish]);

    const start = useCallback(
        (board: BoardData, setup: Setup, roster: Roster, armor: EnemyArmor) => {
            worker.current?.terminate();
            const canShare = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
            const buffer = canShare ? new SharedArrayBuffer(bytesForCounters()) : new ArrayBuffer(bytesForCounters());
            // The page's counters sit over the buffer that goes to the worker (shared), or over a copy that messages fill in.
            counters.current = makeCounters(buffer);
            Atomics.store(counters.current, COUNTER.bestScore, NO_SCORE);
            shared.current = canShare;
            plans.current = [];
            startedAt.current = Date.now();
            running.current = true;

            const w = new Worker(new URL('../solver/worker.ts', import.meta.url), { type: 'module' });
            worker.current = w;
            w.onmessage = (e: MessageEvent<FromWorker>) => {
                const msg = e.data;
                if (msg.type === 'best') {
                    plans.current = msg.plans;
                } else if (msg.type === 'progress') {
                    // Without shared memory the worker's counters arrive as messages.
                    if (!canShare && counters.current) for (let i = 0; i < COUNTER_LENGTH; i++) Atomics.store(counters.current, i, BigInt(msg.counters[i]));
                } else if (msg.type === 'done') {
                    plans.current = msg.plans;
                    running.current = false;
                    publish();
                }
            };
            const message: ToWorker = { type: 'start', board, setup, roster, armor, counters: buffer, top: 10 };
            w.postMessage(message);
            publish();
        },
        [publish]
    );

    const stop = useCallback(() => {
        if (!running.current) return;
        if (shared.current && counters.current) {
            requestStop(counters.current); // the worker notices within a moment and sends what it has
        } else {
            worker.current?.terminate(); // no shared flag to set: just stop it, keeping the plans received so far
            running.current = false;
            publish();
        }
    }, [publish]);

    return { state, start, stop };
}
