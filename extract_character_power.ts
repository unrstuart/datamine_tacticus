import * as fs from 'fs';

// Trims a full GameConfig down to just the pieces tacops' src/characters/character-power.ts
// needs, so that app can bundle a few small JSON files instead of an ~18MB dump. This is
// version-sensitive by design - character-power.ts throws if the response contains a unit the
// bundled config doesn't know about - so it needs re-extracting whenever a new GameConfig ships.
// Ported from tacops/scripts/extract-character-power-config.ts; tacops now gets its copies by
// running this extractor with --output-dir pointed at its src/assets/ (see tacops' README).

export interface CharacterPowerData {
    units: Record<string, unknown>;
    items: Record<string, unknown>;
    upgrades: Record<string, unknown>;
}

export interface ExtractCharacterPowerParams {
    gameconfigPath: string;
}

// heroProgressionStepsMoW carries Machines of War progression, needed alongside the
// character-only heroProgressionStepsPerUnit table.
const UNIT_KEYS = [
    'lineup',
    'heroProgressionSteps',
    'heroProgressionStepsPerUnit',
    'heroProgressionStepsMoW',
    'damageProfileModifiers',
    'abilityPowerCurve',
    'abilityPowerModifiers',
    'traitPowerModifiers',
];

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
    if (!isObject(value)) {
        throw new Error(`${field} must be an object`);
    }
    return value;
}

export function extractCharacterPower({ gameconfigPath }: ExtractCharacterPowerParams): CharacterPowerData {
    const raw = fs.readFileSync(gameconfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const gameConfig = requireObject(parsed.clientGameConfig, 'GameConfig.clientGameConfig');

    const units = requireObject(gameConfig.units, 'GameConfig.units');
    const trimmedUnits: Record<string, unknown> = {};
    for (const key of UNIT_KEYS) {
        if (!(key in units)) {
            throw new Error(`GameConfig.units.${key} is missing - GameConfig's shape may have changed`);
        }
        trimmedUnits[key] = units[key];
    }

    const items = requireObject(gameConfig.items, 'GameConfig.items');
    const upgrades = requireObject(gameConfig.upgrades, 'GameConfig.upgrades');

    return { units: trimmedUnits, items, upgrades };
}
