import { useCallback, useEffect, useState } from 'react';
import { Roster, UnitSpec, maxedRoster, sanitizeRoster } from '../core/roster';
import { ActorName } from '../engine/units';

const KEY = 'raid-planner:roster';

function load(): Roster {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? sanitizeRoster(JSON.parse(raw)) : maxedRoster();
    } catch {
        return maxedRoster();
    }
}

/** The six units' stats, remembered in this browser. Starts maxed out. */
export function useRoster(): { roster: Roster; setUnit: (unit: ActorName, spec: UnitSpec) => void; replace: (roster: Roster) => void; reset: () => void } {
    const [roster, setRoster] = useState<Roster>(load);

    useEffect(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(roster));
        } catch {
            // Private windows and blocked storage just don't remember.
        }
    }, [roster]);

    const setUnit = useCallback((unit: ActorName, spec: UnitSpec) => setRoster((r) => ({ ...r, [unit]: spec })), []);
    const replace = useCallback((next: Roster) => setRoster(next), []);
    const reset = useCallback(() => setRoster(maxedRoster()), []);
    return { roster, setUnit, replace, reset };
}
