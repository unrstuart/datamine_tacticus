import { EnemyArmor, EnemyRow, RaidTier, normalizeSelection, rowAt } from '../core/enemies';
import { RANK_NAMES } from '../core/roster';
import { AbaddonExtraAttack, Effect, EFFECTS, MAX_ABADDON_STACKS, MAX_NEURO_STACKS, Setup, UNIT_IDS } from '../core/setup';
import { Tool } from '../core/tools';
import { EFFECT_LABELS, EffectIcon } from './EffectGlyph';
import { ConstraintsPanel } from './ConstraintsPanel';
import { Choice, Stars, rankIconUrl, rarityIconUrl } from './icons';
import { UNITS, unitIconUrl } from './units';

interface SidebarProps {
    tool: Tool;
    setTool: (tool: Tool) => void;
    setup: Setup;
    update: (patch: Partial<Setup>) => void;
    /** The boss's stat rows (one per raid level), the raid tiers to pick from, and the armor the selected tier gives it and its minions. */
    enemyRows: readonly EnemyRow[];
    tiers: readonly RaidTier[];
    armor: EnemyArmor;
    platformCount: number;
    onResetBoss: (platformIndex: number) => void;
    onClearAll: () => void;
}

const same = (a: Tool, b: Tool): boolean => JSON.stringify(a) === JSON.stringify(b);

