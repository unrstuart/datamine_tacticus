import * as fs from 'fs';

export interface OperationObjective {
    objectiveType: string;
    objectiveTarget: string;
}

export interface IOperation {
    id: string;
    type: string;
    name: string;
    alliance?: string;
    rarity: string;
    conditionBoardMinLevel: number;
    conditionBoardMaxLevel?: number;
    weight: number;
    participantsMin: number;
    participantsMax: number;
    objectivesMin: number;
    objectivesMax: number;
    objectives: OperationObjective[];
    xpPercentage: number;
    baseRewards: string[];
    bonusRewards: string[];
    icon: string;
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

export interface ExtractOperationsParams {
    gameconfigPath: string;
    i2Path: string;
}

export function extractOperations({ gameconfigPath, i2Path }: ExtractOperationsParams): IOperation[] {
    const rawData = fs.readFileSync(gameconfigPath, 'utf-8');
    const data = JSON.parse(rawData);

    const i2Terms = loadI2Terms(i2Path);

    const generation: any[] = data.clientGameConfig.expeditions.generation;

    return generation.map((entry: any): IOperation => {
        const { locaKey, ...rest } = entry;
        const nameKey = `Expeditions/Types/${locaKey}`;
        const name = i2Terms.get(nameKey);

        if (!name) console.error(`WARNING: missing name for operation "${entry.id}" (key: ${nameKey})`);

        return {
            ...rest,
            name: name ?? '',
        };
    });
}
