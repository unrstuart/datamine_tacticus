import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';

// The data the raid planner needs about its six units, and the icons its character form shows.
//
//   npx tsx extract_raid_units.ts <gameconfig.json> <assets-dir> <data-dir> <public-dir>
//
// <assets-dir> is an extracted-assets root with sprites/. Writes
//   <data-dir>/units.json                { progression, units } (see below), to be imported by the app
//   <public-dir>/icons/rank/<n>.png         the rank medals, n = the planner's rank index (1 = Stone I ... 20 = Adamantine II)
//   <public-dir>/icons/star/<colour>.png    gold, red, blue stars and the Mythic wings
//   <public-dir>/icons/ability/<id>.png     each ability's icon
//
// A character's stats at a rank and star level are: its base stats plus the rank-up rows up to that rank (each row is
// [hp, hp, damage, damage, armor, armor]: two upgrades of each), all times the star step's unitStatMultiplierPct / 100.

const UNITS: Record<string, string> = {
    abaddon: 'blackAbaddon',
    ahriman: 'thousAhriman',
    abraxas: 'thousInfernalMaster',
    archimatos: 'blackPossession',
    neurothrope: 'tyranNeurothrope',
    zkar: 'thousDaemonPrince',
};
// Z'kar is a machine of war: the game fights with the summon (Phosis Z'Kar), which carries the weapons and traits.
const SUMMONS: Record<string, string> = { zkar: 'thousSmnDaemonPrince' };

// (The rarity badges, public/icons/rarity/<Rarity>.png, are the planner's own: tacticusplanner/src/assets/images/rarity/resized.)
const STAR_SPRITES: Record<string, string> = { gold: 'stars.png', red: 'star_epic.png', blue: 'star_legendary.png', wings: 'ui_icon_star_mythic_large_01.png' };
// Silver III was extracted under a different name; there is no Rank_11.png.
const RANK_SPRITE_OVERRIDES: Record<number, string> = { 11: 'IdunTextRRank_11.png' };

async function icon(spriteDir: string, files: Map<string, string>, name: string, dest: string, size: number): Promise<boolean> {
    const file = files.get(name.toLowerCase());
    if (!file) {
        console.log('PROBLEM no sprite', name);
        return false;
    }
    const image = await loadImage(path.join(spriteDir, file));
    const scale = Math.min(size / image.width, size / image.height, 1);
    const w = Math.round(image.width * scale);
    const h = Math.round(image.height * scale);
    const canvas = createCanvas(w, h);
    canvas.getContext('2d').drawImage(image, 0, 0, w, h);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, canvas.toBuffer('image/png'));
    return true;
}

async function main() {
    const [gameconfigPath, assetsDir, dataDir, outDir] = process.argv.slice(2);
    if (!gameconfigPath || !assetsDir || !dataDir || !outDir) {
        console.error('usage: extract_raid_units.ts <gameconfig.json> <assets-dir> <data-dir> <public-dir>');
        process.exit(2);
    }
    const client = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8')).clientGameConfig;
    const units = client.units;

    const progression = units.heroProgressionSteps.map((s: any) => ({ rarity: s.rarity, stars: s.stars, maxRank: s.maxRank, maxAbilityLevel: s.maxXpLevel, unitStatMultiplierPct: s.unitStatMultiplierPct, abilityStatMultiplierPct: s.abilityStatMultiplierPct }));
    const perUnitSteps = units.heroProgressionStepsPerUnit ?? {};

    // Each damage profile's pierce ratio: the share of a hit that gets through however much armor the target has (Psychic is 1).
    const pierce = Object.fromEntries(Object.entries<any>(units.damageProfiles).map(([profile, v]) => [profile, (v.PiercingRatio ?? 0) / 100]));

    const out: Record<string, unknown> = {};
    const abilityIds = new Set<string>();
    for (const [name, id] of Object.entries(UNITS)) {
        const u = units.lineup[id];
        if (!u) throw new Error(`no ${id} in the game config`);
        const summon = SUMMONS[name] ? units.summons[SUMMONS[name]] : undefined;
        const weapons = (summon ?? u).weapons ?? [];
        for (const a of [...(u.activeAbilities ?? []), ...(u.passiveAbilities ?? []), ...(u.mythicAbilities ?? [])]) abilityIds.add(a);
        out[name] = {
            id,
            name: u.name,
            movement: summon?.Movement ?? u.Movement ?? 0,
            traits: summon?.traits ?? u.traits ?? [],
            stats: { health: u.stats?.Health ?? 0, damage: u.stats?.Damage ?? 0, armor: u.stats?.FixedArmor ?? 0, progressionIndex: u.stats?.ProgressionIndex ?? 0 },
            // One row per rank-up, [hp, hp, damage, damage, armor, armor]; none for a machine of war.
            statIncreases: u.upgradesStatIncrease ?? [],
            weapons: weapons.map((w: any) => ({ hits: w.hits, profile: w.DamageProfile, ...(w.Range !== undefined ? { range: w.Range } : {}) })),
            progressionOverride: perUnitSteps[id] !== undefined,
        };
    }
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'units.json'), JSON.stringify({ progression, units: out, pierce, damageProfileModifiers: units.damageProfileModifiers }, null, 1));

    const spriteDir = path.join(assetsDir, 'sprites');
    const files = new Map(fs.readdirSync(spriteDir).map((f) => [f.toLowerCase(), f]));
    let n = 0;
    // The game's rank is 0-based (Stone I = 0); the planner's index is 1-based (Stone I = 1), so planner index n is sprite Rank_{n-1}.
    for (let rank = 1; rank <= 20; rank++) {
        const sprite = RANK_SPRITE_OVERRIDES[rank - 1] ?? `Rank_${rank - 1}.png`;
        n += (await icon(spriteDir, files, sprite, path.join(outDir, 'icons/rank', `${rank}.png`), 64)) ? 1 : 0;
    }
    for (const [colour, sprite] of Object.entries(STAR_SPRITES)) n += (await icon(spriteDir, files, sprite, path.join(outDir, 'icons/star', `${colour}.png`), colour === 'wings' ? 96 : 40)) ? 1 : 0;
    for (const id of abilityIds) n += (await icon(spriteDir, files, `ui_icon_ability2_${id}.png`, path.join(outDir, 'icons/ability', `${id}.png`), 64)) ? 1 : 0;
    console.log(`units.json -> ${dataDir}, ${n} icons -> ${outDir}/icons`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
