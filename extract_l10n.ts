import * as fs from 'fs';

import { loadI2Terms, listAvailableLocales } from './i2_lookup';
import { fixMalformedStyle } from './extract_abilities';
import { discoverSurvivalEvents, extractSurvivalEvent } from './extract_survival_events';
import { discoverShopEvents, extractShopEvent } from './extract_shop_event';
import { discoverCalendars, extractCalendar } from './extract_product_calendars';

// Localized name/description dumps for the planner, one bundle per available I2Languages file.
// Everything here mirrors an existing extractor's id scheme + i2 term-key convention (see each
// builder below), except resources.json, which has no existing convention to mirror - see
// collectResourceKeys.

export interface UnitNames {
    extraShortName: string;
    shortName: string;
    name: string;
    title: string;
}

export interface L10nBundle {
    character_names: Record<string, UnitNames>;
    mow_names: Record<string, UnitNames>;
    upgrade_materials: Record<string, string>;
    ability_names: Record<string, string>;
    ability_descriptions: Record<string, string>;
    equipment: Record<string, string>;
    resources: Record<string, string>;
}

export interface ExtractL10nParams {
    gameconfigPath: string;
    assetsDir: string;
    // Prints each unresolved resource key (deduped, sorted) alongside the one-line summary,
    // instead of just the count. Off by default to keep normal runs quiet.
    listMissingResources?: boolean;
}

// ---------------------------------------------------------------------------
// Units (characters + Machines of War) - both live in units.lineup, split the same way
// extract_mows.ts does (traits includes "MachineOfWar"); characters additionally skip the
// Movement===0 non-playable entries extract_heroes.ts already filters out.
// ---------------------------------------------------------------------------

function buildUnitNames(id: string, i2Terms: Map<string, string>): UnitNames {
    return {
        extraShortName: i2Terms.get(`Units/${id}_ExtraShortName`) ?? '',
        shortName: i2Terms.get(`Units/${id}_ShortName`) ?? '',
        name: i2Terms.get(`Units/${id}_Name`) ?? '',
        title: i2Terms.get(`Units/${id}_Title`) ?? '',
    };
}

function isMachineOfWar(unit: any): boolean {
    return !!(unit.traits as string[] | undefined)?.includes('MachineOfWar');
}

function buildCharacterAndMowNames(
    lineup: Record<string, any>,
    i2Terms: Map<string, string>
): { characters: Record<string, UnitNames>; mows: Record<string, UnitNames> } {
    const characters: Record<string, UnitNames> = {};
    const mows: Record<string, UnitNames> = {};
    for (const [id, unit] of Object.entries<any>(lineup)) {
        if (isMachineOfWar(unit)) {
            mows[id] = buildUnitNames(id, i2Terms);
        } else if ((unit.Movement ?? 0) !== 0) {
            characters[id] = buildUnitNames(id, i2Terms);
        }
    }
    return { characters, mows };
}

// ---------------------------------------------------------------------------
// Upgrade materials, abilities, equipment - each a flat id -> localized-field lookup against one
// gameconfig table, same id scheme + i2 term-key convention as extract_recipe_data.ts /
// extract_abilities.ts (name only, not the rest of their output) / a new Items/<id>_name
// convention confirmed live but currently unread by extract_equipment_data.ts.
// ---------------------------------------------------------------------------

function buildUpgradeMaterials(upgrades: Record<string, any>, i2Terms: Map<string, string>): Record<string, string> {
    const ret: Record<string, string> = {};
    for (const [id, upgrade] of Object.entries<any>(upgrades)) {
        ret[id] = i2Terms.get(`Upgrades/${id}_name`) ?? upgrade.name ?? '';
    }
    return ret;
}

function buildAbilityText(
    abilities: Record<string, any>,
    i2Terms: Map<string, string>
): { names: Record<string, string>; descriptions: Record<string, string> } {
    const names: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    for (const id of Object.keys(abilities)) {
        names[id] = i2Terms.get(`Abilities/${id}_Name`) ?? '';
        descriptions[id] = fixMalformedStyle(i2Terms.get(`Abilities/${id}_CurrentLevelDescription`)) ?? '';
    }
    return { names, descriptions };
}

function buildEquipment(items: Record<string, any>, i2Terms: Map<string, string>): Record<string, string> {
    const ret: Record<string, string> = {};
    for (const [id, item] of Object.entries<any>(items)) {
        ret[id] = i2Terms.get(`Items/${id}_name`) ?? item.name ?? '';
    }
    return ret;
}

