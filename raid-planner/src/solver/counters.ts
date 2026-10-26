// Progress counters shared between the search (in a worker) and the page. They live in one BigInt64Array over a
// SharedArrayBuffer and are only touched with Atomics, so the search can bump them and the page can read them without any
// lock. (They also work over a plain ArrayBuffer, for tests and for pages that aren't cross-origin isolated.)

export const COUNTER = {
    /** Sequences planned so far: every sequence the search has generated. It keeps growing as the search finds more. */
    planned: 0,
    /** Sequences searched so far: planned ones that have been evaluated and whose continuations are done. */
    searched: 1,
    /** Distinct plans tied for the best score so far. */
    bestRuns: 2,
    /** The best score so far. */
    bestScore: 3,
    /** Set by the page to ask the search to stop. */
    cancel: 4,
    /** Set by the search when it has finished (1) or was stopped (2). */
    status: 5,
    /** Complete plans evaluated (every character finished). */
    complete: 6,
} as const;

export const COUNTER_LENGTH = 8;
export const NO_SCORE = -(2n ** 40n);

export type Counters = BigInt64Array;

/**
 * The counters over `buffer`, or over a fresh buffer. Pass a buffer that already holds counters (the one the page made and
 * handed to the worker) to share it without resetting it.
 */
export function makeCounters(buffer?: ArrayBufferLike): Counters {
    const counters = new BigInt64Array(buffer ?? new ArrayBuffer(COUNTER_LENGTH * 8));
    if (!buffer) Atomics.store(counters, COUNTER.bestScore, NO_SCORE);
    return counters;
}

export const bytesForCounters = (): number => COUNTER_LENGTH * 8;

export interface Progress {
    planned: bigint;
    searched: bigint;
    bestRuns: bigint;
    bestScore: number | undefined;
    complete: bigint;
    status: 'running' | 'done' | 'stopped';
}

export function readProgress(counters: Counters): Progress {
    const score = Atomics.load(counters, COUNTER.bestScore);
    const status = Atomics.load(counters, COUNTER.status);
    return {
        planned: Atomics.load(counters, COUNTER.planned),
        searched: Atomics.load(counters, COUNTER.searched),
        bestRuns: Atomics.load(counters, COUNTER.bestRuns),
        bestScore: score === NO_SCORE ? undefined : Number(score),
        complete: Atomics.load(counters, COUNTER.complete),
        status: status === 1n ? 'done' : status === 2n ? 'stopped' : 'running',
    };
}

export const requestStop = (counters: Counters): void => {
    Atomics.store(counters, COUNTER.cancel, 1n);
};
