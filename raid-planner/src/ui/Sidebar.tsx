import { Effect, EFFECTS, Setup, UNIT_IDS, MAX_NEURO_STACKS } from '../core/setup';
import { Tool } from '../core/tools';
import { EFFECT_LABELS, EffectIcon } from './EffectGlyph';
import { UNITS, unitIconUrl } from './units';

interface SidebarProps {
    tool: Tool;
    setTool: (tool: Tool) => void;
    setup: Setup;
    update: (patch: Partial<Setup>) => void;
    platformCount: number;
    onResetBoss: (platformIndex: number) => void;
    onClearAll: () => void;
}

const same = (a: Tool, b: Tool): boolean => JSON.stringify(a) === JSON.stringify(b);

export function Sidebar({ tool, setTool, setup, update, platformCount, onResetBoss, onClearAll }: SidebarProps) {
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
                <h2>Boss</h2>
                {number('Neuroparasite stacks', setup.neuroStacks, (n) => update({ neuroStacks: Math.min(MAX_NEURO_STACKS, Math.max(0, n || 0)) }), 0, MAX_NEURO_STACKS)}
            </section>

            <section>
                <h2>Options</h2>
                {check('Ahriman’s active is available', setup.ahrimanActiveAvailable, (v) => update({ ahrimanActiveAvailable: v }))}
                {check('Neurothrope’s active is available', setup.neuroActiveAvailable, (v) => update({ neuroActiveAvailable: v }))}
                {check('Abaddon survives an undesirable hex', setup.abaddonSurvivesUndesirable, (v) => update({ abaddonSurvivesUndesirable: v }))}
                {number('Penalty per unit on an undesirable hex', setup.undesirablePenalty, (n) => update({ undesirablePenalty: n || 0 }))}
                {number('Penalty for Neurothrope next to an enemy', setup.neuroAdjacentPenalty, (n) => update({ neuroAdjacentPenalty: n || 0 }))}
            </section>

            <button type="button" className="danger" onClick={onClearAll}>
                Clear everything on this map
            </button>
        </aside>
    );
}
