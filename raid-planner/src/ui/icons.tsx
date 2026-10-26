import { RARITIES, Rarity, STAR_NAMES } from '../core/roster';

// The game's own icons, extracted into public/icons by extract_raid_units.ts.

const icon = (path: string): string => `${import.meta.env.BASE_URL}icons/${path}`;

export const rarityIconUrl = (r: Rarity): string => icon(`rarity/${r}.png`);
/** `rank` is the planner's index: Stone I = 1 ... Adamantine II = 20. */
export const rankIconUrl = (rank: number): string => icon(`rank/${rank}.png`);
export const abilityIconUrl = (id: string): string => icon(`ability/${id}.png`);

/**
 * What a star level looks like: 1-5 gold stars, 6-10 red (the red ones replacing the gold, one to five), 11-13 blue, and 14 the
 * Mythic wings. Level 0 is no stars.
 */
export function starIcons(level: number): Array<{ colour: 'gold' | 'red' | 'blue' | 'wings'; count: number }> {
    if (level <= 0) return [];
    if (level <= 5) return [{ colour: 'gold', count: level }];
    if (level <= 10) return [{ colour: 'red', count: level - 5 }];
    if (level <= 13) return [{ colour: 'blue', count: level - 10 }];
    return [{ colour: 'wings', count: 1 }];
}

export function Stars({ level }: { level: number }) {
    const groups = starIcons(level);
    return (
        <span className="stars-row" title={STAR_NAMES[level]}>
            {groups.length === 0 && <span className="muted">none</span>}
            {groups.flatMap(({ colour, count }) => Array.from({ length: count }, (_, i) => <img key={`${colour}${i}`} className={colour === 'wings' ? 'star wings' : 'star'} src={icon(`star/${colour}.png`)} alt="" />))}
        </span>
    );
}

interface ChoiceProps {
    selected: boolean;
    title: string;
    onClick: () => void;
    children: React.ReactNode;
}

/** One icon button in a row of choices: the selected one is lit, the others dimmed. */
export function Choice({ selected, title, onClick, children }: ChoiceProps) {
    return (
        <button type="button" className={`choice${selected ? ' selected' : ''}`} title={title} aria-label={title} aria-pressed={selected} onClick={onClick}>
            {children}
        </button>
    );
}

export const RarityChoices = ({ value, onChange }: { value: Rarity; onChange: (r: Rarity) => void }) => (
    <div className="choices">
        {RARITIES.map((r) => (
            <Choice key={r} selected={r === value} title={r} onClick={() => onChange(r)}>
                <img className="rarity" src={rarityIconUrl(r)} alt="" />
            </Choice>
        ))}
    </div>
);
