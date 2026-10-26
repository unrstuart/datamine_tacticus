import { Cell, cellKey } from './hex';
import { UnitId } from './setup';

// Hard rules a plan must follow, which the user sets on a map and which are saved with it. They narrow the search: a plan that
// breaks one is never offered. "Attacking" always means the moment that character makes its attack.

export type AttackWord = 'melee' | 'ranged' | 'active';

export type Constraint =
    /** The character stands here when it attacks (and so ends the round here). Pinning it where it starts keeps it from moving. */
    | { kind: 'pin'; unit: UnitId; cell: Cell }
    /** Z'kar is deployed by clicking this hex. */
    | { kind: 'zkarAt'; cell: Cell }
    /** The character must attack (not just pass), or must not. */
    | { kind: 'mustAttack'; unit: UnitId }
    | { kind: 'mustNotAttack'; unit: UnitId }
    /** The character attacks with this kind of attack. */
    | { kind: 'attackKind'; unit: UnitId; attack: AttackWord }
    /** The character attacks before everyone else, or after everyone else. */
    | { kind: 'order'; unit: UnitId; position: 'first' | 'last' }
    /** `unit` attacks before `other` does. */
    | { kind: 'before'; unit: UnitId; other: UnitId }
    /** The character is next to the boss when it attacks, or on higher ground than it. */
    | { kind: 'nextToBoss'; unit: UnitId }
    | { kind: 'highGround'; unit: UnitId }
    /** `unit` is next to `other` (a character, or Z'kar) when it attacks. */
    | { kind: 'adjacent'; unit: UnitId; other: UnitId | 'zkar' };

/** Which rules are the same rule, so that setting one replaces the other (a character has one pin, one attack kind, and so on). */
export function constraintKey(c: Constraint): string {
    switch (c.kind) {
        case 'pin':
        case 'attackKind':
        case 'order':
        case 'nextToBoss':
        case 'highGround':
            return `${c.kind}:${c.unit}`;
        case 'mustAttack':
        case 'mustNotAttack':
            return `attacking:${c.unit}`;
        case 'zkarAt':
            return 'zkarAt';
        case 'before':
            return `before:${c.unit}>${c.other}`;
        case 'adjacent':
            return `adjacent:${c.unit}>${c.other}`;
    }
}

/** The rules with `c` set: it replaces the rule it is the same as, if there is one. */
export const withConstraint = (list: readonly Constraint[], c: Constraint): Constraint[] => [...list.filter((x) => constraintKey(x) !== constraintKey(c)), c];

export const withoutConstraint = (list: readonly Constraint[], key: string): Constraint[] => list.filter((x) => constraintKey(x) !== key);

export const findConstraint = <K extends Constraint['kind']>(list: readonly Constraint[], key: string, kind: K): Extract<Constraint, { kind: K }> | undefined =>
    list.find((x) => constraintKey(x) === key && x.kind === kind) as Extract<Constraint, { kind: K }> | undefined;

/** Pin a character to a hex; pinning the same character to the same hex again takes the pin off. */
export function togglePin(list: readonly Constraint[], unit: UnitId, cell: Cell): Constraint[] {
    const old = findConstraint(list, `pin:${unit}`, 'pin');
    return old && cellKey(old.cell) === cellKey(cell) ? withoutConstraint(list, `pin:${unit}`) : withConstraint(list, { kind: 'pin', unit, cell });
}

export function toggleZkarAt(list: readonly Constraint[], cell: Cell): Constraint[] {
    const old = findConstraint(list, 'zkarAt', 'zkarAt');
    return old && cellKey(old.cell) === cellKey(cell) ? withoutConstraint(list, 'zkarAt') : withConstraint(list, { kind: 'zkarAt', cell });
}

/** Rules that can't both hold, for saying so: a character that must attack but is pinned on... (checked by the search itself), or the same pair ordered both ways. */
export function contradictions(list: readonly Constraint[]): string[] {
    const out: string[] = [];
    for (const a of list) {
        if (a.kind === 'before' && list.some((b) => b.kind === 'before' && b.unit === a.other && b.other === a.unit)) out.push(`${a.unit} and ${a.other} can't each attack before the other`);
        if (a.kind === 'order' && a.position === 'first' && list.some((b) => b.kind === 'order' && b.position === 'first' && b.unit !== a.unit)) out.push('two characters can\'t both attack first');
        if (a.kind === 'order' && a.position === 'last' && list.some((b) => b.kind === 'order' && b.position === 'last' && b.unit !== a.unit)) out.push('two characters can\'t both attack last');
    }
    return [...new Set(out)];
}
