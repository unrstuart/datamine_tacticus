import * as fs from 'fs';
import { loadSpriteFilesByLowercaseName, resolveSpriteCaseInsensitive } from './sprite_lookup';

interface Avatar {
    id: string;
    unitId: string;
}

// Overrides the icon basename derived from avatars - matches create_mow_data.cc's GetIconPath.
// Note this override applies ONLY to "icon", not "roundIcon" - preserved from the C++ source.
const ICON_OVERRIDES: Record<string, string> = {
    orksRukkatrukk: 'orkss_rukkatruk_01',
};

function getIconPath(spriteFiles: Map<string, string>, id: string, avatars: Avatar[]): string {
    let img = avatars.find((a) => a.unitId === id)?.id ?? '';
    if (id in ICON_OVERRIDES) img = ICON_OVERRIDES[id];

    const wanted = `ui_image_portrait_${img}.png`;
    const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
    if (!file) {
        console.error(`Couldn't find avatar icon for "${id}" - expected it to be '${wanted}'.`);
    }
    return `snowprint_assets/characters/${file ?? wanted}`;
}

function getRoundIconPath(spriteFiles: Map<string, string>, id: string, avatars: Avatar[]): string {
    const img = avatars.find((a) => a.unitId === id)?.id ?? '';
    const wanted = `ui_image_RoundPortrait_${img}.png`;
    const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
    if (!file) {
        console.error(`Couldn't find avatar icon for "${id}" - expected it to be '${wanted}'.`);
    }
    return `snowprint_assets/characters/${file ?? wanted}`;
}

interface MowAbility {
    name: string;
    recipes: [string, string, string][];
}

function buildAbility(abilities: Record<string, any>, abilityId: string): MowAbility | undefined {
    if (!abilityId) return undefined;
    const upgrades: any[][] = abilities[abilityId]?.upgrades ?? [];
    return {
        name: abilityId,
        recipes: upgrades.map((u) => [u[0], u[1], u[2]]),
    };
}

export interface MowEntry {
    snowprintId: string;
    name: string;
    faction: string;
    alliance: string;
    icon: string;
    roundIcon: string;
    primaryAbility?: MowAbility;
    secondaryAbility?: MowAbility;
}

interface UpgradeCostBadges {
    rarity: string;
    amount: number;
}

export interface MowUpgradeCost {
    gold: number;
    salvage: number;
    badges?: UpgradeCostBadges;
    forgeBadges?: UpgradeCostBadges;
    components: number;
}

export interface MowData {
    mows: MowEntry[];
    upgradeCosts: MowUpgradeCost[];
}

export interface ExtractMowDataParams {
    gameconfigPath: string;
    assetsDir: string;
}

function parseUpgradeCost(raw: Record<string, number>): MowUpgradeCost {
    const cost: MowUpgradeCost = { gold: 0, salvage: 0, components: 0 };
    for (const [member, value] of Object.entries(raw)) {
        if (member === 'gold') {
            cost.gold = value;
        } else if (member === 'dust') {
            cost.salvage = value;
        } else if (member === 'machinesOfWarToken') {
            cost.components = value;
        } else if (member.startsWith('itemAscensionResource_')) {
            cost.forgeBadges = { rarity: member.slice('itemAscensionResource_'.length), amount: value };
        } else if (member.startsWith('abilityToken')) {
            cost.badges = { rarity: member.slice('abilityToken'.length), amount: value };
        } else {
            throw new Error(`Unknown upgrade cost type: ${member}`);
        }
    }
    return cost;
}

export function extractMowData({ gameconfigPath, assetsDir }: ExtractMowDataParams): MowData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const lineup: Record<string, any> = data.clientGameConfig.units.lineup;
    const abilities: Record<string, any> = data.clientGameConfig.units.abilities;
    const spriteFiles = loadSpriteFilesByLowercaseName(`${assetsDir}/sprites`);
    const avatars: Avatar[] = (data.clientGameConfig.avatars as any[]).map((a) => ({
        id: a.avatarId,
        unitId: a.value,
    }));

    const mows: MowEntry[] = [];
    for (const [id, unit] of Object.entries<any>(lineup)) {
        if (!(unit.traits as string[]).includes('MachineOfWar')) continue;

        const [primaryId, secondaryId] = unit.activeAbilities as [string, string];
        mows.push({
            snowprintId: id,
            name: unit.name,
            faction: unit.FactionId,
            alliance: unit.GrandAllianceId,
            icon: getIconPath(spriteFiles, id, avatars),
            roundIcon: getRoundIconPath(spriteFiles, id, avatars),
            primaryAbility: buildAbility(abilities, primaryId),
            secondaryAbility: buildAbility(abilities, secondaryId),
        });
    }

    const upgradeCosts: MowUpgradeCost[] = (data.clientGameConfig.units.abilityUpgradeCostsMoW as any[]).map(
        parseUpgradeCost,
    );

    return { mows, upgradeCosts };
}
