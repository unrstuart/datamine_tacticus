import { useState } from 'react';
import { AttackWord, Constraint, constraintKey, findConstraint, withConstraint, withoutConstraint, contradictions } from '../core/constraints';
import { Setup, UNIT_IDS, UnitId } from '../core/setup';
import { ATTACKS } from '../engine/units';
import { describeConstraint } from './describe';
import { UNITS, unitIconUrl } from './units';

type Update = (patch: Partial<Setup>) => void;

/** What each character can be told to attack with (the normal attacks and its active; the rest is not a choice). */
const KINDS: Record<UnitId, AttackWord[]> = Object.fromEntries(UNIT_IDS.map((id) => [id, ATTACKS[id].map((a) => a.kind).filter((k): k is AttackWord => k === 'melee' || k === 'ranged' || k === 'active')])) as Record<UnitId, AttackWord[]>;

/**
 * The rules the plans must keep to: a card for each placed character (must attack, which attack, when it goes, where it
 * stands), a form for rules between two characters, and the list of every rule that is set, with a way to take each off.
 * Pins are set on the map with the pin tool.
 */
export function ConstraintsPanel({ setup, update }: { setup: Setup; update: Update }) {
    const list = setup.constraints;
    const set = (c: Constraint) => update({ constraints: withConstraint(list, c) });
    const clear = (key: string) => update({ constraints: withoutConstraint(list, key) });
    const placed = UNIT_IDS.filter((id) => setup.units[id]);

    const attacking = (id: UnitId): 'any' | 'must' | 'never' => (findConstraint(list, `attacking:${id}`, 'mustAttack') ? 'must' : findConstraint(list, `attacking:${id}`, 'mustNotAttack') ? 'never' : 'any');
    const clashes = contradictions(list);

    return (
        <section className="constraints">
            <h2>Rules</h2>
            <p className="hint">Plans must keep to every rule. Set where a character stands with the pins above.</p>

            {placed.map((id) => {
                const kind = findConstraint(list, `attackKind:${id}`, 'attackKind')?.attack ?? 'any';
                const order = findConstraint(list, `order:${id}`, 'order')?.position ?? 'any';
                const count = list.filter((c) => 'unit' in c && c.unit === id && c.kind !== 'pin').length;
                return (
                    <details className="rule-card" key={id} open={count > 0}>
                        <summary className="rule-name">
                            <img className="unit-chip" src={unitIconUrl(id)} alt="" style={{ borderColor: UNITS[id].color }} />
                            {UNITS[id].name}
                            {count > 0 && <span className="muted"> · {count} {count === 1 ? 'rule' : 'rules'}</span>}
                        </summary>
                        <label>
                            Attack
                            <select
                                value={attacking(id)}
                                onChange={(e) => (e.target.value === 'must' ? set({ kind: 'mustAttack', unit: id }) : e.target.value === 'never' ? set({ kind: 'mustNotAttack', unit: id }) : clear(`attacking:${id}`))}
                            >
                                <option value="any">Either</option>
                                <option value="must">Must attack</option>
                                <option value="never">Must not attack</option>
                            </select>
                        </label>
                        <label>
                            With
                            <select value={kind} onChange={(e) => (e.target.value === 'any' ? clear(`attackKind:${id}`) : set({ kind: 'attackKind', unit: id, attack: e.target.value as AttackWord }))}>
                                <option value="any">Any attack</option>
                                {KINDS[id].map((k) => (
                                    <option key={k} value={k}>
                                        {k === 'active' ? 'Its active' : k === 'melee' ? 'Melee' : 'Ranged'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Goes
                            <select value={order} onChange={(e) => (e.target.value === 'any' ? clear(`order:${id}`) : set({ kind: 'order', unit: id, position: e.target.value as 'first' | 'last' }))}>
                                <option value="any">Any time</option>
                                <option value="first">First</option>
                                <option value="last">Last</option>
                            </select>
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={!!findConstraint(list, `nextToBoss:${id}`, 'nextToBoss')} onChange={(e) => (e.target.checked ? set({ kind: 'nextToBoss', unit: id }) : clear(`nextToBoss:${id}`))} />
                            Next to the boss
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={!!findConstraint(list, `highGround:${id}`, 'highGround')} onChange={(e) => (e.target.checked ? set({ kind: 'highGround', unit: id }) : clear(`highGround:${id}`))} />
                            On high ground
                        </label>
                    </details>
                );
            })}

            <PairRule placed={placed} onAdd={set} />

            {list.length > 0 && (
                <>
                    <h3>Rules in force</h3>
                    <ul className="rule-list">
                        {list.map((c) => (
                            <li key={constraintKey(c)}>
                                {'unit' in c && <img className="unit-chip" src={unitIconUrl(c.unit)} alt="" style={{ borderColor: UNITS[c.unit].color }} />}
                                <span>{describeConstraint(c)}</span>
                                <button type="button" className="x" aria-label="Remove this rule" title="Remove this rule" onClick={() => clear(constraintKey(c))}>
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                    {clashes.map((m) => (
                        <p key={m} className="problem">
                            These rules clash: {m}.
                        </p>
                    ))}
                </>
            )}
        </section>
    );
}

/** "[A] attacks before [B]" and "[A] is next to [B] when attacking": the rules between two characters. */
function PairRule({ placed, onAdd }: { placed: UnitId[]; onAdd: (c: Constraint) => void }) {
    const [what, setWhat] = useState<'before' | 'adjacent'>('adjacent');
    const [a, setA] = useState<UnitId>(placed[0] ?? 'abaddon');
    const [b, setB] = useState<UnitId | 'zkar'>('zkar');
    if (placed.length < 2) return null;
    const first = placed.includes(a) ? a : placed[0];
    const second = b === 'zkar' ? (what === 'adjacent' ? 'zkar' : placed.find((u) => u !== first)!) : b === first ? placed.find((u) => u !== first)! : b;
    return (
        <div className="rule-add">
            <span className="muted">Add a rule:</span>
            <select value={first} onChange={(e) => setA(e.target.value as UnitId)} aria-label="First character">
                {placed.map((u) => (
                    <option key={u} value={u}>
                        {UNITS[u].name}
                    </option>
                ))}
            </select>
            <select value={what} onChange={(e) => setWhat(e.target.value as 'before' | 'adjacent')} aria-label="Kind of rule">
                <option value="adjacent">is next to … when attacking</option>
                <option value="before">attacks before …</option>
            </select>
            <select value={second} onChange={(e) => setB(e.target.value as UnitId | 'zkar')} aria-label="Second character">
                {what === 'adjacent' && <option value="zkar">Z’kar</option>}
                {placed
                    .filter((u) => u !== first)
                    .map((u) => (
                        <option key={u} value={u}>
                            {UNITS[u].name}
                        </option>
                    ))}
            </select>
            <button type="button" onClick={() => onAdd(what === 'before' ? { kind: 'before', unit: first, other: second as UnitId } : { kind: 'adjacent', unit: first, other: second })}>
                Add
            </button>
        </div>
    );
}
