import * as fs from 'fs';

const VERSIONS = ['1.36', '1.37', '1.38', '1.39', '1.40', '1.41'];
const TRACKS: Record<string, string> = {
    Imperial: 'treasure_beach_gold_imperial.csv',
    Xenos: 'treasure_beach_gold_xenos.csv',
    Chaos: 'treasure_beach_gold_chaos.csv',
};

interface Wave {
    round: number;
    enemies: { defaultGroup: string[] };
}

interface Battle {
    battleNr: number;
    waves: Wave[];
}

interface Tier {
    index: number;
    battles: Battle[];
}

interface Track {
    allowedGrandAlliance: string;
    tiers: Tier[];
}

function goldForEnemyEntry(entry: string, npc: Record<string, any>): number {
    const [name, indexStr] = entry.split(':');
    if (indexStr === undefined) return 0;
    const loot = npc[name]?.loot;
    const lootEntry = loot?.[parseInt(indexStr, 10) - 1];
    if (!lootEntry) return 0;
    const goldStr = lootEntry.find((s: string) => s.startsWith('gold:'));
    if (!goldStr) return 0;
    return parseInt(goldStr.split(':')[1], 10);
}

// battleNr -> total gold summed across all rounds
type GoldByVersion = Map<number, number>;

function extractTrackGold(gameconfigPath: string, allianceName: string): GoldByVersion {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const npc = data.clientGameConfig.units.npc;
    const tracks: Track[] = data.clientGameConfig.battles.treasureBeach.tracks;
    const track = tracks.find((t) => t.allowedGrandAlliance === allianceName);
    if (!track) throw new Error(`No track for alliance ${allianceName} in ${gameconfigPath}`);

    const result: GoldByVersion = new Map();
    for (const tier of track.tiers) {
        for (const battle of tier.battles) {
            const gold = battle.waves.reduce(
                (sum, wave) =>
                    sum +
                    wave.enemies.defaultGroup.reduce((s, entry) => s + goldForEnemyEntry(entry, npc), 0),
                0,
            );
            result.set(battle.battleNr, gold);
        }
    }
    return result;
}

// battleNr -> { sector, zone }, where sector is the JSON tier's `index`, and zone is the
// 1-based position of the battle within its sector (zone = battleNr - min(battleNr in sector) + 1).
function extractSectors(gameconfigPath: string, allianceName: string): Map<number, { sector: number; zone: number }> {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const tracks: Track[] = data.clientGameConfig.battles.treasureBeach.tracks;
    const track = tracks.find((t) => t.allowedGrandAlliance === allianceName)!;

    const battleInfo = new Map<number, { sector: number; zone: number }>();
    for (const tier of track.tiers) {
        const minBattleNr = Math.min(...tier.battles.map((b) => b.battleNr));
        for (const battle of tier.battles) {
            battleInfo.set(battle.battleNr, {
                sector: tier.index,
                zone: battle.battleNr - minBattleNr + 1,
            });
        }
    }
    return battleInfo;
}

for (const [alliance, outFile] of Object.entries(TRACKS)) {
    const perVersion = VERSIONS.map((v) => extractTrackGold(`gameconfig.${v}.json`, alliance));
    const battleInfo = extractSectors(`gameconfig.1.41.json`, alliance);

    const header = ['battleNr', 'sector', 'zone', ...VERSIONS.map((v) => `gold_${v}`)];
    const rows: string[] = [header.join(',')];

    const maxBattleNr = Math.max(...battleInfo.keys());
    for (let battleNr = 1; battleNr <= maxBattleNr; battleNr++) {
        const { sector, zone } = battleInfo.get(battleNr)!;
        const goldCells = perVersion.map((v) => {
            const gold = v.get(battleNr);
            return gold === undefined ? '' : String(gold);
        });
        rows.push([battleNr, sector, zone, ...goldCells].join(','));
    }

    fs.writeFileSync(outFile, rows.join('\n') + '\n');
    console.log(`Wrote ${outFile} (${rows.length - 1} rows)`);
}
