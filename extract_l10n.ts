import * as fs from 'fs';

import { loadI2Terms, listAvailableLocales } from './i2_lookup';
import { fixMalformedStyle } from './extract_abilities';
import { discoverSurvivalEvents, extractSurvivalEvent } from './extract_survival_events';
import { discoverShopEvents, extractShopEvent } from './extract_shop_event';
import { discoverCalendars, extractCalendar } from './extract_product_calendars';
import { extractTraits } from './extract_traits';
import { flattenUnitSets } from './extract_guild_boss';
import { CAMPAIGN_NAMES } from './extract_campaign_data';

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

export interface ProgressionNames {
    ranks: Record<string, string>;
    rarities: Record<string, string>;
}

export interface L10nBundle {
    character_names: Record<string, UnitNames>;
    mow_names: Record<string, UnitNames>;
    upgrade_materials: Record<string, string>;
    ability_names: Record<string, string>;
    ability_descriptions: Record<string, string>;
    equipment: Record<string, string>;
    resources: Record<string, string>;
    trait_names: Record<string, string>;
    faction_names: Record<string, string>;
    damage_type_names: Record<string, string>;
    campaign_names: Record<string, string>;
    progression_names: ProgressionNames;
    guild_boss_names: Record<string, UnitNames>;
    npc_names: Record<string, UnitNames>;
}

