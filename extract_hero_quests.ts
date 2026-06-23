import * as fs from 'fs';

// --- Types ---
interface StructuredReward {
    upgradeId: string;
    num: number;
    denom: number;
}

interface Loot {
    star1?: string;
    chanceOf?: string;
    reward?: StructuredReward;
}

interface Objective {
    ObjectiveType?: string;
    ObjectiveTarget?: string | number;
    Score?: number;
}

interface StructuredEnemy {
    name: string;
    progressionIndex: number;
}

interface Battle {
    battleNr?: string;
    deployedUnit?: string;
    lightningVictory?: number;
    enemies?: Array<string | StructuredEnemy>;
    loot?: Loot;
    Objectives?: Objective[];
}

interface Tier {
    index?: number;
    battles?: Battle[];
}

interface EventConfig {
    unitId?: string;
    trackingAdditionalData?: string;
    tiers?: Tier[];
    allowedFactions?: string[];
}

function getArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
            }
        }
    });
    return args;
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;
    const outputPath = flags.output;

    if (!inputPath || !outputPath) {
        console.error('Usage: npx ts-node extract_hero_quests.ts --input <file.json> --output <result.json>');
        process.exit(1);
    }

    try {
        console.log(`Reading: ${inputPath}...`);
        const rawData = fs.readFileSync(inputPath, 'utf-8');
        const data = JSON.parse(rawData);

        const configs: EventConfig[] = data.clientGameConfig?.liveEvents?.idunLiveEventConfigs || [];

        const filtered = configs
            .filter(config => {
                const relevantTiers = config.tiers?.slice(0, 6) || [];

                return relevantTiers.some(tier => {
                    return tier.battles?.every(battle => {
                        const unit = battle.deployedUnit || '';
                        const loot = battle.loot?.star1 || '';

                        // Matches "Something_LHE:123" AND "shards_Something"
                        const isLHE = /_LHE:\d+$/.test(unit);
                        const hasShards = loot.startsWith('shards_');

                        return isLHE && hasShards;
                    });
                });
            })
            .map(config => {
                let enemyFactions: string[] = [];

                try {
                    const tracking = JSON.parse(config.trackingAdditionalData || '{}');
                    if (tracking.enemyFaction) {
                        enemyFactions = [tracking.enemyFaction];
                    }
                } catch {}

                return {
                    unitId: config.unitId,
                    allowedFactions: config.allowedFactions,
                    enemyFactions,

                    tiers: (config.tiers || []).map(tier => ({
                        index: tier.index,

                        battles: (tier.battles || []).map(battle => ({
                            battleNr: battle.battleNr,
                            lightningVictory: battle.lightningVictory,

                            loot: {
                                reward: (() => {
                                    const comps = battle.loot?.chanceOf?.split('%') || [];
                                    const chance = comps[1]?.split('/');
                                    return {
                                        upgradeId: comps[0] || '(invalid)',
                                        num: parseFloat(chance[0]),
                                        denom: parseFloat(chance[1]),
                                    };
                                })(), // Placeholder for future reward parsing logic
                            },

                            enemies: battle.enemies?.map(enemy => {
                                const components = (enemy as string).split(':');
                                return {
                                    name: components[0],
                                    progressionIndex: parseInt(components[1], 10),
                                };
                            }),

                            objectives: battle.Objectives,
                        })),
                    })),
                };
            });

        fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2));
        console.log(`Success! Extracted ${filtered.length} matching nodes to ${outputPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
