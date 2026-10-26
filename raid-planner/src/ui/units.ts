import { UnitId } from '../core/setup';

export interface UnitInfo {
    id: UnitId | 'zkar';
    name: string;
    /** Ring colour around the token. */
    color: string;
}

export const UNITS: Record<UnitId, UnitInfo> = {
    abaddon: { id: 'abaddon', name: 'Abaddon', color: '#e5484d' },
    ahriman: { id: 'ahriman', name: 'Ahriman', color: '#f5a524' },
    abraxas: { id: 'abraxas', name: 'Abraxas', color: '#a78bfa' },
    archimatos: { id: 'archimatos', name: 'Archimatos', color: '#46c28b' },
    neurothrope: { id: 'neurothrope', name: 'Neurothrope', color: '#5aa0ff' },
};

export const unitIconUrl = (id: string): string => `${import.meta.env.BASE_URL}units/${id}.png`;