// ---------------------------------------------------------------------------
// resources.json - every reward/purchasable item key referenced by a survival event, shop/
// seasonal event, product calendar, or the daily shop. No repo-wide {key, quantity} struct exists
// for these - every reward is a raw "<type>:<amount>" string (or a bare type-only string for pool
// refs like "upgradesCommon"), duplicated ad hoc across seasonal_event_shared.ts/
// extract_product_calendars.ts/extract_crusade_shop.ts's own convertReward()s. Rather than
// hand-chasing every nested reward-bearing field across 3 differently-shaped result types plus the
// daily shop, walk each one generically instead - fragile-to-schema-drift field-path-chasing traded
// for a value-shape heuristic that already matches this repo's own stated reward-string convention.
// ---------------------------------------------------------------------------

const REWARD_STRING_RE = /^[A-Za-z][A-Za-z0-9_]*:\d+$/; // "gold:600", "seasonalEventCurrencyAugust2026:20"

function collectResourceKeys(value: unknown, keys: Set<string>, fieldName?: string): void {
    if (typeof value === 'string') {
        if (REWARD_STRING_RE.test(value)) {
            keys.add(value.slice(0, value.lastIndexOf(':')));
        } else if (fieldName === 'reward' || fieldName === 'freeOffer') {
            keys.add(value); // bare pool/type ref, e.g. "upgradesCommon", "defaultWoodChest"
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value) collectResourceKeys(v, keys, fieldName);
        return;
    }
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (typeof obj.type === 'string' && typeof obj.amount === 'number') {
            keys.add(obj.type); // { type, amount } cost shape
        }
        for (const [k, v] of Object.entries(obj)) {
            collectResourceKeys(v, keys, k);
        }
    }
}

// Language-independent: reward keys come straight from gameconfig, not i2, so this only needs to
// run once (not once per language). i2Path is required by extractSurvivalEvent/extractShopEvent/
// extractCalendar's signatures for title/description text unrelated to reward keys - any locale
// works.
function discoverResourceKeys(gameconfigPath: string, data: any, i2Path: string): Set<string> {
    const keys = new Set<string>();

    for (const eventName of discoverSurvivalEvents(data).keys()) {
        try {
            const event = extractSurvivalEvent({ gameconfigPath, eventName, i2Path });
            // event.survival/event.battle are raw passthroughs of the mode's board/wave/spawn config
            // (SurvivalEventData's "survival: any"/"battle: any" fields) - they contain enemy spawn
            // compositions shaped exactly like "<type>:<amount>" reward strings (e.g.
            // "necroNpc1Warrior:3", meaning "spawn 3 Necron Warriors"), which would otherwise get
            // vacuumed up as if they were player-facing rewards. Only walk the fields that are
            // actually reward-bearing.
            collectResourceKeys(event.milestoneRewards, keys, 'milestoneRewards');
            collectResourceKeys(event.survivalPoints, keys, 'survivalPoints');
            collectResourceKeys(event.chests, keys, 'chests');
            collectResourceKeys(event.offers, keys, 'offers');
            collectResourceKeys(event.missions, keys, 'missions');
        } catch (error: any) {
            console.error(`WARNING: couldn't extract survival event "${eventName}" for resource-key discovery: ${error.message}`);
        }
    }

    for (const eventName of discoverShopEvents(data).keys()) {
        try {
            collectResourceKeys(extractShopEvent({ gameconfigPath, eventName, i2Path }), keys);
        } catch (error: any) {
            console.error(`WARNING: couldn't extract shop event "${eventName}" for resource-key discovery: ${error.message}`);
        }
    }

    for (const calendarName of discoverCalendars(data).keys()) {
        try {
            collectResourceKeys(extractCalendar({ gameconfigPath, calendarName, i2Path }), keys);
        } catch (error: any) {
            console.error(`WARNING: couldn't extract calendar "${calendarName}" for resource-key discovery: ${error.message}`);
        }
    }

    // shop.merchants.default is the always-on, cron-refreshing merchant (allowedRefreshesPerDay/
    // refreshCost/a midnight cronSchedule on every slot) - i.e. the daily shop. The other
    // shop.merchants entries (crusadeShop/guildWars/guild/elderShop/dated *WeekNEventShop keys)
    // are already covered by extract_crusade_shop.ts/extract_war_shop.ts/extract_guild_shop.ts/
    // the shop-event loop above.
    const dailyShop = data.clientGameConfig?.shop?.merchants?.default;
    if (dailyShop) {
        collectResourceKeys(dailyShop, keys);
    } else {
        console.error('WARNING: no shop.merchants.default found - daily shop not included in resource-key discovery');
    }

    return keys;
}

