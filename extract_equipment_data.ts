import * as fs from 'fs';
import { loadSpriteFilesByLowercaseName, resolveSpriteCaseInsensitive } from './sprite_lookup';

// Rename table for level stats keys - ported verbatim from create_equipment_data.cc's EmitLevels.
// blockChance/blockChanceBonus/critChance/critChanceBonus/hp pass through unrenamed.
const STAT_RENAMES: Record<string, string> = {
    blockDmg: 'blockDamage',
    blockDmgBonus: 'blockDamageBonus',
    critDmg: 'critDamage',
    critDmgBonus: 'critDamageBonus',
    fixedArmor: 'armor',
};

function convertStats(rawStats: Record<string, number>): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [key, value] of Object.entries(rawStats)) {
        stats[STAT_RENAMES[key] ?? key] = value;
    }
    return stats;
}

export interface EquipmentLevel {
    goldCost: number;
    salvageCost: number;
    mythicSalvageCost: number;
    stats: Record<string, number>;
}

export interface EquipmentEntry {
    name: string;
    rarity: string;
    type: string;
    abilityId: string;
    isRelic: boolean;
    isUniqueRelic: boolean;
    allowedUnits: string[];
    allowedFactions: string[];
    levels: EquipmentLevel[];
}

export type EquipmentData = Record<string, EquipmentEntry>;

export interface ExtractEquipmentDataParams {
    gameconfigPath: string;
}

export function extractEquipmentData({ gameconfigPath }: ExtractEquipmentDataParams): EquipmentData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const items: Record<string, any> = data.clientGameConfig.items;

    const ret: EquipmentData = {};
    for (const [id, item] of Object.entries<any>(items)) {
        ret[id] = {
            name: item.name,
            rarity: item.rarity,
            type: item.itemType,
            abilityId: item.abilityId ?? '',
            isRelic: item.isRelic ?? false,
            isUniqueRelic: item.isUniqueRelic ?? false,
            allowedUnits: item.allowedUnits ?? [],
            allowedFactions: item.allowedFactions ?? [],
            levels: (item.levels as any[]).map((level) => ({
                goldCost: level.goldCost ?? 0,
                salvageCost: level.dustCost ?? 0,
                mythicSalvageCost: level.mythicDustCost ?? 0,
                stats: convertStats(level.stats),
            })),
        };
    }

    return ret;
}

export interface EquipmentAssetRef {
    destRelPath: string;
    sourceAbsPath: string | undefined;
}

// Ported verbatim from tacticusplanner's equipment.service.ts:90-99 (getEquipmentIconPathFromId).
// Two separate repos, so this can't be shared directly - if tacticusplanner ever adds a 3rd
// exception, mirror it here too.
const EQUIPMENT_ICON_OVERRIDES: Record<string, string> = {
    R_Crit_Dw02AdvancedBurstCannon: 'ui_icon_item_R_Crit_DW02AdvancedBurstCannon.png',
    R_Block_DaemonfleshPlate: 'ui_icon_item_R_Block_DaemonFleshPlate.png',
};

export function collectEquipmentIconAssets(equipmentIds: string[], assetsDir: string): EquipmentAssetRef[] {
    const spriteFiles = loadSpriteFilesByLowercaseName(`${assetsDir}/sprites`);
    const refs: EquipmentAssetRef[] = [];
    for (const id of equipmentIds) {
        const wanted = EQUIPMENT_ICON_OVERRIDES[id] ?? `ui_icon_item_${id}.png`;
        const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
        if (!file) {
            console.error(`Couldn't find icon for equipment "${id}" - expected it to be '${wanted}'.`);
        }
        refs.push({
            destRelPath: `equipment/${file ?? wanted}`,
            sourceAbsPath: file ? `${assetsDir}/sprites/${file}` : undefined,
        });
    }
    return refs;
}
