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

export interface EventConfig {
    unitId?: string;
    trackingAdditionalData?: string;
    tiers?: Tier[];
    allowedFactions?: string[];
}

export interface ExtractHeroQuestsParams {
    gameconfigPath: string;
}

export function extractHeroQuests({ gameconfigPath }: ExtractHeroQuestsParams) {
    const rawData = fs.readFileSync(gameconfigPath, 'utf-8');
    const data = JSON.parse(rawData);

    const configs: EventConfig[] = data.clientGameConfig?.liveEvents?.idunLiveEventConfigs || [];

    return configs
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
}
