import { useState } from 'react';
import { BoardData } from '../core/board';
import { EnemyArmor } from '../core/enemies';
import { Roster } from '../core/roster';
import { Setup } from '../core/setup';
import { SearchMode } from '../solver/options';
import { StoredPlan } from '../solver/search';
import { describeAction, describeGroup, describeReport, fmt } from './describe';
import { useSolver } from './useSolver';

const count = (n: bigint | number): string => n.toLocaleString();
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

function PlanView({ plan, index }: { plan: StoredPlan; index: number }) {
    return (
        <details className="plan" open={index === 0}>
            <summary>
                Plan {index + 1}: {fmt(plan.total)} damage to the boss, {plan.actions.length} actions
                {plan.undesirable > 0 ? `, ${plan.undesirable} on an undesirable hex` : ''}
            </summary>
            <ol>
                {plan.actions.map((a, i) => (
                    <li key={i}>{describeAction(a)}</li>
                ))}
            </ol>
            <h4>The damage, attack by attack</h4>
            <ul>
                {plan.reports.map((r, i) => (
                    <li key={i}>
                        {describeReport(r)}
                        {r.groups.length > 0 && (
                            <ul className="groups">
                                {r.groups.map((g, j) => (
                                    <li key={j}>{describeGroup(g)}</li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>
            {plan.penalties.length > 0 && <p className="hint">Penalties: {plan.penalties.map((p) => `${p.reason === 'undesirable' ? 'ends on an undesirable hex' : 'Neurothrope next to an enemy'} -${fmt(p.points)}`).join(', ')}</p>}
        </details>
    );
}

/** Starts and stops the search and shows how it is going, then the best plans found so far. */
export function SolverPanel({ board, setup, roster, armor }: { board: BoardData; setup: Setup; roster: Roster; armor: EnemyArmor }) {
    const { state, start, stop } = useSolver();
    const [mode, setMode] = useState<SearchMode>('local');
    const p = state.progress;
    const ratio = p && p.planned > 0n ? Number(p.searched) / Number(p.planned) : 0;
    return (
        <section className="solver">
            <div className="solver-head">
                <h2>Find the best plans</h2>
                {state.running ? (
                    <button type="button" className="tool active" onClick={stop}>
                        Stop
                    </button>
                ) : (
                    <button type="button" className="tool" onClick={() => start(board, setup, roster, armor, mode)}>
                        Search
                    </button>
                )}
                {!state.running && (
                    <select value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} aria-label="Search mode">
                        <option value="local">Quick: local search</option>
                        <option value="exhaustive">Exhaustive: slow, complete</option>
                    </select>
                )}
                {state.running && <span className="spinner" aria-label="searching" />}
            </div>

            {p && (
                <dl className="stats">
                    <div>
                        <dt>{state.mode === 'exhaustive' ? 'Sequences searched / planned' : 'Plans tried / budget'}</dt>
                        <dd>
                            {count(p.searched)} / {count(p.planned)}
                        </dd>
                    </div>
                    <div>
                        <dt>Best plans kept</dt>
                        <dd>
                            {count(p.bestRuns)} <span className="muted">of 10</span>
                        </dd>
                    </div>
                    <div>
                        <dt>Most damage so far</dt>
                        <dd>{p.bestScore !== undefined ? fmt(p.bestScore) : '-'}</dd>
                    </div>
                    <div>
                        <dt>Complete plans evaluated</dt>
                        <dd>{count(p.complete)}</dd>
                    </div>
                    <div>
                        <dt>Time</dt>
                        <dd>{seconds(state.elapsed)}</dd>
                    </div>
                </dl>
            )}
            {p && (
                <div className="meter" title={`${(ratio * 100).toFixed(4)}% of the sequences planned so far have been searched. The planned count keeps growing while the search runs.`}>
                    <div style={{ width: `${Math.max(0.5, ratio * 100)}%` }} />
                </div>
            )}
            {p && (
                <p className="hint">
                    {state.mode === 'exhaustive'
                        ? state.running
                            ? 'Searching every sequence. The planned count grows as the search finds more of them.'
                            : p.status === 'done'
                              ? 'Finished: every sequence was searched.'
                              : 'Stopped before it finished: these are the best plans among the sequences searched so far.'
                        : state.running
                          ? 'Improving plans by trying small changes to them. It finds very good plans quickly, but cannot prove none is better.'
                          : 'Local search finished: these are the best plans it found. A better one may exist (the exhaustive mode can prove otherwise, slowly).'}
                    {!state.shared && state.running ? ' (This page is not cross-origin isolated, so the counters update from messages.)' : ''}
                </p>
            )}

            {state.plans.length > 0 && (
                <>
                    <h3>Best plans so far</h3>
                    {state.plans.map((plan, i) => (
                        <PlanView key={plan.signature} plan={plan} index={i} />
                    ))}
                </>
            )}
        </section>
    );
}
