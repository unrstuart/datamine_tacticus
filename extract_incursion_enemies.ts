import * as fs from 'fs';

export interface IncursionBattleEnemyCount {
    mow: string;
    tier: number;
    battleId: string;
    enemies: number;
}

export interface ExtractIncursionEnemiesParams {
    gameconfigPath: string;
}

export function extractIncursionEnemies({ gameconfigPath }: ExtractIncursionEnemiesParams): IncursionBattleEnemyCount[] {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));

    const ret: IncursionBattleEnemyCount[] = [];
    const mows = data.clientGameConfig.liveEvents.idunLiveEventConfigs[1094].mows;
    for (const key of Object.keys(mows)) {
        const incursion = mows[key];
        for (const tier of incursion.tiers) {
            for (const battle of tier.battles) {
                const hasMow = battle.enemies.some((enemy: string) => enemy.includes(incursion.unitId));
                ret.push({
                    mow: incursion.unitId,
                    tier: tier.index,
                    battleId: battle.battleId,
                    enemies: battle.enemies.length - (hasMow ? 1 : 0),
                });
            }
        }
    }
    return ret;
}
