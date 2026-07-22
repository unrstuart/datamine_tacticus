import * as fs from 'fs';
import { flattenUnitSets } from './extract_guild_boss';
import { loadSpriteFilesByLowercaseName, resolveSpriteCaseInsensitive } from './sprite_lookup';

interface I2Term {
    Term: string;
    Languages: string[];
}

// Builds ability id -> display name from Abilities/<id>_Name terms.
function loadAbilityNames(i2Path: string): Map<string, string> {
    const data = JSON.parse(fs.readFileSync(i2Path, 'utf-8'));
    const terms: I2Term[] = data.mSource.mTerms;
    const map = new Map<string, string>();
    for (const term of terms) {
        if (!term.Term.startsWith('Abilities/') || !term.Term.endsWith('_Name')) continue;
        if (!term.Languages || term.Languages.length === 0) continue;
        const abilityId = term.Term.slice('Abilities/'.length, -'_Name'.length);
        map.set(abilityId, term.Languages[0]);
    }
    return map;
}

// Same case-mismatch quirk as sprite filenames below (e.g. guild-boss relicAbilities id
// "MawClawsofThyrax" vs. the I2Languages term "MawClawsOfThyrax") -- fall back to a
// case-insensitive match when the exact id isn't found.
function lookupAbilityName(names: Map<string, string>, id: string): string | undefined {
    const exact = names.get(id);
    if (exact !== undefined) return exact;
    const lower = id.toLowerCase();
    for (const [key, value] of names) {
        if (key.toLowerCase() === lower) return value;
    }
    return undefined;
}

function collectAbilityIds(gameConfig: any, globalConfig?: any): Set<string> {
    const ids = new Set<string>();
    const addAbilities = (unit: any) => {
        for (const id of unit.activeAbilities ?? []) ids.add(id);
        for (const id of unit.passiveAbilities ?? []) ids.add(id);
        for (const id of unit.relicAbilities ?? []) ids.add(id);
    };

    const lineup: Record<string, any> = gameConfig.clientGameConfig.units.lineup;
    for (const unit of Object.values<any>(lineup)) {
        if ((unit.traits as string[]).includes('MachineOfWar')) continue;
        addAbilities(unit);
    }

    const npcs: Record<string, any> = gameConfig.clientGameConfig.units.npc;
    for (const npc of Object.values<any>(npcs)) addAbilities(npc);

    // Guild-boss units (bosses/minibosses/minions) live in a separate GlobalGameConfig
    // structure and aren't part of clientGameConfig.units at all.
    if (globalConfig?.guildBoss?.unitSets) {
        const guildBossUnits = flattenUnitSets(globalConfig.guildBoss.unitSets);
        for (const unit of Object.values<any>(guildBossUnits)) addAbilities(unit);
    }

    return ids;
}

// Guild-boss-exclusive ability ids with no ability2 icon of their own - each reuses another
// ability's existing icon. The "Reworked" ones got a new id but reuse the original ability's art;
// DeathwingKnight (the passive on the "Npc3DarkaTerminator" unit) is the same ability as
// Baraqiel's "Deathwing" (the "MiniBoss1DarkaTerminator" unit), just under a different id.
const ICON_OVERRIDES: Record<string, string> = {
    TheWrathOfKhaineUnleashedReworked: 'ui_icon_ability2_TheWrathOfKhaineUnleashed.png',
    BloodRunsAngerRisesWarCallsReworked: 'ui_icon_ability2_BloodRunsAngerRisesWarCalls.png',
    DeathwingKnight: 'ui_icon_ability2_Deathwing.png',
};

export interface ExtractAbilityIconsParams {
    gameconfigPath: string;
    i2Path: string;
    assetsDir: string;
    globalConfigPath?: string;
}

const ICON_INTERFACE = `interface IconData {
    file: string;
    name: string;
}`;

export function extractAbilityIcons({ gameconfigPath, i2Path, assetsDir, globalConfigPath }: ExtractAbilityIconsParams): string {
    const gameConfig = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const globalConfig = globalConfigPath ? JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8')) : undefined;
    const abilityNames = loadAbilityNames(i2Path);
    const abilityIds = [...collectAbilityIds(gameConfig, globalConfig)].sort();
    const spriteFiles = loadSpriteFilesByLowercaseName(`${assetsDir}/sprites`);

    const iconFiles = new Map<string, string>(); // id -> "<subfolder>/<file>" under snowprint_assets/
    for (const id of abilityIds) {
        const overrideSpriteFileName = ICON_OVERRIDES[id];
        if (overrideSpriteFileName) {
            const file = resolveSpriteCaseInsensitive(spriteFiles, overrideSpriteFileName);
            if (file) {
                iconFiles.set(id, `abilities/${file}`);
            } else {
                console.error(`Icon override for ability ${id} points at missing sprite ${overrideSpriteFileName}`);
            }
            continue;
        }
        const file = resolveSpriteCaseInsensitive(spriteFiles, `ui_icon_ability2_${id}.png`);
        if (file) {
            iconFiles.set(id, `abilities/${file}`);
        } else {
            console.error(`No icon found for ability ${id}`);
        }
    }

    const lines: string[] = [];
    lines.push('/* eslint-disable import-x/no-internal-modules */');
    for (const [id, relPath] of iconFiles) {
        lines.push(`import ${id}Icon from '@/assets/images/snowprint_assets/${relPath}';`);
    }
    lines.push('');
    lines.push(ICON_INTERFACE);
    lines.push('');
    lines.push('export const abilityIcons: Record<string, IconData> = {');

    const entries: string[] = [];
    for (const [id] of iconFiles) {
        const name = lookupAbilityName(abilityNames, id);
        if (name === undefined) {
            console.error(`No ability name found for ability ${id}, skipping.`);
            continue;
        }
        entries.push(`  ${id}: { file: ${id}Icon, name: ${JSON.stringify(name)} }`);
    }
    lines.push(entries.join(',\n'));

    lines.push('};');
    return lines.join('\n') + '\n';
}
