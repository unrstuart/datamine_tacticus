import { BoardData } from '../core/board';
import { Setup } from '../core/setup';
import { StoredPlan } from '../solver/search';
import { describeAction, describeReport } from './describe';
import { useSolver } from './useSolver';

const fmt = (n: bigint | number): string => n.toLocaleString();
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

function PlanView({ plan, index }: { plan: StoredPlan; index: number }) {
    const steps = plan.actions.length;
    return (
        <details className="plan">
            <summary>
                Plan {index + 1}: score {plan.total}, {steps} actions
            </summary>
            <ol>
                {plan.actions.map((a, i) => (
                    <li key={i}>{describeAction(a)}</li>
                ))}
            </ol>
            <h4>Buffs, attack by attack</h4>
            <ul>
                {plan.reports.map((r, i) => (
                    <li key={i}>{describeReport(r)}</li>
                ))}
            </ul>
            {plan.penalties.length > 0 && <p className="hint">Penalties: {plan.penalties.map((p) => `${p.reason === 'undesirable' ? 'ends on an undesirable hex' : 'Neurothrope next to an enemy'} -${p.points}`).join(', ')}</p>}
        </details>
    );
}

/** Starts and stops the search and shows how it is going, then the plans tied for the best score so far. */
export function SolverPanel({ board, setup }: { board: BoardData; setup: Setup }) {
    const { state, start, stop } = useSolver();
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
                    <button type="button" className="tool" onClick={() => start(board, setup)}>
                        Search
                    </button>
                )}
                {state.running && <span className="spinner" aria-label="searching" />}
            </div>

            {p && (
                <dl className="stats">
                    <div>
                        <dt>Sequences searched / planned</dt>
                        <dd>
                            {fmt(p.searched)} / {fmt(p.planned)}
                        </dd>
                    </div>
                    <div>
                        <dt>Best runs found</dt>
                        <dd>
                            {fmt(p.bestRuns)}
                            {p.bestScore !== undefined && <span className="muted"> (score {p.bestScore})</span>}
                        </dd>
                    </div>
                    <div>
                        <dt>Complete plans evaluated</dt>
                        <dd>{fmt(p.complete)}</dd>
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
                    {state.running
                        ? 'Searching every sequence. The planned count grows as the search finds more of them.'
                        : p.status === 'done'
                          ? 'Finished: every sequence was searched.'
                          : 'Stopped before it finished: these are the best plans among the sequences searched so far.'}
                    {!state.shared && state.running ? ' (This page is not cross-origin isolated, so the counters update from messages.)' : ''}
                </p>
            )}

            {state.plans.length > 0 && (
                <>
                    <h3>
                        Best plans so far ({state.plans.length}
                        {p && p.bestRuns > BigInt(state.plans.length) ? ` of ${fmt(p.bestRuns)}` : ''} shown)
                    </h3>
                    {state.plans.slice(0, 30).map((plan, i) => (
                        <PlanView key={plan.signature} plan={plan} index={i} />
                    ))}
                </>
            )}
        </section>
    );
}
