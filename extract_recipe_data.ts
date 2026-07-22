import * as fs from 'fs';
import { loadSpriteFilesByLowercaseName, resolveSpriteCaseInsensitive } from './sprite_lookup';

// Snowprint has two "Transdimensional Sanctum" entries: one craftable, one not. We ignore
// the uncraftable one so it doesn't show up as a duplicate.
const SKIPPED_UPGRADE_IDS = new Set(['upgArmL008']);

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

function convertStat(statType: string): string {
    if (statType === 'fixedArmor') return 'Armour';
    if (statType === 'dmg') return 'Damage';
    if (statType === 'hp') return 'Health';
    console.error('Unknown stat type: ', statType);
    return 'unknown';
}

export interface RecipeIngredient {
    material: string;
    count: number;
}

export interface RecipeEntry {
    material: string;
    snowprintId: string;
    rarity: string;
    stat: string;
    icon: string;
    craftable: boolean;
    recipe?: RecipeIngredient[];
}

export interface ExtractRecipeDataParams {
    gameconfigPath: string;
    i2Path: string;
    assetsDir?: string;
}

export function extractRecipeData({ gameconfigPath, i2Path, assetsDir }: ExtractRecipeDataParams): Record<string, RecipeEntry> {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const i2Terms = loadI2Terms(i2Path);
    const upgrades: Record<string, any> = data.clientGameConfig.upgrades;
    const spriteFiles = assetsDir ? loadSpriteFilesByLowercaseName(`${assetsDir}/sprites`) : undefined;

    const ret: Record<string, RecipeEntry> = {};
    for (const [id, upgrade] of Object.entries<any>(upgrades)) {
        if (SKIPPED_UPGRADE_IDS.has(id)) continue;

        const material = i2Terms.get(`Upgrades/${id}_name`) ?? upgrade.name ?? '';
        const craftable = 'crafting' in upgrade;

        const wanted = `ui_icon_upgrade_${id}.png`;
        let iconFile = wanted;
        if (spriteFiles) {
            const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
            if (!file) {
                console.error(`Couldn't find icon for upgrade "${id}" - expected it to be '${wanted}'.`);
            }
            iconFile = file ?? wanted;
        }

        const entry: RecipeEntry = {
            material,
            snowprintId: id,
            rarity: upgrade.rarity,
            stat: convertStat(upgrade.statType),
            icon: `snowprint_assets/upgrade_materials/${iconFile}`,
            craftable,
        };
        if (craftable) {
            entry.recipe = (upgrade.crafting as any[]).map((ingredient) => ({
                material: ingredient.id,
                count: ingredient.amount,
            }));
        }

        ret[id] = entry;
    }

    return ret;
}