export interface ExtractL10nParams {
    gameconfigPath: string;
    assetsDir: string;
    // Guild boss unit ids/stats live in GlobalGameConfig, not gameconfigPath's
    // clientGameConfig - without this, guild_boss_names comes out empty (with one warning)
    // rather than failing the whole l10n run, same as a missing resource key.
    globalConfigPath?: string;
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
// Traits - extractTraits (extract_traits.ts) already does its own self-contained parsing of
// Traits/<id>_Name / _StyledName / _Description per locale; only the name is needed here, so
// just take .id/.name from its output instead of re-deriving the Traits/ grouping logic.
// ---------------------------------------------------------------------------

function buildTraitNames(i2Path: string): Record<string, string> {
    const ret: Record<string, string> = {};
    for (const trait of extractTraits({ i2Path })) {
        ret[trait.id] = trait.name;
    }
    return ret;
}

// ---------------------------------------------------------------------------
// Factions - self-contained like traits: the FactionId string enum (read by
// extract_character_data.ts / extract_npc_data.ts / extract_mow_data.ts, etc.) has a matching
// plain-name i2 key, UnitDetails/Faction_<id> - distinct from the styled
// UnitDetails/Faction_AllianceInfo_<id> variant, which this excludes.
// ---------------------------------------------------------------------------

const FACTION_NAME_RE = /^UnitDetails\/Faction_(?!AllianceInfo_)([A-Za-z0-9]+)$/;

function buildFactionNames(i2Terms: Map<string, string>): Record<string, string> {
    const ret: Record<string, string> = {};
    for (const [term, value] of i2Terms) {
        const match = term.match(FACTION_NAME_RE);
        if (match) ret[match[1]] = value;
    }
    return ret;
}

// ---------------------------------------------------------------------------
// Damage types - the id set is language-independent (scanned straight out of gameconfig, once,
// same as discoverResourceKeys below), same damageProfile* constants convention
// getAbilityDamageTypes() in extract_character_data.ts/extract_npc_data.ts already reads
// per-unit, just run over every ability instead of one unit's list for full coverage. The
// matching i2 key, S/DMG_<id>, is always wrapped in a <style=...>...</style> span with no
// unstyled variant anywhere in i2 - stripOuterStyleTag peels that back off (fixMalformedStyle,
// imported above for ability descriptions, only fixes malformed quoting, it doesn't strip tags,
// so it's the wrong tool here).
// ---------------------------------------------------------------------------

function stripOuterStyleTag(text: string): string {
    const match = text.match(/^<style=["']?[^>]*>(.*)<\/style>$/);
    return match ? match[1] : text;
}

function discoverDamageTypeIds(abilities: Record<string, any>): Set<string> {
    const ids = new Set<string>();
    for (const ability of Object.values<any>(abilities)) {
        const constants = ability?.constants;
        if (!constants) continue;
        for (const [key, value] of Object.entries<any>(constants)) {
            if (key.startsWith('damageProfile') && typeof value === 'string' && value !== '') {
                ids.add(value);
            }
        }
    }
    return ids;
}

function buildDamageTypeNames(
    damageTypeIds: Set<string>,
    i2Terms: Map<string, string>,
    missingKeys: Set<string>
): Record<string, string> {
    const ret: Record<string, string> = {};
    for (const id of damageTypeIds) {
        const name = i2Terms.get(`S/DMG_${id}`);
        if (!name) {
            missingKeys.add(id);
            ret[id] = '';
        } else {
            ret[id] = stripOuterStyleTag(name);
        }
    }
    return ret;
}

// ---------------------------------------------------------------------------
// Campaigns - covers every id extract_campaign_data.ts's CAMPAIGN_NAMES already has a hardcoded
// English name for:
//   - campaign/mirror/elite/eliteMirror<N> (16 ids): direct i2 hit at
//     Campaigns/<Type>_<id>_name, Type derived from the id's alpha prefix.
//   - eventStandard/eventExtremis<N> (14 ids): no dedicated i2 key of their own - built by
//     joining CampaignEvents/Ce_Campaign_Title_eventCampaign<N> (the faction name, confirmed 1:1
//     against CAMPAIGN_NAMES' faction half for every N) with
//     CampaignEvents/Ce_Difficulty_Mode_Standard|Extremis (the mode word), same space-joined
//     order CAMPAIGN_NAMES already hardcodes in English. No template term pairs the two, so the
//     join order is inferred from that existing convention, same way resolveShardName below
//     infers its own template's placement.
// ---------------------------------------------------------------------------

const CAMPAIGN_TYPE_PREFIXES: Record<string, string> = {
    campaign: 'Standard',
    mirror: 'Mirror',
    elite: 'Elite',
    eliteMirror: 'EliteMirror',
};

const CAMPAIGN_ID_RE = /^(campaign|eliteMirror|mirror|elite)(\d+)$/;
const EVENT_ID_RE = /^(eventStandard|eventExtremis)(\d+)$/;

function buildCampaignNames(i2Terms: Map<string, string>): Record<string, string> {
    const ret: Record<string, string> = {};

    for (const id of Object.keys(CAMPAIGN_NAMES)) {
        const campaignMatch = id.match(CAMPAIGN_ID_RE);
        if (campaignMatch) {
            const type = CAMPAIGN_TYPE_PREFIXES[campaignMatch[1]];
            ret[id] = i2Terms.get(`Campaigns/${type}_${id}_name`) ?? '';
            continue;
        }

        const eventMatch = id.match(EVENT_ID_RE);
        if (eventMatch) {
            const [, kind, n] = eventMatch;
            const faction = i2Terms.get(`CampaignEvents/Ce_Campaign_Title_eventCampaign${n}`);
            const mode = i2Terms.get(`CampaignEvents/Ce_Difficulty_Mode_${kind === 'eventStandard' ? 'Standard' : 'Extremis'}`);
            ret[id] = faction && mode ? `${faction} ${mode}` : '';
            continue;
        }

        console.error(`WARNING: unrecognized campaign id "${id}" - no l10n convention known for it`);
    }

    return ret;
}

// ---------------------------------------------------------------------------
// Progression - ranks (positional index 0-20, matching extract_rank_up_data.ts's RANKS array)
// and rarities (the BaseRarity enum extract_character_data.ts reads). Deliberately no "stars"
// field - the game has no per-star-count i2 name table anywhere, only the generic word "Star" in
// unrelated tooltip copy.
// ---------------------------------------------------------------------------

const RANK_COUNT = 21;
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

function buildProgressionNames(i2Terms: Map<string, string>): ProgressionNames {
    const ranks: Record<string, string> = {};
    for (let i = 0; i < RANK_COUNT; ++i) {
        ranks[String(i)] = i2Terms.get(`UnitDetails/Rank_${i}`) ?? '';
    }

    const rarities: Record<string, string> = {};
    for (const rarity of RARITIES) {
        rarities[rarity] = i2Terms.get(`Upgrades/RarityName_Raw_${rarity}`) ?? '';
    }

    return { ranks, rarities };
}

// ---------------------------------------------------------------------------
// Guild boss units - boss unit ids are Object.keys(flattenUnitSets(guildBoss.unitSets))
// (extract_guild_boss.ts's own resolveBossUnit looks bosses up the same way), run through the
// same buildUnitNames convention as characters/MoWs/NPCs - boss units live in the identical
// Units/<id>_Name i2 namespace.
// ---------------------------------------------------------------------------

function buildGuildBossNames(globalConfigPath: string | undefined, i2Terms: Map<string, string>): Record<string, UnitNames> {
    const ret: Record<string, UnitNames> = {};
    if (!globalConfigPath) return ret;

    const data = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    const guildBoss = data.guildBoss;
    if (!guildBoss?.unitSets) return ret;

    const units = flattenUnitSets(guildBoss.unitSets);
    for (const id of Object.keys(units)) {
        ret[id] = buildUnitNames(id, i2Terms);
    }
    return ret;
}

// ---------------------------------------------------------------------------
// NPCs - units.npc keys, the same table extract_npc_data.ts reads (currently only via the raw
// English npc.name field), run through the same buildUnitNames convention as characters/MoWs -
// NPCs live in the identical Units/<id>_Name i2 namespace.
// ---------------------------------------------------------------------------

function buildNpcNames(npcs: Record<string, any>, i2Terms: Map<string, string>): Record<string, UnitNames> {
    const ret: Record<string, UnitNames> = {};
    for (const id of Object.keys(npcs)) {
        ret[id] = buildUnitNames(id, i2Terms);
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

export function extractL10n({
    gameconfigPath,
    assetsDir,
    globalConfigPath,
    listMissingResources,
}: ExtractL10nParams): Record<string, L10nBundle> {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const gameConfig = data.clientGameConfig;
    const lineup: Record<string, any> = gameConfig.units.lineup;
    const upgrades: Record<string, any> = gameConfig.upgrades;
    const abilities: Record<string, any> = gameConfig.units.abilities;
    const items: Record<string, any> = gameConfig.items;
    const npcs: Record<string, any> = gameConfig.units.npc;

    const locales = listAvailableLocales(assetsDir);
    if (locales.length === 0) {
        throw new Error(`No I2Languages_*.json files found under ${assetsDir}/monobehaviour`);
    }

    const resourceKeys = discoverResourceKeys(gameconfigPath, data, locales[0].path);
    const damageTypeIds = discoverDamageTypeIds(abilities);
    const missingResourceKeys = new Set<string>();
    const missingDamageTypeKeys = new Set<string>();

    if (!globalConfigPath) {
        console.error('WARNING: no --global-config given - guild_boss_names will be empty for every language.');
    }

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
            trait_names: buildTraitNames(locale.path),
            faction_names: buildFactionNames(i2Terms),
            damage_type_names: buildDamageTypeNames(damageTypeIds, i2Terms, missingDamageTypeKeys),
            campaign_names: buildCampaignNames(i2Terms),
            progression_names: buildProgressionNames(i2Terms),
            guild_boss_names: buildGuildBossNames(globalConfigPath, i2Terms),
            npc_names: buildNpcNames(npcs, i2Terms),
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

    if (missingDamageTypeKeys.size > 0) {
        const sorted = [...missingDamageTypeKeys].sort();
        console.error(
            `WARNING: ${sorted.length} damage type(s) have no localized name in at least one language: ${sorted.join(', ')}`
        );
    }

    return bundles;
}
