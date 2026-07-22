import * as fs from 'fs';

// --- Types ---
interface Wave {
    enemies: string[];
    round: number;
    tier: string;
    waveId: number;
    weight: number;
}

interface ReducedWave {
    enemyCount: number;
    tyranidEnemyCount: number;
    weight: number;
}

interface Tier {
    isChallenge: number;
    tier: number;
    visualId: string;
}

interface Onslaught {
    tiers: Tier[];
    tierWaves: Wave[];
}

export interface StructuredTier {
    // round, wave[]
    waves: Record<number, ReducedWave[]>;
    visualId: string;
}

export interface ExtractOnslaughtParams {
    gameconfigPath: string;
}

export interface OnslaughtResult {
    structuredData: StructuredTier[];
    statsCsv: string;
}

export function extractOnslaught({ gameconfigPath }: ExtractOnslaughtParams): OnslaughtResult {
    const rawData = fs.readFileSync(gameconfigPath, 'utf-8');
    const data = JSON.parse(rawData);

    const configs: Onslaught = data.clientGameConfig?.battles?.onslaught || { tiers: [], tierWaves: [] };

    const structuredData: StructuredTier[] = configs.tiers.map(tier => ({
        visualId: tier.visualId,
        waves: configs.tierWaves
            .filter(wave => Number(wave.tier) === tier.tier)
            .reduce(
                (acc, wave) => {
                    const reduced: ReducedWave = {
                        enemyCount: wave.enemies.length,
                        tyranidEnemyCount: wave.enemies.filter(enemy => enemy.toLowerCase().startsWith('tyran'))
                            .length,
                        weight: wave.weight,
                    };
                    if (!acc[wave.round]) {
                        acc[wave.round] = [];
                    }
                    acc[wave.round].push(reduced);
                    return acc;
                },
                {} as Record<number, ReducedWave[]>
            ),
    }));

    const headers = [
        'Tier',
        'Wave',
        'Min Tyranid Count',
        'Average Tyranid Count',
        'Max Tyranid Count',
        'Expected Tyranid Count',
        'Min Total Enemy Count',
        'Average Total Enemy Count',
        'Max Total Enemy Count',
        'Expected Count of All Waves in Tier',
    ];
    const rows = [headers.join(',')];

    Object.entries(structuredData).forEach(([_, data]) => {
        Object.entries(data.waves).forEach(([wave, waves]) => {
            const tyranidCounts = waves.map(wave => wave.tyranidEnemyCount);
            const weights = waves.map(wave => wave.weight);
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);
            const expectedTyranidCount = tyranidCounts.reduce(
                (sum, count, idx) => sum + count * (weights[idx] / totalWeight),
                0
            );
            const enemyCounts = waves.map(wave => wave.enemyCount);
            const expectedEnemyCount = enemyCounts.reduce(
                (sum, count, idx) => sum + count * (weights[idx] / totalWeight),
                0
            );

            rows.push(
                `${data.visualId},${wave},${Math.min(...tyranidCounts)},${(
                    tyranidCounts.reduce((a, b) => a + b, 0) / tyranidCounts.length
                ).toFixed(
                    2
                )},${Math.max(...tyranidCounts)},${expectedTyranidCount.toFixed(2)},${Math.min(...enemyCounts)},${(
                    enemyCounts.reduce((a, b) => a + b, 0) / enemyCounts.length
                ).toFixed(2)},${Math.max(...enemyCounts)},${expectedEnemyCount.toFixed(2)}`
            );
        });
    });
    // Calculate total expected tyranid count per tier
    const tierExpectedTotals: Record<string, { tyranids: number; enemies: number }> = {};
    Object.entries(structuredData).forEach(([_, data]) => {
        let tierTotalTyranids = 0;
        let tierTotalEnemies = 0;
        Object.entries(data.waves).forEach(([_, waves]) => {
            const weights = waves.map(wave => wave.weight);
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);
            const tyranidCounts = waves.map(wave => wave.tyranidEnemyCount);
            const enemyCounts = waves.map(wave => wave.enemyCount);
            const expectedTyranidCount = tyranidCounts.reduce(
                (sum, count, idx) => sum + count * (weights[idx] / totalWeight),
                0
            );
            const expectedEnemyCount = enemyCounts.reduce(
                (sum, count, idx) => sum + count * (weights[idx] / totalWeight),
                0
            );
            tierTotalTyranids += expectedTyranidCount;
            tierTotalEnemies += expectedEnemyCount;
        });
        tierExpectedTotals[data.visualId] = { tyranids: tierTotalTyranids, enemies: tierTotalEnemies };
    });

    // Append tier total to last wave of each tier
    const rowsByTier: Record<string, number> = {};
    for (let i = rows.length - 1; i > 0; i--) {
        const parts = rows[i].split(',');
        const visualId = parts[0];
        if (!rowsByTier[visualId]) {
            rowsByTier[visualId] = i;
            rows[i] +=
                `,${tierExpectedTotals[visualId].tyranids.toFixed(2)},${tierExpectedTotals[visualId].enemies.toFixed(2)}`;
        }
    }

    return { structuredData, statsCsv: rows.join('\n') };
}
