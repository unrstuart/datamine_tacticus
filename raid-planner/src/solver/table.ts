import { cellKey } from '../core/hex';
import { State } from '../engine/state';

// A fixed-size table of states already searched, so the search can skip a state it reaches a second time by a different order
// of the same actions. Memory is fixed up front (three typed arrays); a new state simply overwrites whatever shares its slot, so
// it never grows and can never run out of memory, it just forgets. States are identified by a 64-bit hash, so a wrong "seen
// it" needs both halves to collide.

const FNV_PRIME = 16777619;

class Hasher {
    a = 2166136261;
    b = 0x9747b28c;
    add(n: number): void {
        this.a = Math.imul(this.a ^ n, FNV_PRIME) >>> 0;
        this.b = Math.imul(this.b + n + 0x9e3779b9, 0x85ebca6b) >>> 0;
        this.b ^= this.b >>> 13;
    }
    addString(s: string): void {
        for (let i = 0; i < s.length; i++) this.add(s.charCodeAt(i));
        this.add(0xff);
    }
}

/** A 64-bit hash (as two 32-bit halves) of everything about a state that can affect what happens next. */
export function hashState(state: State): [number, number] {
    const h = new Hasher();
    for (const id of ['abaddon', 'ahriman', 'abraxas', 'archimatos', 'neurothrope'] as const) {
        const u = state.units[id];
        if (!u) {
            h.add(-1);
            continue;
        }
        h.add(u.cell.col);
        h.add(u.cell.row);
        h.add((u.moved ? 1 : 0) | (u.attacked ? 2 : 0));
    }
    if (state.zkar) {
        for (const c of state.zkar.cells) {
            h.add(c.col);
            h.add(c.row);
        }
        h.add((state.zkar.triggered.deploy ? 1 : 0) | (state.zkar.triggered.archimatos ? 2 : 0) | (state.zkar.triggered.abraxas ? 4 : 0));
    } else h.add(-2);
    h.add(state.minions.length);
    for (const m of [...state.minions].map(cellKey).sort()) h.addString(m);
    const effects = Object.entries(state.effects).sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [k, v] of effects) {
        h.addString(k);
        h.addString(v);
    }
    h.add(state.neuroStacks);
    h.add(state.abaddonStacks);
    h.addString(state.abaddonExtra);
    h.add((state.ahrimanActiveAvailable ? 1 : 0) | (state.neuroActiveAvailable ? 2 : 0) | (state.neuroAdjacent ? 4 : 0));
    return [h.a, h.b];
}

export class StateTable {
    private readonly mask: number;
    private readonly hi: Uint32Array;
    private readonly lo: Uint32Array;
    /** The best score so far with which each state was reached, plus one (so 0 means an empty slot). */
    private readonly score: Int32Array;

    /** `bits` slots = 2^bits; 21 bits is 2M states in 24 MB. */
    constructor(bits = 21) {
        const size = 1 << bits;
        this.mask = size - 1;
        this.hi = new Uint32Array(size);
        this.lo = new Uint32Array(size);
        this.score = new Int32Array(size);
    }

    /**
     * Note that `state` was reached with `score` so far. Returns true when it had already been reached with at least that
     * score, which means searching it again cannot find anything better (it can only tie), so the caller can skip it.
     */
    seen(state: State, score: number): boolean {
        const [a, b] = hashState(state);
        const slot = a & this.mask;
        if (this.score[slot] !== 0 && this.hi[slot] === b && this.lo[slot] === a) {
            if (this.score[slot] - 1 >= score) return true;
            this.score[slot] = score + 1;
            return false;
        }
        this.hi[slot] = b;
        this.lo[slot] = a;
        this.score[slot] = score + 1;
        return false;
    }
}
