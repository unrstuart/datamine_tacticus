import * as fs from 'fs';

export interface PlanetZoneEntry {
    planetId: string;
    name: string;
    zone: number;
}

export interface ExtractPlanetDataParams {
    globalConfigPath: string;
    i2Path: string;
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

// Zone assignment is tied to the crusade map's static visual layout, not season
// content, so this is treated as season-independent. If Snowprint ever reshuffles
// zone assignments this needs re-extracting - there's no live signal that would
// catch a stale mapping automatically.
export function extractPlanetData({ globalConfigPath, i2Path }: ExtractPlanetDataParams): PlanetZoneEntry[] {
    const data = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    const planets: any[] = data.crusade.planetSets.planet_set_01;
    const i2Terms = loadI2Terms(i2Path);

    return planets
        .filter((p) => p.type !== 'NotPlayable')
        .map((p): PlanetZoneEntry => {
            const name = i2Terms.get(p.locaKeyPlanetName);
            if (!name) console.error(`WARNING: missing name for planet "${p.planetId}" (key: ${p.locaKeyPlanetName})`);
            return { planetId: p.planetId, name: name ?? '', zone: p.zone };
        })
        .sort((a, b) => (a.planetId < b.planetId ? -1 : a.planetId > b.planetId ? 1 : 0));
}
