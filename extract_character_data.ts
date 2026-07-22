import * as fs from 'fs';
import { loadSpriteFilesByLowercaseName, resolveSpriteCaseInsensitive } from './sprite_lookup';

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

// visuals.csv rows look like "<id>_visual,<basename>" - strip the "_visual" suffix from the key.
function loadVisuals(visualsFilePath: string): Map<string, string> {
    const raw = fs.readFileSync(visualsFilePath, 'utf-8');
    const map = new Map<string, string>();
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(',');
        if (parts.length !== 2 || !parts[0].endsWith('_visual')) continue;
        map.set(parts[0].slice(0, -'_visual'.length), parts[1]);
    }
    return map;
}

interface Avatar {
    id: string;
    unitId: string;
}

// Hardcoded override, ported verbatim from create_character_data.cc's GetRoundIconPath.
const ROUND_ICON_OVERRIDES: Record<string, string> = {
    spaceStormcaller: 'snowprint_assets/characters/ui_image_RoundPortrait_space_stormcaller_01.png',
};

function getAbilityDamageTypes(abilities: Record<string, any>, abilityIds: string[]): string[] {
    const damageTypes = new Set<string>();
    for (const id of abilityIds) {
        const constants = abilities[id]?.constants;
        if (!constants) continue;
        for (const [key, value] of Object.entries<any>(constants)) {
            if (key.startsWith('damageProfile') && typeof value === 'string' && value !== '') {
                damageTypes.add(value);
            }
        }
    }
    return [...damageTypes].sort();
}

function getIconPath(spriteFiles: Map<string, string>, id: string, visuals: Map<string, string>): string {
    const wanted = `ui_image_portrait_${visuals.get(id) ?? ''}.png`;
    const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
    if (!file) {
        console.error(`Couldn't find avatar icon for "${id}" - expected it to be '${wanted}'.`);
    }
    return `snowprint_assets/characters/${file ?? wanted}`;
}

function getRoundIconPath(spriteFiles: Map<string, string>, id: string, avatars: Avatar[]): string {
    const override = ROUND_ICON_OVERRIDES[id];
    if (override) {
        const overrideBasename = override.slice(override.lastIndexOf('/') + 1);
        const file = resolveSpriteCaseInsensitive(spriteFiles, overrideBasename);
        return file ? `snowprint_assets/characters/${file}` : override;
    }

    const wanted = `ui_image_RoundPortrait_${avatars.find((a) => a.unitId === id)?.id ?? ''}.png`;
    const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
    if (!file) {
        console.error(`Couldn't find avatar icon for "${id}" - expected it to be '${wanted}'.`);
    }
    return `snowprint_assets/characters/${file ?? wanted}`;
}

export interface CharacterEntry {
    id: string;
    Name: string;
    Title: string;
    'Full Name': string;
    'Short Name': string;
    'Extra Short Name': string;
    Faction: string;
    Alliance: string;
    Health: number;
    Damage: number;
    Armour: number;
    'Initial rarity': string;
    'Melee Damage': string;
    'Melee Hits': number;
    'Ranged Damage'?: string;
    'Ranged Hits'?: number;
    Distance?: number;
    Movement: number;
    Equipment1: string;
    Equipment2: string;
    Equipment3: string;
    Traits: string[];
    'Active Ability'?: string[];
    'Active Ability Names': string[];
    'Passive Ability'?: string[];
    'Passive Ability Names': string[];
    Number: number;
    Icon: string;
    RoundIcon: string;
}

export interface ExtractCharacterDataParams {
    gameconfigPath: string;
    i2Path: string;
    assetsDir: string;
    visualsFilePath: string;
}

export function extractCharacterData({ gameconfigPath, i2Path, assetsDir, visualsFilePath }: ExtractCharacterDataParams): CharacterEntry[] {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const i2Terms = loadI2Terms(i2Path);
    const visuals = loadVisuals(visualsFilePath);
    const spriteFiles = loadSpriteFilesByLowercaseName(`${assetsDir}/sprites`);
    const lineup: Record<string, any> = data.clientGameConfig.units.lineup;
    const abilities: Record<string, any> = data.clientGameConfig.units.abilities;

    // ParseAvatars (parse_avatars.cc) drops "premium" avatars before the rest of the pipeline
    // ever sees them - both the "Number" index and the RoundIcon lookup must use this same
    // filtered list to match the C++ output.
    const avatars: Avatar[] = (data.clientGameConfig.avatars as any[])
        .filter((a) => a.effect !== 'premium')
        .map((a) => ({ id: a.avatarId, unitId: a.value }));

    const ret: CharacterEntry[] = [];
    for (const [id, unit] of Object.entries<any>(lineup)) {
        if ((unit.traits as string[]).includes('MachineOfWar')) continue;

        const weapons: any[] = unit.weapons;
        const melee = weapons[0];

        const activeDamageTypes = getAbilityDamageTypes(abilities, unit.activeAbilities);
        const passiveDamageTypes = getAbilityDamageTypes(abilities, unit.passiveAbilities);

        const number = avatars.findIndex((a) => a.unitId === id);
        if (number === -1) {
            console.error(`Couldn't find avatar for "${id}".`);
        }

        const entry: CharacterEntry = {
            id,
            Name: (unit.name as string).trim(),
            Title: (i2Terms.get(`Units/${id}_Title`) ?? '').trim(),
            'Full Name': (i2Terms.get(`Units/${id}_Name`) ?? '').trim(),
            'Short Name': (i2Terms.get(`Units/${id}_ShortName`) ?? '').trim(),
            'Extra Short Name': (i2Terms.get(`Units/${id}_ExtraShortName`) ?? '').trim(),
            Faction: unit.FactionId,
            Alliance: unit.GrandAllianceId,
            Health: unit.stats.Health,
            Damage: unit.stats.Damage,
            Armour: unit.stats.FixedArmor,
            'Initial rarity': unit.BaseRarity,
            'Melee Damage': melee.DamageProfile,
            'Melee Hits': melee.hits,
            Movement: unit.Movement,
            Equipment1: unit.itemSlots[0],
            Equipment2: unit.itemSlots[1],
            Equipment3: unit.itemSlots[2],
            Traits: (unit.traits as string[]).filter((t) => t !== 'Hero'),
            'Active Ability Names': unit.activeAbilities,
            'Passive Ability Names': unit.passiveAbilities,
            Number: number,
            Icon: getIconPath(spriteFiles, id, visuals),
            RoundIcon: getRoundIconPath(spriteFiles, id, avatars),
        };

        if (weapons.length > 1) {
            const ranged = weapons[1];
            entry['Ranged Damage'] = ranged.DamageProfile;
            entry['Ranged Hits'] = ranged.hits;
            entry.Distance = ranged.Range;
        }

        if (activeDamageTypes.length > 0) entry['Active Ability'] = activeDamageTypes;
        if (passiveDamageTypes.length > 0) entry['Passive Ability'] = passiveDamageTypes;

        ret.push(entry);
    }

    return ret;
}
