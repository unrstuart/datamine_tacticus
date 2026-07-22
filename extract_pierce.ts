import * as fs from 'fs';

export interface ExtractPierceParams {
    gameconfigPath: string;
}

export function extractPierce({ gameconfigPath }: ExtractPierceParams): Record<string, number> {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));

    return Object.fromEntries(
        Object.entries(data.clientGameConfig.units.damageProfiles).map(([id, tuple]: [string, any]) => [
            id,
            tuple['PiercingRatio'],
        ])
    );
}