// Character-shard reward types ("shards_<id>"/"mythicShards_<id>", by far the largest slice of
// resource keys - roughly 2 per playable character) aren't a flat i2 lookup: the localized string
// is a template ("Resources/Shards_Plural" -> "{[UNIT]} Shards", "{[UNIT]}の欠片", ... - confirmed
// the {[UNIT]} placeholder itself stays untranslated across languages) that needs the character's
// own localized name substituted in, mirroring seasonal_event_shared.ts's convertReward() (which
// does the same substitution, just into hardcoded English instead of an i2 template).
const SHARD_KEY_RE = /^(mythicShards|shards)_(\w+)$/;

function resolveShardName(
    key: string,
    i2Terms: Map<string, string>,
    characters: Record<string, UnitNames>,
    mows: Record<string, UnitNames>
): string | undefined {
    const match = key.match(SHARD_KEY_RE);
    if (!match) return undefined;
    const [, kind, unitId] = match;
    const template = i2Terms.get(kind === 'mythicShards' ? 'Resources/mythicShards_Plural' : 'Resources/Shards_Plural');
    if (!template) return undefined;
    const unitName = characters[unitId]?.name || mows[unitId]?.name || unitId;
    return template.replace('{[UNIT]}', unitName);
}

// Missing resources are collected into `missingKeys` (deduped across every language by the
// caller) rather than printed per-key-per-language here - with 12 languages x a couple hundred
// keys that's an unreadable wall of near-duplicate lines. extractL10n prints one summary (and,
// with listMissingResources, the deduped key list) once, after every language has run.
function buildResources(
    resourceKeys: Set<string>,
    i2Terms: Map<string, string>,
    characters: Record<string, UnitNames>,
    mows: Record<string, UnitNames>,
    upgradeMaterials: Record<string, string>,
    equipment: Record<string, string>,
    missingKeys: Set<string>
): Record<string, string> {
    const ret: Record<string, string> = {};
    for (const key of resourceKeys) {
        let name =
            characters[key]?.name ||
            mows[key]?.name ||
            upgradeMaterials[key] ||
            equipment[key] ||
            i2Terms.get(`Resources/${key}_Plural`) ||
            i2Terms.get(`Resources/${key}_One`) ||
            resolveShardName(key, i2Terms, characters, mows);
        if (!name) {
            missingKeys.add(key);
            name = '';
        }
        ret[key] = name;
    }
    return ret;
}

// ---------------------------------------------------------------------------

export function extractL10n({ gameconfigPath, assetsDir, listMissingResources }: ExtractL10nParams): Record<string, L10nBundle> {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const gameConfig = data.clientGameConfig;
    const lineup: Record<string, any> = gameConfig.units.lineup;
    const upgrades: Record<string, any> = gameConfig.upgrades;
    const abilities: Record<string, any> = gameConfig.units.abilities;
    const items: Record<string, any> = gameConfig.items;

    const locales = listAvailableLocales(assetsDir);
    if (locales.length === 0) {
        throw new Error(`No I2Languages_*.json files found under ${assetsDir}/monobehaviour`);
    }

    const resourceKeys = discoverResourceKeys(gameconfigPath, data, locales[0].path);
    const missingResourceKeys = new Set<string>();

    const bundles: Record<string, L10nBundle> = {};
    for (const locale of locales) {
        const i2Terms = loadI2Terms(locale.path);
        const { characters, mows } = buildCharacterAndMowNames(lineup, i2Terms);
        const upgradeMaterials = buildUpgradeMaterials(upgrades, i2Terms);
        const { names: abilityNames, descriptions: abilityDescriptions } = buildAbilityText(abilities, i2Terms);
        const equipment = buildEquipment(items, i2Terms);
        const resources = buildResources(resourceKeys, i2Terms, characters, mows, upgradeMaterials, equipment, missingResourceKeys);

        bundles[locale.code] = {
            character_names: characters,
            mow_names: mows,
            upgrade_materials: upgradeMaterials,
            ability_names: abilityNames,
            ability_descriptions: abilityDescriptions,
            equipment,
            resources,
        };
    }

    if (missingResourceKeys.size > 0) {
        const sorted = [...missingResourceKeys].sort();
        if (listMissingResources) {
            console.error(`WARNING: ${sorted.length} resource key(s) have no localized name in at least one language:`);
            for (const key of sorted) console.error(`  - ${key}`);
        } else {
            console.error(
                `WARNING: ${sorted.length} resource key(s) have no localized name in at least one language ` +
                    `(pass --list-missing-resources to print them).`
            );
        }
    }

    return bundles;
}
