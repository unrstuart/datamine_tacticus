import { useState } from 'react';
import { rosterFromPlayer } from '../core/api';
import { MAX_RELIC_LEVEL, RANK_NAMES, ROSTER_ORDER, ROSTER_UNITS, Roster, UnitSpec, maxedSpec, optionsFor, withAbilityLevel, withRank, withRarity, withRelic, withStars } from '../core/roster';
import { characterStats, hasStats } from '../core/stats';
import { ActorName } from '../engine/units';
import { clearSavedKey, fetchPlayer, loadSavedKey, saveKey } from './account';
import { Choice, RarityChoices, Stars, abilityIconUrl, rankIconUrl } from './icons';
import { unitIconUrl } from './units';

interface RosterPanelProps {
    roster: Roster;
    setUnit: (unit: ActorName, spec: UnitSpec) => void;
    replace: (roster: Roster) => void;
    reset: () => void;
}

const fmt = (n: number): string => n.toLocaleString();

function UnitCard({ unit, spec, setUnit }: { unit: ActorName; spec: UnitSpec; setUnit: (unit: ActorName, spec: UnitSpec) => void }) {
    const info = ROSTER_UNITS[unit];
    const options = optionsFor(spec.rarity);
    const relic = info.relic;
    const stats = hasStats(unit) ? characterStats(unit, spec) : undefined;
    const change = (next: UnitSpec) => setUnit(unit, next);
    return (
        <article className="unit-card">
            <header>
                <img src={unitIconUrl(unit)} alt="" className="unit-chip big" />
                <div className="title">
                    <h3>{info.name}</h3>
                    <div className="damage" title="Damage stat at this rank and star level, before equipment, upgrades and relic">
                        {stats ? (
                            <>
                                <span className="muted">Damage</span> <strong>{fmt(stats.damage)}</strong>
                            </>
                        ) : (
                            <span className="muted">Damage comes from its abilities</span>
                        )}
                    </div>
                </div>
                <button type="button" className="small" onClick={() => change(maxedSpec(unit))} title="Mythic, wings, Adamantine II, abilities 60, relic 10">
                    Max
                </button>
            </header>

            <div className="field-row">
                <span className="label">Rarity</span>
                <RarityChoices value={spec.rarity} onChange={(r) => change(withRarity(unit, spec, r))} />
            </div>

            <div className="field-row">
                <span className="label">Stars</span>
                <div className="choices">
                    {options.stars.map((s) => (
                        <Choice key={s} selected={s === spec.stars} title={`Stars: ${s}`} onClick={() => change(withStars(unit, spec, s))}>
                            <Stars level={s} />
                        </Choice>
                    ))}
                </div>
            </div>

            {info.hasRank && (
                <div className="field-row">
                    <span className="label">Rank</span>
                    <div className="rank-pick">
                        <img className="rank" src={rankIconUrl(spec.rank)} alt="" />
                        <select value={spec.rank} onChange={(e) => change(withRank(unit, spec, Number(e.target.value)))}>
                            {/* Highest first: most players are near the top. */}
                            {[...options.ranks].reverse().map((r) => (
                                <option key={r} value={r}>
                                    {RANK_NAMES[r]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            <div className="abilities">
                {info.abilities.map((ability, i) => (
                    <label key={ability.id} className="ability">
                        <img src={abilityIconUrl(ability.id)} alt="" />
                        <span className="name">
                            {ability.name}
                            {ability.kind !== 'ability' && <span className="muted"> ({ability.kind})</span>}
                        </span>
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

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; message: string };

/** Fill the cards from the player's own account: paste a player API key and press Go. */
function AccountRead({ roster, replace }: { roster: Roster; replace: (roster: Roster) => void }) {
    // A key saved on this device fills the box and ticks "Remember".
    const [saved] = useState(() => loadSavedKey());
    const [key, setKey] = useState(saved ?? '');
    const [remember, setRemember] = useState(saved !== undefined);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    // Ticking "Remember" doesn't save anything by itself: pressing Go does. Unticking forgets the saved key at once.
    const toggleRemember = (on: boolean) => {
        setRemember(on);
        if (!on) clearSavedKey();
    };

    const go = async () => {
        if (remember && key.trim()) saveKey(key.trim());
        setStatus({ kind: 'loading' });
        const result = await fetchPlayer(key);
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.message });
            return;
        }
        const read = rosterFromPlayer(result.data, roster);
        if (read.found.length === 0) {
            setStatus({ kind: 'error', message: "That account doesn't have any of these units." });
            return;
        }
        replace(read.roster);
        const names = (units: ActorName[]) => units.map((u) => ROSTER_UNITS[u].name).join(', ');
        setStatus({
            kind: 'done',
            message: `Read ${read.playerName ? `${read.playerName}'s` : 'the'} account: updated ${names(read.found)}.${read.missing.length > 0 ? ` Not in the account, so left as they were: ${names(read.missing)}.` : ''}`,
        });
    };

    return (
        <div className="account">
            <label>
                Player API key
                <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="paste your key"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void go();
                    }}
                />
            </label>
            <button type="button" className="tool" onClick={() => void go()} disabled={status.kind === 'loading'}>
                {status.kind === 'loading' ? 'Reading...' : 'Go'}
            </button>
            <label className="check remember">
                <input type="checkbox" checked={remember} onChange={(e) => toggleRemember(e.target.checked)} />
                Remember API key
            </label>
            <p className="hint">
                Reads your units' rarity, stars, rank, ability levels and relics from the game. Get a key at{' '}
                <a href="https://api.tacticusgame.com" target="_blank" rel="noreferrer">
                    api.tacticusgame.com
                </a>
                ; it is sent only to read your account. It is saved on this device (unencrypted) only if Remember API key is ticked when you press Go.
            </p>
            {status.kind === 'error' && <p className="error">{status.message}</p>}
            {status.kind === 'done' && <p className="ok">{status.message}</p>}
        </div>
    );
}

/** The six units' stats: read from the player's account, or edited by hand. Each rarity limits the stars, ranks and ability levels it offers. */
export function RosterPanel({ roster, setUnit, replace, reset }: RosterPanelProps) {
    return (
        <section className="roster-panel">
            <div className="roster-head">
                <h2>Characters</h2>
                <button type="button" className="small" onClick={reset}>
                    Max everyone
                </button>
            </div>
            <AccountRead roster={roster} replace={replace} />
            <p className="hint">Everyone starts maxed out. Changing a unit's rarity pulls its stars, rank and ability levels into what that rarity allows.</p>
            <div className="unit-cards">
                {ROSTER_ORDER.map((unit) => (
                    <UnitCard key={unit} unit={unit} spec={roster[unit]} setUnit={setUnit} />
                ))}
            </div>
        </section>
    );
}
