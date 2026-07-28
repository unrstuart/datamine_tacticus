import * as fs from 'fs';
import * as path from 'path';

import { extractAbilities } from './extract_abilities';
import { extractAbilityIcons } from './extract_ability_icons';
import { extractArmageddon, formatArmageddonCsv } from './extract_armageddon';
import { discoverBlessedReqBanners, extractBlessedReqBanner, formatBlessedReqBannerFindResults } from './extract_blessed_req_banners';
import { extractCampaignData } from './extract_campaign_data';
import { extractCeGoldMedalRewards } from './extract_ce_gold_medal_rewards';
import { extractCharacterData } from './extract_character_data';
import { getCrusadeShopData, formatCrusadeShopCsv, parsePlayerLevel, parseHasMythic, parseTier } from './extract_crusade_shop';
import { extractEquipmentData, collectEquipmentIconAssets } from './extract_equipment_data';
import { getGuildBossData, summarizeActiveGuildBossSeason } from './extract_guild_boss';
import { getGuildShopData, formatGuildShopCsv } from './extract_guild_shop';
import { extractHeroQuests } from './extract_hero_quests';
import { extractHeroes } from './extract_heroes';
import { discoverHomescreenEvents, extractHomescreenEvent, formatHomescreenEventFindResults } from './extract_homescreen_events';
import { extractIncursionEnemies } from './extract_incursion_enemies';
import { extractLeData } from './extract_le_data';
import { discoverLegendaryEvents, extractLegendaryEventMetadata, formatLegendaryEventFindResults } from './extract_le_metadata';
import { extractMowData } from './extract_mow_data';
import { extractMows } from './extract_mows';
import { extractMythicQuests, formatMythicQuestsText } from './extract_mythic_quests';
import { extractNpcData } from './extract_npc_data';
import { extractOnslaught } from './extract_onslaught';
import { extractPierce } from './extract_pierce';
import { discoverCalendars, extractCalendar, printCalendarText, formatCalendarFindResults } from './extract_product_calendars';
import { extractRankUpData } from './extract_rank_up_data';
import { findRealMoneyProducts } from './extract_real_money_products';
import { extractRecipeData } from './extract_recipe_data';
import { getRogueTraderData, formatRogueTraderCsv } from './extract_rogue_trader';
import { discoverShopEvents, extractShopEvent, printShopEventText, formatShopEventFindResults, parseLevel } from './extract_shop_event';
import { discoverSurvivalEvents, extractSurvivalEvent, formatSurvivalEventFindResults } from './extract_survival_events';
import { extractSurvivalOffers } from './extract_survival_offers';
import { extractTraits } from './extract_traits';
import { getWarShopData, formatWarShopCsv } from './extract_war_shop';

// ---------------------------------------------------------------------------
// CLI parsing - extract_all.ts owns all command-line parsing now; none of the
// extract_*.ts modules read process.argv themselves.
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { positional: string; flags: Record<string, string> } {
    const positional = argv[0] && !argv[0].startsWith('--') ? argv[0] : '';
    const rest = positional ? argv.slice(1) : argv;
    const flags: Record<string, string> = {};
    rest.forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                flags[key] = nextValue;
            } else {
                flags[key] = 'true';
            }
        }
    });
    return { positional, flags };
}

function requireFlag(flags: Record<string, string>, key: string, usageHint: string): string {
    const value = flags[key];
    if (!value) throw new Error(`Missing required --${key}. ${usageHint}`);
    return value;
}

// ---------------------------------------------------------------------------
// Path resolution - most paths can be derived from a single --assets-dir root
// (matching the extracted-assets directory layout), but every one of them can
// still be overridden individually.
// ---------------------------------------------------------------------------

interface ResolvedPaths {
    gameconfigPath?: string;
    i2Path?: string;
    globalConfigPath?: string;
    assetsDir?: string;
    visualsFilePath?: string;
}

function resolvePath(explicit: string | undefined, assetsDir: string | undefined, conventionalSubpath: string): string | undefined {
    if (explicit) return explicit;
    if (assetsDir) return path.join(assetsDir, conventionalSubpath);
    return undefined;
}

function resolveAllPaths(flags: Record<string, string>): ResolvedPaths {
    const assetsDir = flags['assets-dir'];
    return {
        gameconfigPath: resolvePath(flags.gameconfig, assetsDir, 'text_assets/GameConfig'),
        i2Path: resolvePath(flags.i2, assetsDir, 'monobehaviour/I2Languages_en.json'),
        globalConfigPath: resolvePath(flags['global-config'], assetsDir, 'text_assets/GlobalGameConfig'),
        visualsFilePath: resolvePath(flags['visuals-file'], assetsDir, 'monobehaviour/visuals.csv'),
        assetsDir,
    };
}

function requireResolved(value: string | undefined, flagName: string, usageHint: string): string {
    if (!value) throw new Error(`Missing required --${flagName} (or --assets-dir to derive it). ${usageHint}`);
    return value;
}

// ---------------------------------------------------------------------------
// Filename derivation for the find-then-loop jobs
// ---------------------------------------------------------------------------

const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];

