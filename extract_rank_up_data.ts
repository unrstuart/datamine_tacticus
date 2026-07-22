import * as fs from 'fs';

// Roman-numeral rank labels, indexed positionally against a unit's `upgrades` array.
// Distinct from extract_campaign_data.ts's numeric "Stone 1".."Adamantine 3" labels -
// these are two separate rank-label vocabularies used in different contexts.
const RANKS = [
    'Stone I', 'Stone II', 'Stone III',
    'Iron I', 'Iron II', 'Iron III',
    'Bronze I', 'Bronze II', 'Bronze III',
    'Silver I', 'Silver II', 'Silver III',
    'Gold I', 'Gold II', 'Gold III',
    'Diamond I', 'Diamond II', 'Diamond III',
    'Adamantine I', 'Adamantine II', 'Adamantine III',
];

export interface ExtractRankUpDataParams {
    gameconfigPath: string;
}

// unitId -> rankLabel -> [topRowHealth, bottomRowHealth, topRowDamage, bottomRowDamage, topRowArmor, bottomRowArmor]
export type RankUpData = Record<string, Record<string, string[]>>;

export function extractRankUpData({ gameconfigPath }: ExtractRankUpDataParams): RankUpData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const lineup: Record<string, any> = data.clientGameConfig.units.lineup;

    const ret: RankUpData = {};
    for (const [id, unit] of Object.entries<any>(lineup)) {
        // Machines of War are a separate bucket in the C++ source (units().mows(), not
        // units().units()) even though they live in the same raw lineup - exclude them here too.
        if ((unit.traits as string[] | undefined)?.includes('MachineOfWar')) continue;

        const upgrades: string[][] | undefined = unit.upgrades;
        if (!upgrades) continue;

        const ranks: Record<string, string[]> = {};
        for (let i = 0; i < upgrades.length && i < RANKS.length; ++i) {
            ranks[RANKS[i]] = upgrades[i];
        }
        ret[id] = ranks;
    }

    return ret;
}
