import {
    MAX_RELIC_LEVEL,
    RANK_NAMES,
    RARITIES,
    ROSTER_ORDER,
    ROSTER_UNITS,
    Rarity,
    Roster,
    STAR_NAMES,
    UnitSpec,
    maxedSpec,
    optionsFor,
    withAbilityLevel,
    withRank,
    withRarity,
    withRelic,
    withStars,
} from '../core/roster';
import { ActorName } from '../engine/units';
import { unitIconUrl } from './units';

interface RosterPanelProps {
    roster: Roster;
    setUnit: (unit: ActorName, spec: UnitSpec) => void;
    reset: () => void;
}

function UnitCard({ unit, spec, setUnit }: { unit: ActorName; spec: UnitSpec; setUnit: (unit: ActorName, spec: UnitSpec) => void }) {
    const info = ROSTER_UNITS[unit];
    const options = optionsFor(spec.rarity);
    const relic = info.relic;
    const change = (next: UnitSpec) => setUnit(unit, next);
    return (
        <article className="unit-card">
            <header>
                <img src={unitIconUrl(unit)} alt="" className="unit-chip big" />
                <h3>{info.name}</h3>
                <button type="button" className="small" onClick={() => change(maxedSpec(unit))} title="Mythic, wings, Adamantine II, abilities 60, relic 10">
                    Max
                </button>
            </header>

            <div className="grid">
                <label>
                    Rarity
                    <select value={spec.rarity} onChange={(e) => change(withRarity(unit, spec, e.target.value as Rarity))}>
                        {RARITIES.map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Stars
                    <select value={spec.stars} onChange={(e) => change(withStars(unit, spec, Number(e.target.value)))}>
                        {options.stars.map((s) => (
                            <option key={s} value={s}>
                                {STAR_NAMES[s]}
                            </option>
                        ))}
                    </select>
                </label>

                {info.hasRank && (
                    <label>
                        Rank
                        <select value={spec.rank} onChange={(e) => change(withRank(unit, spec, Number(e.target.value)))}>
                            {options.ranks.map((r) => (
                                <option key={r} value={r}>
                                    {RANK_NAMES[r]}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                {info.abilities.map((ability, i) => (
                    <label key={ability.id}>
                        {ability.name}
                        {ability.kind !== 'ability' && <span className="muted"> ({ability.kind})</span>}
                        <span className="level">
                            <input type="number" min={1} max={options.maxAbilityLevel} value={spec.abilityLevels[i]} onChange={(e) => change(withAbilityLevel(unit, spec, i, Number(e.target.value)))} />
                            <span className="muted">/ {options.maxAbilityLevel}</span>
                        </span>
                    </label>
                ))}
            </div>

            {relic ? (
                <div className="relic">
                    <label className="check">
                        <input type="checkbox" checked={spec.relicLevel !== undefined} onChange={(e) => change(withRelic(unit, spec, e.target.checked ? MAX_RELIC_LEVEL : undefined))} />
                        {relic.name}
                    </label>
                    {spec.relicLevel !== undefined && (
                        <span className="level">
                            Level
                            <input type="number" min={1} max={MAX_RELIC_LEVEL} value={spec.relicLevel} onChange={(e) => change(withRelic(unit, spec, Number(e.target.value)))} />
                            <span className="muted">/ {MAX_RELIC_LEVEL}</span>
                        </span>
                    )}
                </div>
            ) : (
                <p className="hint">{unit === 'zkar' ? 'A machine of war: no rank and no relic.' : 'No relic that matters for this team.'}</p>
            )}
        </article>
    );
}

/** The six units' stats, edited by hand. Each rarity limits the stars, ranks and ability levels it offers. */
export function RosterPanel({ roster, setUnit, reset }: RosterPanelProps) {
    return (
        <section className="roster-panel">
            <div className="roster-head">
                <h2>Characters</h2>
                <button type="button" className="small" onClick={reset}>
                    Max everyone
                </button>
            </div>
            <p className="hint">Everyone starts maxed out. Changing a unit's rarity pulls its stars, rank and ability levels into what that rarity allows.</p>
            <div className="unit-cards">
                {ROSTER_ORDER.map((unit) => (
                    <UnitCard key={unit} unit={unit} spec={roster[unit]} setUnit={setUnit} />
                ))}
            </div>
        </section>
    );
}
