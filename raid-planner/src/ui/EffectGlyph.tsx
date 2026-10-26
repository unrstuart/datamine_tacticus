import { Effect } from '../core/setup';

export const EFFECT_LABELS: Record<Effect, string> = {
    fire2: 'Fire (this round and next)',
    fire1: 'Fire (this round only)',
    despoiled: 'Despoiled ground',
    contaminated: 'Contaminated',
};

export const EFFECT_TINT: Record<Effect, string> = {
    fire2: 'rgba(255, 110, 0, 0.5)',
    fire1: 'rgba(255, 170, 60, 0.28)',
    despoiled: 'rgba(150, 60, 220, 0.45)',
    contaminated: 'rgba(80, 200, 70, 0.42)',
};

const FLAME = 'M0,-11 C3,-6 8,-3 7,3 C6,8 -6,8 -7,3 C-8,-2 -3,-4 0,-11 Z';
const FLAME_INNER = 'M0,-3 C2,0 4,1 3.5,4 C3,6.5 -3,6.5 -3.5,4 C-4,1 -1.5,0 0,-3 Z';

/** The mark drawn on a hex with an effect, centred on (0,0) in a roughly 24px box; scale it with `scale`. */
export function EffectGlyph({ effect, scale = 1 }: { effect: Effect; scale?: number }) {
    switch (effect) {
        case 'fire2':
            return (
                <g transform={`scale(${scale})`}>
                    <path d={FLAME} fill="#ff6a00" stroke="#7a2a00" strokeWidth="1" />
                    <path d={FLAME_INNER} fill="#ffd23f" />
                </g>
            );
        case 'fire1':
            return (
                <g transform={`scale(${scale * 0.8})`}>
                    <path d={FLAME} fill="none" stroke="#ffb454" strokeWidth="1.6" strokeDasharray="3 2" />
                </g>
            );
        case 'despoiled':
            return (
                <text className="glyph" textAnchor="middle" dominantBaseline="central" fontSize={16 * scale} fill="#e3c8ff">
                    ☠
                </text>
            );
        case 'contaminated':
            return (
                <text className="glyph" textAnchor="middle" dominantBaseline="central" fontSize={16 * scale} fill="#d8ffd0">
                    ☣
                </text>
            );
    }
}

/** A small standalone icon of an effect, for buttons and legends. */
export function EffectIcon({ effect }: { effect: Effect }) {
    return (
        <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden>
            <circle r="12" fill={EFFECT_TINT[effect]} />
            <EffectGlyph effect={effect} />
        </svg>
    );
}
