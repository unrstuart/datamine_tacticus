import * as fs from 'fs';

export interface IMoW {
    id: string;
    name: string;
    faction: string;
    alliance: string;
    abilities: string[];
    mythicAbilities: string[];
}

export interface ExtractMowsParams {
    gameconfigPath: string;
}

export function extractMows({ gameconfigPath }: ExtractMowsParams): IMoW[] {
    const rawData = fs.readFileSync(gameconfigPath, 'utf-8');
    const data = JSON.parse(rawData);

    const rawUnits: Record<string, any> = data.clientGameConfig.units.lineup;

    return Object.entries(rawUnits)
        .filter(([, unit]: [string, any]) => (unit.traits as string[])?.includes('MachineOfWar'))
        .map(([id, unit]: [string, any]) => ({
            id,
            name: unit.name,
            faction: unit.FactionId,
            alliance: unit.GrandAllianceId,
            abilities: unit.activeAbilities ?? [],
            mythicAbilities: unit.mythicAbilities ?? [],
        }));
}