function kebabCase(s: string): string {
    return s
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function extractYearMonth(name: string): { year: string; month: string; remainder: string } | null {
    const yearMatch = name.match(/(\d{4})/);
    if (!yearMatch) return null;

    const lowerName = name.toLowerCase();
    const monthIndex = MONTHS.findIndex((month) => lowerName.includes(month));
    if (monthIndex === -1) return null;

    const year = yearMatch[1];
    const month = String(monthIndex + 1).padStart(2, '0');
    const remainder = name.replace(yearMatch[1], '').replace(new RegExp(MONTHS[monthIndex], 'i'), '');
    return { year, month, remainder };
}

function deriveProductCalendarFilename(name: string): string {
    const ym = extractYearMonth(name);
    if (ym) {
        const remainderKebab = kebabCase(ym.remainder);
        return `product-calendar-${ym.year}-${ym.month}${remainderKebab ? '-' + remainderKebab : ''}.json`;
    }
    return `product-calendar-${kebabCase(name)}.json`;
}

function deriveShopEventFilename(name: string, title: string | undefined): string {
    const ym = extractYearMonth(name);
    let base = ym ? `${ym.year}-${ym.month}` : kebabCase(name);
    if (title) base += `-${kebabCase(title)}`;
    return `${base}.json`;
}

// ---------------------------------------------------------------------------
// "run all" - fixed archival pass, writes every result to --output-dir
// ---------------------------------------------------------------------------

interface JobResult {
    name: string;
    ok: boolean;
    outputPath?: string;
    error?: string;
}

// Maps each fixed `runAll` job name to its destination path (relative to a tacticusplanner
// checkout root), used when `--planner-dir` is passed instead of dumping everything flat into
// `--output-dir`. Verified against the live tacticusplanner repo - see the extraction-mapping plan.
const PLANNER_DESTINATIONS: Record<string, string> = {
    abilities: 'src/fsd/4-entities/abilities/data/new-ability-data.json',
    crusade_shop: 'src/fsd/4-entities/shops/data/new-crusade-shop-data.json',
    guild_boss: 'src/fsd/4-entities/guild_boss/data/guild_boss.json',
    guild_shop: 'src/fsd/4-entities/shops/data/new-guild-shop.json',
    hero_quests: 'src/fsd/4-entities/quests/data/hero-quests.json',
    heroes: 'src/fsd/4-entities/character/data/new-character-data2.json',
    mows: 'src/fsd/4-entities/mow/data/new-mows-data2.json',
    mythic_quests: 'src/fsd/4-entities/mythic_quests/data/mythic-quests.json',
    rogue_trader: 'src/fsd/4-entities/shops/data/new-rogue-trader.json',
    traits: 'src/fsd/4-entities/traits/data/new-traits-data.json',
    war_shop: 'src/fsd/4-entities/shops/data/new-war-shop.json',
    recipe_data: 'src/fsd/4-entities/upgrade/data/new-recipe-data.json',
    rank_up_data: 'src/fsd/4-entities/character/data/new-rank-up-data.json',
    character_data: 'src/fsd/4-entities/character/data/new-character-data.json',
    campaign_data: 'src/fsd/4-entities/campaign/data/new-battle-data.json',
    le_data: 'src/fsd/1-pages/plan-lre/new-le-battle-data.json',
    mow_data: 'src/fsd/4-entities/mow/data/new-mow-data.json',
    npc_data: 'src/fsd/4-entities/npc/data/new-npc-data.json',
    equipment_data: 'src/fsd/4-entities/equipment/data/new-equipment-data.json',
    ability_icons: 'src/fsd/5-shared/ui/ability-icons.ts',
};

// The `calendars/data` directory is loaded via `import.meta.glob`, so any correctly-named file
// dropped in is picked up automatically - this just needs to match the `product_calendar_YYYY_MM`
// convention already used there (dropping the extractor's own `-calendar-seasonal-event` remainder).
function plannerProductCalendarPath(name: string): string {
    const ym = extractYearMonth(name);
    const base = ym ? `product_calendar_${ym.year}_${ym.month}` : `product_calendar_${kebabCase(name).replace(/-/g, '_')}`;
    return `src/fsd/4-entities/calendars/data/${base}.json`;
}

function writeJson(outputPath: string, value: unknown): string {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(value, null, 2));
    return outputPath;
}

function writeText(outputPath: string, content: string): string {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);
    return outputPath;
}

// ---------------------------------------------------------------------------
// Asset copying - `--planner-dir` mode only. Each extractor already resolves and embeds the
// on-disk-cased sprite filename into its generated JSON/.ts output (see sprite_lookup.ts usage in
// extract_character_data.ts/extract_npc_data.ts/extract_mow_data.ts/extract_recipe_data.ts/
// extract_ability_icons.ts), so rather than threading copy-instructions through every extractor's
// return type, this reads each job's own just-written output back and scans it for
// "snowprint_assets/<subfolder>/<file>.png" references. Equipment/relic icons are the one
// exception (no JSON field carries them - tacticusplanner derives the path from the id at
// runtime), so those come from a dedicated collector instead.
// ---------------------------------------------------------------------------

interface AssetRef {
    destRelPath: string; // relative to src/assets/images/snowprint_assets/
    sourceAbsPath: string | undefined;
}

