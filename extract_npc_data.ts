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

// Overrides checked before the visuals.csv map - ported verbatim from create_npc_data.cc's
// GetIconPath. (The duplicate GuildBoss2Npc3TyranRipperSwarmGorgon entry in the C++ source
// is a harmless no-op dupe key, not reproduced here.)
const ICON_OVERRIDES: Record<string, string> = {
    deathNpc3Nurglings: 'death_nurgling_01',
    necroSmnSwarm: 'necro_scarab_01',
    orksRukkatrukk: 'orkss_rukkatruk_01',
    GuildBoss2Npc2TyranRipperSwarmKronos: 'tyran_ripper_01',
    GuildBoss2Npc3TyranRipperSwarmGorgon: 'tyran_ripper_01',
    ultraNpc3Intercessor: 'ultra_inceptor_02',
};

function getIconPath(spriteFiles: Map<string, string>, id: string, visualId: string, visuals: Map<string, string>): string {
    const img = ICON_OVERRIDES[visualId] ?? visuals.get(visualId);
    if (img === undefined) {
        console.error(`Couldn't find sprite for "${visualId}"`);
        return '';
    }

    const wanted = `ui_image_portrait_${img}.png`;
    const file = resolveSpriteCaseInsensitive(spriteFiles, wanted);
    if (!file) {
        console.error(`Couldn't find sprite for "${id}" at '${wanted}'`);
    }
    return `snowprint_assets/characters/${file ?? wanted}`;
}

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

function getKnownAbilityIds(abilities: Record<string, any>, abilityIds: string[]): string[] {
    const ids = new Set<string>();
    for (const id of abilityIds) {
        if (id in abilities) {
            ids.add(id);
        } else {
            console.error(`couldn't find ability "${id}"`);
        }
    }
    return [...ids].sort();
}

export interface NpcStats {
    AbilityLevel: number;
    Damage: number;
    Armor: number;
    Health: number;
    ProgressionIndex: number;
    Rank: number;
    Stars: number;
}

export interface NpcEntry {
    id: string;
    Name: string;
    Faction?: string;
    Alliance?: string;
    'Melee Damage': string;
    'Melee Hits': number;
    'Ranged Damage'?: string;
    'Ranged Hits'?: number;
    Distance?: number;
    Movement?: number;
    Traits: string[];
    Stats: NpcStats[];
    'Active Ability Damage'?: string[];
    'Passive Ability Damage'?: string[];
    'Active Abilities'?: string[];
    'Passive Abilities'?: string[];
    Icon: string;
}

export interface ExtractNpcDataParams {
    gameconfigPath: string;
    assetsDir: string;
    visualsFilePath: string;
}

export function extractNpcData({ gameconfigPath, assetsDir, visualsFilePath }: ExtractNpcDataParams): NpcEntry[] {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const visuals = loadVisuals(visualsFilePath);
    const spriteFiles = loadSpriteFilesByLowercaseName(`${assetsDir}/sprites`);
    const npcs: Record<string, any> = data.clientGameConfig.units.npc;
    const abilities: Record<string, any> = data.clientGameConfig.units.abilities;

    const ret: NpcEntry[] = [];
    for (const [id, npc] of Object.entries<any>(npcs)) {
        const weapons: any[] = npc.weapons ?? [];
        const melee = weapons[0] ?? { DamageProfile: '', hits: 0 };

        let visualId: string = npc.visualId;
        if (!visualId) {
            console.error(`NPC missing visual ID "${id}", falling back to assumed visual ID of ${id}`);
            visualId = id;
        }

        const entry: NpcEntry = {
            id,
            Name: npc.name,
            'Melee Damage': melee.DamageProfile,
            'Melee Hits': melee.hits,
            Traits: (npc.traits as string[]).filter((t) => t !== 'Hero'),
            Stats: (npc.stats ?? []).map((s: any) => ({
                AbilityLevel: s.AbilityLevel,
                Damage: s.Damage,
                Armor: s.FixedArmor ?? 0,
                Health: s.Health,
                ProgressionIndex: s.ProgressionIndex,
                Rank: s.Rank,
                Stars: s.StarLevel,
            })),
            Icon: getIconPath(spriteFiles, id, visualId, visuals),
        };

        if (npc.FactionId) entry.Faction = npc.FactionId;
        if (npc.GrandAllianceId) entry.Alliance = npc.GrandAllianceId;
        if (typeof npc.Movement === 'number') entry.Movement = npc.Movement;

        if (weapons.length > 1) {
            const ranged = weapons[1];
            entry['Ranged Damage'] = ranged.DamageProfile;
            entry['Ranged Hits'] = ranged.hits;
            entry.Distance = ranged.Range;
        }

        const activeDamageTypes = getAbilityDamageTypes(abilities, npc.activeAbilities ?? []);
        const passiveDamageTypes = getAbilityDamageTypes(abilities, npc.passiveAbilities ?? []);
        if (activeDamageTypes.length > 0) entry['Active Ability Damage'] = activeDamageTypes;
        if (passiveDamageTypes.length > 0) entry['Passive Ability Damage'] = passiveDamageTypes;

        const activeAbilities = getKnownAbilityIds(abilities, npc.activeAbilities ?? []);
        const passiveAbilities = getKnownAbilityIds(abilities, npc.passiveAbilities ?? []);
        if (activeAbilities.length > 0) entry['Active Abilities'] = activeAbilities;
        if (passiveAbilities.length > 0) entry['Passive Abilities'] = passiveAbilities;

        ret.push(entry);
    }

    return ret;
}
