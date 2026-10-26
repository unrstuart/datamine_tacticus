// What the search may skip. Each narrows the search with a rule of thumb, so a plan that breaks the rule can be missed. (The
// exact cut, an upper bound on what is left to score, is being rebuilt for damage; until then nothing is cut that could win.)

export interface SolverOptions {
    /**
     * Abaddon acts first (a move, or staying put), unless he is already at full stacks: if he can melee he attacks, using his
     * active first when it is available; if he can only shoot, he first shoots alone and then, in a second pass, Abraxas moves
     * next to him before he shoots. They are the likeliest ways to raise the score, and they leave fewer things to vary.
     */
    abaddonFirst: boolean;
    /** Only try a move if from the new hex the character could attack, or could give a buff to a friend who could still attack. */
    relevantMovesOnly: boolean;
    /** Only deploy Z'kar where an enemy is within his reach (adjacent, or within range 2). */
    zkarInRangeOnly: boolean;
    /**
     * Skip a state reached again by another order of the same actions when it was already reached with at least as much damage
     * (a fixed-size table, so memory cannot grow). It can only drop a plan that ties with one already found, such as the same
     * attacks in another order; it never loses the best damage. 0 turns it off; otherwise the table has 2^bits slots.
     */
    tableBits: number;
}

export const DEFAULT_OPTIONS: SolverOptions = { abaddonFirst: true, relevantMovesOnly: true, zkarInRangeOnly: true, tableBits: 21 };

/** Every rule off: the full search space. */
export const EXHAUSTIVE: SolverOptions = { abaddonFirst: false, relevantMovesOnly: false, zkarInRangeOnly: false, tableBits: 0 };
