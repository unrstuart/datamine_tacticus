import * as fs from 'fs';

export type AttackRangeType = 'melee' | 'ranged';

interface IAbilityText {
    name: string;
    currentLevelDescription: string;
    nextLevelDescription: string;
}

export interface IAbility {
    id: string;
    text: IAbilityText;
    attackRangeType?: AttackRangeType;
    variables: Record<string, number[]>;
    constants: Record<string, string>;
    variablesAffectedByRarityBonus: string[];
}

interface I2Term {
    Term: string;
    Languages: string[];
}

function loadI2Terms(i2Path: string): Map<string, string> {
    const raw = fs.readFileSync(i2Path, 'utf-8');
    const data = JSON.parse(raw);
    const terms: I2Term[] = data.mSource.mTerms;
    const map = new Map<string, string>();
    for (const term of terms) {
        if (term.Languages && term.Languages.length > 0) {
            map.set(term.Term, term.Languages[0]);
        }
    }
    return map;
}

function fixMalformedStyle(text: string | undefined): string | undefined {
    if (!text) return text;
    text = text.split('<style=Buff_Infiltrate">').join('<style="Buff_Infiltrate">');
    text = text.split('<Style="Faction_Genestealers">').join('<style="Faction_Genestealers">');
    return text;
}

export interface ExtractAbilitiesParams {
    configPath: string;
    i2Path: string;
}

export function extractAbilities({ configPath, i2Path }: ExtractAbilitiesParams): IAbility[] {
    const rawData = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(rawData);

    const i2Terms = loadI2Terms(i2Path);

    const rawAbilities: Record<string, any> = data.clientGameConfig.units.abilities;

    return Object.entries(rawAbilities)
        .map(([id, ability]: [string, any]) => {
            const nameKey = `Abilities/${id}_Name`;
            const currentKey = `Abilities/${id}_CurrentLevelDescription`;
            const nextKey = `Abilities/${id}_NextLevelDescription`;

            const name = i2Terms.get(nameKey);
            const currentLevelDescription = i2Terms.get(currentKey);
            const nextLevelDescription = i2Terms.get(nextKey);

            if (!name) console.error(`WARNING: missing name for ability "${id}" (key: ${nameKey})`);
            if (!currentLevelDescription) console.error(`WARNING: missing currentLevelDescription for ability "${id}" (key: ${currentKey})`);
            if (!nextLevelDescription) console.error(`WARNING: missing nextLevelDescription for ability "${id}" (key: ${nextKey})`);

            return {
                id,
                text: {
                    name: name ?? '',
                    currentLevelDescription: fixMalformedStyle(currentLevelDescription) ?? '',
                    nextLevelDescription: nextLevelDescription ?? '',
                },
                attackRangeType:
                    ability.attackRangeType === 'Melee'
                        ? ('melee' as AttackRangeType)
                        : ability.attackRangeType === 'Ranged'
                          ? ('ranged' as AttackRangeType)
                          : undefined,
                variables: ability.variables,
                constants: ability.constants,
                variablesAffectedByRarityBonus: ability.variablesAffectedByRarityBonus,
            };
        })
        .filter(unit => !!unit);
}