export function Sidebar({ tool, setTool, setup, update, enemyRows, tiers, armor, platformCount, onResetBoss, onClearAll }: SidebarProps) {
    const button = (t: Tool, label: string, icon: React.ReactNode, hint?: string) => (
        <button key={label} type="button" className={`tool${same(tool, t) ? ' active' : ''}`} onClick={() => setTool(t)} title={hint}>
            <span className="tool-icon">{icon}</span>
            {label}
        </button>
    );
    const number = (label: string, value: number, onChange: (n: number) => void, min = 0, max = 99) => (
        <label className="field">
            {label}
            <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
    );
    const check = (label: string, value: boolean, onChange: (v: boolean) => void) => (
        <label className="check">
            <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
            {label}
        </label>
    );

    return (
        <aside>
            <section>
                <h2>Move</h2>
                {button(
                    { kind: 'move' },
                    'Drag boss or characters',
                    <span className="x-chip">{'\u2725'}</span>,
                    'Drag the boss or a character to where you want it. A boss follows the pointer by its centre, and a 3-hex boss turns to whichever hex corner you hold it over. Green = it fits, red = it does not.'
                )}
                {platformCount > 1 && (
                    <div className="row">
                        Boss starts at
                        {Array.from({ length: platformCount }, (_, i) => (
                            <button key={i} type="button" onClick={() => onResetBoss(i)}>
                                #{i + 1}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2>Enemies</h2>
                {button({ kind: 'minion' }, 'Minion', <span className="minion-chip">M</span>, 'Click or drag to place (or remove) minions')}
            </section>

            <section>
                <h2>Hex effects</h2>
                {EFFECTS.map((effect: Effect) => button({ kind: 'effect', effect }, EFFECT_LABELS[effect], <EffectIcon effect={effect} />, 'Click or drag. A hex holds one effect.'))}
                {button({ kind: 'undesirable' }, 'Undesirable', <span className="x-chip">✕</span>, 'Hexes the boss will strike next turn')}
                {button({ kind: 'clear' }, 'Clear hex', <span className="x-chip">⌫</span>, 'Removes whatever is on a hex, except the boss')}
            </section>

            <section>
                <h2>Characters</h2>
                <p className="hint">Pick one, then click a hex to place it. Drag a placed one to move it. Use Clear hex to take one off.</p>
                {UNIT_IDS.map((id) =>
                    button(
                        { kind: 'unit', unit: id },
                        `${UNITS[id].name}${setup.units[id] ? '' : ' (not placed)'}`,
                        <img className="unit-chip" src={unitIconUrl(id)} alt="" style={{ borderColor: UNITS[id].color }} />
                    )
                )}
            </section>

            <section>
                <h2>Pins</h2>
                <p className="hint">
                    Pick one, then click a hex to pin it there; click the same hex again to take the pin off. Plans must keep every pin. Pin a character on the hex it stands on to keep it from moving.
                </p>
                {UNIT_IDS.map((id) =>
                    button({ kind: 'pin', unit: id }, `Pin ${UNITS[id].name}`, <img className="unit-chip" src={unitIconUrl(id)} alt="" style={{ borderColor: UNITS[id].color }} />, 'The hex this character stands on when it attacks')
                )}
                {button({ kind: 'pin', unit: 'zkar' }, 'Pin Z’kar’s deployment', <img className="unit-chip" src={unitIconUrl('zkar')} alt="" style={{ borderColor: '#9be15d' }} />, 'The hex Z’kar is deployed on')}
            </section>

            <ConstraintsPanel setup={setup} update={update} />

            {enemyRows.length > 0 && tiers.length > 0 && (
                <section>
                    <h2>Raid tier</h2>
                    {(() => {
                        const chosen = normalizeSelection(tiers, setup.enemy);
                        const row = rowAt(enemyRows, chosen.level);
                        const rarities = [...new Set(tiers.map((t) => t.tier))].sort((a, b) => a - b);
                        return (
                            <>
                                {rarities.map((tier) => {
                                    const here = tiers.filter((t) => t.tier === tier);
                                    const rarity = rowAt(enemyRows, here[0].level)?.rarity;
                                    return (
                                        <div className="field-row" key={tier}>
                                            <span className="label">{rarity ? <img className="rarity" src={rarityIconUrl(rarity)} alt={here[0].label.replace(/ \d+$/, '')} title={here[0].label.replace(/ \d+$/, '')} /> : here[0].label.replace(/ \d+$/, '')}</span>
                                            <div className="choices">
                                                {here.map((t) => (
                                                    <Choice key={t.level} selected={t.level === chosen.level} title={t.label} onClick={() => update({ enemy: { level: t.level } })}>
                                                        <span className="tier-number">{t.set + 1}</span>
                                                    </Choice>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {row && (
                                    <div className="field-row">
                                        <span className="label">Boss</span>
                                        <div className="rank-pick">
                                            <img className="rarity" src={rarityIconUrl(row.rarity)} alt={row.rarity} />
                                            <Stars level={row.stars} />
                                            <img className="rank" src={rankIconUrl(row.rank)} alt="" />
                                            <span>{RANK_NAMES[row.rank]}</span>
                                        </div>
                                    </div>
                                )}
                                <p className="hint">
                                    {tiers.find((t) => t.level === chosen.level)?.label}: armor {armor.boss.toLocaleString()}, health {row?.health.toLocaleString()}. Minions: armor{' '}
                                    {armor.minion.toLocaleString()}.
                                </p>
                            </>
                        );
                    })()}
                </section>
            )}

            <section>
                <h2>Boss</h2>
                {number('Neuroparasite stacks', setup.neuroStacks, (n) => update({ neuroStacks: Math.min(MAX_NEURO_STACKS, Math.max(0, n || 0)) }), 0, MAX_NEURO_STACKS)}
            </section>

            <section>
                <h2>Abaddon</h2>
                {number('Passive stacks', setup.abaddonStacks, (n) => update({ abaddonStacks: Math.min(MAX_ABADDON_STACKS, Math.max(0, n || 0)) }), 0, MAX_ABADDON_STACKS)}
                <label className="field">
                    Extra melee attack
                    <select value={setup.abaddonExtraAttack} onChange={(e) => update({ abaddonExtraAttack: e.target.value as AbaddonExtraAttack })}>
                        <option value="available">His active is available</option>
                        <option value="on">Already active</option>
                        <option value="off">Won't use it</option>
                    </select>
                </label>
            </section>

            <section>
                <h2>Options</h2>
                {check('Ahriman’s active is available', setup.ahrimanActiveAvailable, (v) => update({ ahrimanActiveAvailable: v }))}
                {check('Neurothrope’s active is available', setup.neuroActiveAvailable, (v) => update({ neuroActiveAvailable: v }))}
                {check('Abaddon survives an undesirable hex', setup.abaddonSurvivesUndesirable, (v) => update({ abaddonSurvivesUndesirable: v }))}
                {number('Damage lost per unit on an undesirable hex', setup.undesirablePenalty, (n) => update({ undesirablePenalty: n || 0 }))}
                {number('Damage lost if Neurothrope ends next to an enemy', setup.neuroAdjacentPenalty, (n) => update({ neuroAdjacentPenalty: n || 0 }))}
            </section>

            <button type="button" className="danger" onClick={onClearAll}>
                Clear everything on this map
            </button>
        </aside>
    );
}