function findAssetRefs(text: string, assetsDir: string): AssetRef[] {
    const refs: AssetRef[] = [];
    for (const m of text.matchAll(/snowprint_assets\/([^"'\\]+\.png)/g)) {
        const destRelPath = m[1];
        refs.push({ destRelPath, sourceAbsPath: path.join(assetsDir, 'sprites', path.basename(destRelPath)) });
    }
    return refs;
}

type AssetCopyStatus = 'copied' | 'unchanged' | 'skipped-existing' | 'missing-source';

// Default is fill-gaps-only: never touch a file that's already there, even if the source dump has
// a byte-different version (checked-in art can legitimately lag the latest data-mine without that
// being a bug this tool should silently "fix" on every run). Pass `refreshAssets: true` (the
// `--refresh-assets` flag) to instead overwrite whenever content actually differs.
function copyAssetIfNeeded(sourceAbsPath: string | undefined, destAbsPath: string, refreshAssets: boolean): AssetCopyStatus {
    if (!sourceAbsPath || !fs.existsSync(sourceAbsPath)) return 'missing-source';
    if (fs.existsSync(destAbsPath)) {
        if (!refreshAssets) return 'skipped-existing';
        if (fs.readFileSync(destAbsPath).equals(fs.readFileSync(sourceAbsPath))) return 'unchanged';
    }
    fs.mkdirSync(path.dirname(destAbsPath), { recursive: true });
    fs.copyFileSync(sourceAbsPath, destAbsPath);
    return 'copied';
}

function runJob(results: JobResult[], name: string, fn: () => string): void {
    try {
        const outputPath = fn();
        results.push({ name, ok: true, outputPath });
        console.log(`OK   ${name} -> ${outputPath}`);
    } catch (error: any) {
        results.push({ name, ok: false, error: error.message });
        console.error(`FAIL ${name}: ${error.message}`);
    }
}

function runAll(paths: ResolvedPaths, outputDir: string, plannerDir?: string, refreshAssets = false): void {
    const gameconfigPath = requireResolved(paths.gameconfigPath, 'gameconfig', '"all" mode requires --gameconfig or --assets-dir');
    const i2Path = requireResolved(paths.i2Path, 'i2', '"all" mode requires --i2 or --assets-dir');
    const globalConfigPath = paths.globalConfigPath;
    const assetsDir = paths.assetsDir;
    const visualsFilePath = paths.visualsFilePath;

    // Resolves where a fixed job's output should go: its mapped destination inside a
    // tacticusplanner checkout when --planner-dir is given, otherwise the flat --output-dir path.
    function resolvePath(jobName: string, filename: string): string {
        if (plannerDir) {
            const relPath = PLANNER_DESTINATIONS[jobName];
            if (!relPath) throw new Error(`No planner destination mapped for job "${jobName}"`);
            return path.join(plannerDir, relPath);
        }
        return path.join(outputDir, filename);
    }

    if (plannerDir) {
        fs.mkdirSync(plannerDir, { recursive: true });
    } else {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const results: JobResult[] = [];

    runJob(results, 'abilities', () =>
        writeJson(resolvePath('abilities', 'new-ability-data.json'), extractAbilities({ configPath: gameconfigPath, i2Path }))
    );

    runJob(results, 'crusade_shop', () =>
        writeJson(resolvePath('crusade_shop', 'new-crusade-shop-data.json'), getCrusadeShopData({ gameconfigPath }))
    );

    runJob(results, 'guild_boss', () => {
        if (!globalConfigPath) throw new Error('--global-config is required for guild_boss');
        return writeJson(resolvePath('guild_boss', 'guild_boss.json'), getGuildBossData({ globalConfigPath }));
    });

    runJob(results, 'guild_shop', () =>
        writeJson(resolvePath('guild_shop', 'new-guild-shop.json'), getGuildShopData({ gameconfigPath }))
    );

    runJob(results, 'hero_quests', () =>
        writeJson(resolvePath('hero_quests', 'hero-quests.json'), extractHeroQuests({ gameconfigPath }))
    );

    runJob(results, 'heroes', () =>
        writeJson(resolvePath('heroes', 'new-character-data2.json'), extractHeroes({ gameconfigPath }))
    );

    runJob(results, 'mows', () => writeJson(resolvePath('mows', 'new-mows-data2.json'), extractMows({ gameconfigPath })));

    runJob(results, 'mythic_quests', () =>
        writeJson(resolvePath('mythic_quests', 'mythic-quests.json'), extractMythicQuests({ gameconfigPath, i2Path }))
    );

    runJob(results, 'rogue_trader', () =>
        writeJson(resolvePath('rogue_trader', 'new-rogue-trader.json'), getRogueTraderData({ gameconfigPath }))
    );

    runJob(results, 'traits', () => writeJson(resolvePath('traits', 'new-traits-data.json'), extractTraits({ i2Path })));

    runJob(results, 'war_shop', () => writeJson(resolvePath('war_shop', 'new-war-shop.json'), getWarShopData({ gameconfigPath })));

    runJob(results, 'recipe_data', () =>
        writeJson(resolvePath('recipe_data', 'new-recipe-data.json'), extractRecipeData({ gameconfigPath, i2Path, assetsDir }))
    );

    runJob(results, 'rank_up_data', () =>
        writeJson(resolvePath('rank_up_data', 'new-rank-up-data.json'), extractRankUpData({ gameconfigPath }))
    );

    runJob(results, 'character_data', () => {
        if (!assetsDir) throw new Error('--assets-dir is required for character_data');
        if (!visualsFilePath) throw new Error('--visuals-file (or --assets-dir) is required for character_data');
        return writeJson(
            resolvePath('character_data', 'new-character-data.json'),
            extractCharacterData({ gameconfigPath, i2Path, assetsDir, visualsFilePath })
        );
    });

    runJob(results, 'campaign_data', () =>
        writeJson(resolvePath('campaign_data', 'new-campaign-data.json'), extractCampaignData({ gameconfigPath }))
    );

    runJob(results, 'le_data', () => writeJson(resolvePath('le_data', 'new-le-data.json'), extractLeData({ gameconfigPath })));

    // Find-then-loop: le_metadata
    try {
        const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
        const events = discoverLegendaryEvents(data);
        for (const [id, summary] of events) {
            runJob(results, `le_metadata:${id}`, () => {
                const eventData = extractLegendaryEventMetadata({ gameconfigPath, id, i2Path });
                const filename = `${id}-${kebabCase(summary.name)}.json`;
                const outputPath = plannerDir
                    ? path.join(plannerDir, 'src/fsd/4-entities/lre/data', filename)
                    : path.join(outputDir, filename);
                return writeJson(outputPath, eventData);
            });
        }
    } catch (error: any) {
        results.push({ name: 'le_metadata:discover', ok: false, error: error.message });
        console.error(`FAIL le_metadata:discover: ${error.message}`);
    }

    runJob(results, 'mow_data', () => {
        if (!assetsDir) throw new Error('--assets-dir is required for mow_data');
        return writeJson(resolvePath('mow_data', 'new-mow-data.json'), extractMowData({ gameconfigPath, assetsDir }));
    });

    runJob(results, 'npc_data', () => {
        if (!assetsDir) throw new Error('--assets-dir is required for npc_data');
        if (!visualsFilePath) throw new Error('--visuals-file (or --assets-dir) is required for npc_data');
        return writeJson(
            resolvePath('npc_data', 'new-npc-data.json'),
            extractNpcData({ gameconfigPath, assetsDir, visualsFilePath })
        );
    });

    let equipmentData: ReturnType<typeof extractEquipmentData> | undefined;
    runJob(results, 'equipment_data', () => {
        equipmentData = extractEquipmentData({ gameconfigPath });
        return writeJson(resolvePath('equipment_data', 'new-equipment-data.json'), equipmentData);
    });

    runJob(results, 'ability_icons', () => {
        if (!assetsDir) throw new Error('--assets-dir is required for ability_icons');
        return writeText(
            resolvePath('ability_icons', 'ability-icons.ts'),
            extractAbilityIcons({ gameconfigPath, i2Path, assetsDir, globalConfigPath })
        );
    });

    // Find-then-loop: product_calendars
    try {
        const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
        const calendars = discoverCalendars(data);
        for (const name of calendars.keys()) {
            runJob(results, `product_calendars:${name}`, () => {
                const calendarData = extractCalendar({ gameconfigPath, calendarName: name, i2Path });
                const outputPath = plannerDir
                    ? path.join(plannerDir, plannerProductCalendarPath(name))
                    : path.join(outputDir, deriveProductCalendarFilename(name));
                return writeJson(outputPath, calendarData);
            });
        }
    } catch (error: any) {
        results.push({ name: 'product_calendars:discover', ok: false, error: error.message });
        console.error(`FAIL product_calendars:discover: ${error.message}`);
    }

    // Find-then-loop: shop_event
    try {
        const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
        const events = discoverShopEvents(data);
        for (const name of events.keys()) {
            runJob(results, `shop_event:${name}`, () => {
                const eventData = extractShopEvent({ gameconfigPath, eventName: name, i2Path });
                const filename = deriveShopEventFilename(name, eventData.title);
                const outputPath = plannerDir
                    ? path.join(plannerDir, 'src/fsd/4-entities/shops/data', filename)
                    : path.join(outputDir, filename);
                return writeJson(outputPath, eventData);
            });
        }
    } catch (error: any) {
        results.push({ name: 'shop_event:discover', ok: false, error: error.message });
        console.error(`FAIL shop_event:discover: ${error.message}`);
    }

    // Find-then-loop: homescreen_event
    try {
        const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
        const events = discoverHomescreenEvents(data);
        for (const name of events.keys()) {
            runJob(results, `homescreen_event:${name}`, () => {
                const eventData = extractHomescreenEvent({ gameconfigPath, eventName: name, i2Path });
                const filename = `${kebabCase(name)}.json`;
                // No tacticusplanner destination is confirmed for these yet (plan-hse.tsx is a
                // static calculator today, not data-driven) - this follows the same
                // 4-entities/<domain>/data convention as everything else but, unlike
                // PLANNER_DESTINATIONS, hasn't been checked against the live repo.
                const outputPath = plannerDir
                    ? path.join(plannerDir, 'src/fsd/4-entities/homescreen_events/data', filename)
                    : path.join(outputDir, filename);
                return writeJson(outputPath, eventData);
            });
        }
    } catch (error: any) {
        results.push({ name: 'homescreen_event:discover', ok: false, error: error.message });
        console.error(`FAIL homescreen_event:discover: ${error.message}`);
    }

    // Find-then-loop: survival_event
    try {
        const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
        const events = discoverSurvivalEvents(data);
        for (const name of events.keys()) {
            runJob(results, `survival_event:${name}`, () => {
                const eventData = extractSurvivalEvent({ gameconfigPath, eventName: name, i2Path });
                const filename = `${kebabCase(name)}.json`;
                // No tacticusplanner destination is confirmed for these yet - follows the same
                // 4-entities/<domain>/data convention as everything else but, unlike
                // PLANNER_DESTINATIONS, hasn't been checked against the live repo.
                const outputPath = plannerDir
                    ? path.join(plannerDir, 'src/fsd/4-entities/survival/data', filename)
                    : path.join(outputDir, filename);
                return writeJson(outputPath, eventData);
            });
        }
    } catch (error: any) {
        results.push({ name: 'survival_event:discover', ok: false, error: error.message });
        console.error(`FAIL survival_event:discover: ${error.message}`);
    }

    // Find-then-loop: blessed_req_banner
    try {
        const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
        const banners = discoverBlessedReqBanners(data);
        for (const bannerId of banners.keys()) {
            runJob(results, `blessed_req_banner:${bannerId}`, () => {
                const bannerData = extractBlessedReqBanner({ gameconfigPath, bannerId, i2Path });
                const filename = `${kebabCase(bannerId)}.json`;
                // No tacticusplanner destination is confirmed for these yet - follows the same
                // 4-entities/<domain>/data convention as everything else but, unlike
                // PLANNER_DESTINATIONS, hasn't been checked against the live repo.
                const outputPath = plannerDir
                    ? path.join(plannerDir, 'src/fsd/4-entities/blessed_req_banners/data', filename)
                    : path.join(outputDir, filename);
                return writeJson(outputPath, bannerData);
            });
        }
    } catch (error: any) {
        results.push({ name: 'blessed_req_banner:discover', ok: false, error: error.message });
        console.error(`FAIL blessed_req_banner:discover: ${error.message}`);
    }

    // Asset copying only makes sense against a tacticusplanner checkout - --output-dir's flat
    // dump has no snowprint_assets/<subfolder> convention to target.
    if (plannerDir && assetsDir) {
        const assetRefs: AssetRef[] = [];
        for (const jobName of ['character_data', 'npc_data', 'mow_data', 'recipe_data', 'ability_icons']) {
            const job = results.find((r) => r.name === jobName);
            if (job?.ok && job.outputPath) {
                assetRefs.push(...findAssetRefs(fs.readFileSync(job.outputPath, 'utf-8'), assetsDir));
            }
        }
        const equipmentJob = results.find((r) => r.name === 'equipment_data');
        if (equipmentJob?.ok && equipmentData) {
            assetRefs.push(...collectEquipmentIconAssets(Object.keys(equipmentData), assetsDir));
        }

        const dedupedRefs = [...new Map(assetRefs.map((r) => [r.destRelPath, r])).values()];
        const assetResults = dedupedRefs.map((r) => ({
            ...r,
            status: copyAssetIfNeeded(
                r.sourceAbsPath,
                path.join(plannerDir, 'src/assets/images/snowprint_assets', r.destRelPath),
                refreshAssets
            ),
        }));

        console.log('');
        console.log('=== Assets ===' + (refreshAssets ? ' (--refresh-assets)' : ''));
        const copied = assetResults.filter((r) => r.status === 'copied');
        const unchanged = assetResults.filter((r) => r.status === 'unchanged');
        const skipped = assetResults.filter((r) => r.status === 'skipped-existing');
        const missing = assetResults.filter((r) => r.status === 'missing-source');
        console.log(
            `${copied.length} copied, ${unchanged.length} unchanged, ${skipped.length} already present (skipped), ${missing.length} missing source`
        );
        for (const r of copied) console.log(`  COPIED  ${r.destRelPath}`);
        for (const r of missing) console.log(`  MISSING ${r.destRelPath}`);
    }

    console.log('');
    console.log('=== Summary ===');
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    console.log(`${succeeded.length} succeeded, ${failed.length} failed`);
    for (const r of succeeded) console.log(`  OK   ${r.name} -> ${r.outputPath}`);
    for (const r of failed) console.log(`  FAIL ${r.name}: ${r.error}`);

    if (failed.length > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// "run one" - interactive/manual use, passes through each extractor's own
// options, prints the result to stdout instead of writing a file.
// ---------------------------------------------------------------------------

function printJson(value: unknown): void {
    console.log(JSON.stringify(value, null, 2));
}

const EXTRACTOR_NAMES = [
    'abilities', 'ability_icons', 'armageddon', 'campaign_data', 'ce_gold_medal_rewards', 'character_data',
    'crusade_shop', 'equipment_data', 'guild_boss', 'guild_shop', 'hero_quests', 'heroes', 'homescreen_event',
    'incursion_enemies', 'le_data', 'le_metadata', 'mow_data', 'mows', 'mythic_quests', 'npc_data', 'onslaught', 'pierce',
    'product_calendars', 'rank_up_data', 'real_money_products', 'recipe_data', 'rogue_trader', 'shop_event',
    'survival_events', 'survival_offers', 'traits', 'war_shop',
];

function runOne(name: string, flags: Record<string, string>, paths: ResolvedPaths): void {
    const format = flags.format ?? 'text';

    switch (name) {
        case 'abilities': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts abilities --gameconfig <p> --i2 <p> (or --assets-dir)');
            const i2 = requireResolved(paths.i2Path, 'i2', 'Usage: extract_all.ts abilities --gameconfig <p> --i2 <p> (or --assets-dir)');
            printJson(extractAbilities({ configPath: gc, i2Path: i2 }));
            return;
        }
        case 'ability_icons': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts ability_icons --gameconfig <p> --i2 <p> --assets-dir <p> [--global-config <p>]');
            const i2 = requireResolved(paths.i2Path, 'i2', 'Usage: extract_all.ts ability_icons --gameconfig <p> --i2 <p> --assets-dir <p> [--global-config <p>]');
            const assetsDir = requireResolved(paths.assetsDir, 'assets-dir', 'Usage: extract_all.ts ability_icons --gameconfig <p> --i2 <p> --assets-dir <p> [--global-config <p>]');
            console.log(extractAbilityIcons({ gameconfigPath: gc, i2Path: i2, assetsDir, globalConfigPath: paths.globalConfigPath }));
            return;
        }
        case 'armageddon': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts armageddon --gameconfig <p> [--format text|json] (or --assets-dir)');
            if (format === 'json') {
                printJson(extractArmageddon({ gameconfigPath: gc }));
            } else {
                const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
                console.log(formatArmageddonCsv(data));
            }
            return;
        }
        case 'blessed_req_banner': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts blessed_req_banner --gameconfig <p> --mode find|extract ... [--i2 <p>] (or --assets-dir)');
            const mode = requireFlag(flags, 'mode', 'Usage: extract_all.ts blessed_req_banner --gameconfig <p> --mode find|extract ...');
            const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
            const i2 = flags.i2 ?? paths.i2Path;
            if (mode === 'find') {
                console.log(formatBlessedReqBannerFindResults(data, i2, flags.glob));
                return;
            }
            const bannerId = requireFlag(flags, 'id', 'Usage: extract_all.ts blessed_req_banner --gameconfig <p> --mode extract --id <name> [--i2 <p>]');
            printJson(extractBlessedReqBanner({ gameconfigPath: gc, bannerId, i2Path: i2 }));
            return;
        }
        case 'campaign_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts campaign_data --gameconfig <p> (or --assets-dir)');
            printJson(extractCampaignData({ gameconfigPath: gc }));
            return;
        }
        case 'ce_gold_medal_rewards': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts ce_gold_medal_rewards --gameconfig <p> (or --assets-dir)');
            printJson(extractCeGoldMedalRewards({ gameconfigPath: gc }));
            return;
        }
        case 'character_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts character_data --gameconfig <p> --i2 <p> --assets-dir <p> [--visuals-file <p>]');
            const i2 = requireResolved(paths.i2Path, 'i2', 'Usage: extract_all.ts character_data --gameconfig <p> --i2 <p> --assets-dir <p> [--visuals-file <p>]');
            const assetsDir = requireResolved(paths.assetsDir, 'assets-dir', 'Usage: extract_all.ts character_data --gameconfig <p> --i2 <p> --assets-dir <p> [--visuals-file <p>]');
            const visualsFilePath = requireResolved(paths.visualsFilePath, 'visuals-file', 'Usage: extract_all.ts character_data --gameconfig <p> --i2 <p> --assets-dir <p> [--visuals-file <p>]');
            printJson(extractCharacterData({ gameconfigPath: gc, i2Path: i2, assetsDir, visualsFilePath }));
            return;
        }
        case 'crusade_shop': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts crusade_shop --gameconfig <p> [--pl <n>] [--mythic yes|no] [--tier ...] [--format text|json] (or --assets-dir)');
            const playerLevel = parsePlayerLevel(flags.pl);
            const hasMythic = parseHasMythic(flags.mythic);
            const tier = parseTier(flags.tier);
            const shop = getCrusadeShopData({ gameconfigPath: gc, playerLevel, hasMythic, tier });
            if (format === 'json') {
                printJson(shop);
            } else {
                const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
                console.log(formatCrusadeShopCsv(shop, data));
            }
            return;
        }
        case 'equipment_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts equipment_data --gameconfig <p> (or --assets-dir)');
            printJson(extractEquipmentData({ gameconfigPath: gc }));
            return;
        }
        case 'guild_boss': {
            const gcfg = requireResolved(paths.globalConfigPath, 'global-config', 'Usage: extract_all.ts guild_boss --global-config <p> [--summary] (or --assets-dir)');
            if ('summary' in flags) {
                console.log(summarizeActiveGuildBossSeason({ globalConfigPath: gcfg }));
            } else {
                printJson(getGuildBossData({ globalConfigPath: gcfg }));
            }
            return;
        }
        case 'guild_shop': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts guild_shop --gameconfig <p> [--format text|json] (or --assets-dir)');
            const shop = getGuildShopData({ gameconfigPath: gc });
            if (format === 'json') {
                printJson(shop);
            } else {
                const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
                console.log(formatGuildShopCsv(shop, data));
            }
            return;
        }
        case 'hero_quests': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts hero_quests --gameconfig <p> (or --assets-dir)');
            printJson(extractHeroQuests({ gameconfigPath: gc }));
            return;
        }
        case 'heroes': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts heroes --gameconfig <p> (or --assets-dir)');
            printJson(extractHeroes({ gameconfigPath: gc }));
            return;
        }
        case 'homescreen_event': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts homescreen_event --gameconfig <p> --mode find|extract ... [--i2 <p>] (or --assets-dir)');
            const mode = requireFlag(flags, 'mode', 'Usage: extract_all.ts homescreen_event --gameconfig <p> --mode find|extract ...');
            const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
            const i2 = flags.i2 ?? paths.i2Path;
            if (mode === 'find') {
                console.log(formatHomescreenEventFindResults(data, i2, flags.glob));
                return;
            }
            const eventName = requireFlag(flags, 'event', 'Usage: extract_all.ts homescreen_event --gameconfig <p> --mode extract --event <name> [--i2 <p>]');
            printJson(extractHomescreenEvent({ gameconfigPath: gc, eventName, i2Path: i2 }));
            return;
        }
        case 'incursion_enemies': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts incursion_enemies --gameconfig <p> (or --assets-dir)');
            printJson(extractIncursionEnemies({ gameconfigPath: gc }));
            return;
        }
        case 'le_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts le_data --gameconfig <p> (or --assets-dir)');
            printJson(extractLeData({ gameconfigPath: gc }));
            return;
        }
        case 'le_metadata': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts le_metadata --gameconfig <p> --mode find|extract ... [--i2 <p>] (or --assets-dir)');
            const mode = requireFlag(flags, 'mode', 'Usage: extract_all.ts le_metadata --gameconfig <p> --mode find|extract ...');
            const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
            if (mode === 'find') {
                console.log(formatLegendaryEventFindResults(data, flags.glob));
                return;
            }
            const id = requireFlag(flags, 'id', 'Usage: extract_all.ts le_metadata --gameconfig <p> --mode extract --id <n> [--i2 <p>]');
            printJson(extractLegendaryEventMetadata({ gameconfigPath: gc, id, i2Path: flags.i2 ?? paths.i2Path }));
            return;
        }
        case 'mow_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts mow_data --gameconfig <p> --assets-dir <p>');
            const assetsDir = requireResolved(paths.assetsDir, 'assets-dir', 'Usage: extract_all.ts mow_data --gameconfig <p> --assets-dir <p>');
            printJson(extractMowData({ gameconfigPath: gc, assetsDir }));
            return;
        }
        case 'mows': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts mows --gameconfig <p> (or --assets-dir)');
            printJson(extractMows({ gameconfigPath: gc }));
            return;
        }
        case 'mythic_quests': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts mythic_quests --gameconfig <p> --i2 <p> [--format text|json] [--ignore-missing-descriptions] (or --assets-dir)');
            const i2 = requireResolved(paths.i2Path, 'i2', 'Usage: extract_all.ts mythic_quests --gameconfig <p> --i2 <p> [--format text|json] [--ignore-missing-descriptions] (or --assets-dir)');
            const result = extractMythicQuests({
                gameconfigPath: gc,
                i2Path: i2,
                ignoreMissingDescriptions: 'ignore-missing-descriptions' in flags,
            });
            if (format === 'json') {
                printJson(result);
            } else {
                console.log(formatMythicQuestsText(result.quests));
            }
            return;
        }
        case 'npc_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts npc_data --gameconfig <p> --assets-dir <p> [--visuals-file <p>]');
            const assetsDir = requireResolved(paths.assetsDir, 'assets-dir', 'Usage: extract_all.ts npc_data --gameconfig <p> --assets-dir <p> [--visuals-file <p>]');
            const visualsFilePath = requireResolved(paths.visualsFilePath, 'visuals-file', 'Usage: extract_all.ts npc_data --gameconfig <p> --assets-dir <p> [--visuals-file <p>]');
            printJson(extractNpcData({ gameconfigPath: gc, assetsDir, visualsFilePath }));
            return;
        }
        case 'onslaught': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts onslaught --gameconfig <p> (or --assets-dir)');
            const result = extractOnslaught({ gameconfigPath: gc });
            if (format === 'json') {
                printJson(result.structuredData);
            } else {
                console.log(result.statsCsv);
            }
            return;
        }
        case 'pierce': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts pierce --gameconfig <p> (or --assets-dir)');
            printJson(extractPierce({ gameconfigPath: gc }));
            return;
        }
        case 'product_calendars': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts product_calendars --gameconfig <p> --mode find|extract ... (or --assets-dir)');
            const mode = requireFlag(flags, 'mode', 'Usage: extract_all.ts product_calendars --gameconfig <p> --mode find|extract ...');
            const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
            if (mode === 'find') {
                console.log(formatCalendarFindResults(data, flags.glob));
                return;
            }
            const calendarName = requireFlag(flags, 'calendar', 'Usage: extract_all.ts product_calendars --gameconfig <p> --mode extract --calendar <name>');
            const calendarData = extractCalendar({ gameconfigPath: gc, calendarName, i2Path: flags.i2 ?? paths.i2Path });
            if (format === 'json') {
                printJson(calendarData);
            } else {
                console.log(printCalendarText(calendarData, data));
            }
            return;
        }
        case 'rank_up_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts rank_up_data --gameconfig <p> (or --assets-dir)');
            printJson(extractRankUpData({ gameconfigPath: gc }));
            return;
        }
        case 'real_money_products': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts real_money_products --gameconfig <p> --glob_pattern <glob> (or --assets-dir)');
            const globPattern = requireFlag(flags, 'glob_pattern', 'Usage: extract_all.ts real_money_products --gameconfig <p> --glob_pattern <glob>');
            const matches = findRealMoneyProducts({ gameconfigPath: gc, globPattern });
            if (format === 'json') {
                printJson(matches);
            } else if (matches.length === 0) {
                console.log(`No products matched pattern: ${globPattern}`);
            } else {
                for (const m of matches) console.log(`${m.name}  category=${m.category}  price=${m.price}  rewards=${m.rewards}`);
            }
            return;
        }
        case 'recipe_data': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts recipe_data --gameconfig <p> --i2 <p> (or --assets-dir)');
            const i2 = requireResolved(paths.i2Path, 'i2', 'Usage: extract_all.ts recipe_data --gameconfig <p> --i2 <p> (or --assets-dir)');
            printJson(extractRecipeData({ gameconfigPath: gc, i2Path: i2, assetsDir: paths.assetsDir }));
            return;
        }
        case 'rogue_trader': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts rogue_trader --gameconfig <p> [--format text|json] (or --assets-dir)');
            const shop = getRogueTraderData({ gameconfigPath: gc });
            if (format === 'json') {
                printJson(shop);
            } else {
                const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
                console.log(formatRogueTraderCsv(shop, data));
            }
            return;
        }
        case 'shop_event': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts shop_event --gameconfig <p> --mode find|extract ... (or --assets-dir)');
            const mode = requireFlag(flags, 'mode', 'Usage: extract_all.ts shop_event --gameconfig <p> --mode find|extract ...');
            const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
            if (mode === 'find') {
                console.log(formatShopEventFindResults(data, flags.glob));
                return;
            }
            const eventName = requireFlag(flags, 'event', 'Usage: extract_all.ts shop_event --gameconfig <p> --mode extract --event <name> [--level L|M|H]');
            const level = parseLevel(flags.level);
            const eventData = extractShopEvent({ gameconfigPath: gc, eventName, i2Path: flags.i2 ?? paths.i2Path, level });
            if (format === 'json') {
                printJson(eventData);
            } else {
                console.log(printShopEventText(eventData, data, level));
            }
            return;
        }
        case 'survival_events': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts survival_events --gameconfig <p> --mode find|extract ... [--i2 <p>] (or --assets-dir)');
            const mode = requireFlag(flags, 'mode', 'Usage: extract_all.ts survival_events --gameconfig <p> --mode find|extract ...');
            const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
            if (mode === 'find') {
                console.log(formatSurvivalEventFindResults(data, flags.glob));
                return;
            }
            const eventName = requireFlag(flags, 'event', 'Usage: extract_all.ts survival_events --gameconfig <p> --mode extract --event <name> [--i2 <p>]');
            printJson(extractSurvivalEvent({ gameconfigPath: gc, eventName, i2Path: flags.i2 ?? paths.i2Path }));
            return;
        }
        case 'survival_offers': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts survival_offers --gameconfig <p> (or --assets-dir)');
            printJson(extractSurvivalOffers({ gameconfigPath: gc }));
            return;
        }
        case 'traits': {
            const i2 = requireResolved(paths.i2Path, 'i2', 'Usage: extract_all.ts traits --i2 <p> (or --assets-dir)');
            printJson(extractTraits({ i2Path: i2 }));
            return;
        }
        case 'war_shop': {
            const gc = requireResolved(paths.gameconfigPath, 'gameconfig', 'Usage: extract_all.ts war_shop --gameconfig <p> [--format text|json] (or --assets-dir)');
            const shop = getWarShopData({ gameconfigPath: gc });
            if (format === 'json') {
                printJson(shop);
            } else {
                const data = JSON.parse(fs.readFileSync(gc, 'utf-8'));
                console.log(formatWarShopCsv(shop, data));
            }
            return;
        }
        default:
            throw new Error(`Unknown extractor: ${name}. Run with "all" or one of: ${EXTRACTOR_NAMES.join(', ')}`);
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));

    if (!positional) {
        console.error('Usage: npx tsx extract_all.ts all --assets-dir <extracted-assets-root> [--output-dir /tmp/mined | --planner-dir <tacticusplanner-checkout>]');
        console.error(
            '       npx tsx extract_all.ts all --gameconfig <p> --i2 <p> [--global-config <p>] [--visuals-file <p>] [--output-dir /tmp/mined | --planner-dir <tacticusplanner-checkout>]'
        );
        console.error('       npx tsx extract_all.ts <extractor-name> --assets-dir <p> [extractor-specific flags]');
        console.error(`       (extractor-name is one of: ${EXTRACTOR_NAMES.join(', ')})`);
        console.error(
            '       (--assets-dir derives --gameconfig=<dir>/text_assets/GameConfig, --i2=<dir>/monobehaviour/I2Languages_en.json, --global-config=<dir>/text_assets/GlobalGameConfig, --visuals-file=<dir>/monobehaviour/visuals.csv - each individually overridable)'
        );
        console.error(
            '       (--planner-dir writes each result straight to its mapped destination inside that tacticusplanner checkout instead of a flat --output-dir dump; the two are mutually exclusive - --planner-dir wins if both are given)'
        );
        console.error(
            '       (--planner-dir also copies referenced portrait/round-portrait/ability/upgrade-material/equipment sprite PNGs into that checkout\'s src/assets/images/snowprint_assets/<subfolder>/ - this does not happen with --output-dir)'
        );
        console.error(
            '       (asset copying only fills in files that don\'t exist yet by default; pass --refresh-assets to also overwrite existing files whose content has changed in the source dump)'
        );
        process.exit(1);
    }

    try {
        const paths = resolveAllPaths(flags);

        if (positional === 'all') {
            const outputDir = flags['output-dir'] ?? '/tmp/mined';
            const plannerDir = flags['planner-dir'];
            const refreshAssets = flags['refresh-assets'] === 'true';
            runAll(paths, outputDir, plannerDir, refreshAssets);
        } else {
            runOne(positional, flags, paths);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
