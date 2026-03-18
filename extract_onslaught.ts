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

interface StructuredTier {
    // round, wave[]
    waves: Record<number, ReducedWave[]>;
    visualId: string;
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
    const statsPath = flags.stats;

    if (!inputPath || !outputPath || !statsPath) {
        console.error(
            'Usage: npx ts-node extract_onslaught.ts --input <file.json> --output <result.json> --stats <file.csv>'
        );
        process.exit(1);
    }

    try {
        console.log(`Reading: ${inputPath}...`);
        const rawData = fs.readFileSync(inputPath, 'utf-8');
        const data = JSON.parse(rawData);

        const configs: Onslaught = data.clientGameConfig?.battles?.onslaught || { tiers: [], tierWaves: [] };
        console.log('Total tiers found:', configs.tiers.length);
        console.log('Total waves found:', configs.tierWaves.length);
        for (const tier of configs.tiers) {
            console.log(
                'found ',
                configs.tierWaves.filter(wave => Number(wave.tier) === tier.tier).length,
                ' waves for tier ',
                tier.tier
            );
        }
        const structuredData: StructuredTier[] = configs.tiers.map(tier => ({
            visualId: tier.visualId,
            waves: configs.tierWaves
                .filter(wave => Number(wave.tier) === tier.tier)
                .reduce(
                    (acc, wave) => {
                        const reduced: ReducedWave = {
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

        fs.writeFileSync(outputPath, JSON.stringify(structuredData, null, 2));
        console.log(`Success! Extracted ${structuredData.length} matching nodes to ${outputPath}.`);

        const headers = [
            'Tier',
            'Wave',
            'Min Tyranid Count',
            'Average Tyranid Count',
            'Max Tyranid Count',
            'Expected Tyranid Count',
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

                rows.push(
                    `${data.visualId},${wave},${Math.min(...tyranidCounts)},${(
                        tyranidCounts.reduce((a, b) => a + b, 0) / tyranidCounts.length
                    ).toFixed(2)},${Math.max(...tyranidCounts)},${expectedTyranidCount.toFixed(2)}`
                );
            });
        });
        // Calculate total expected tyranid count per tier
        const tierExpectedTotals: Record<string, number> = {};
        Object.entries(structuredData).forEach(([_, data]) => {
            let tierTotal = 0;
            Object.entries(data.waves).forEach(([_, waves]) => {
                const weights = waves.map(wave => wave.weight);
                const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                const tyranidCounts = waves.map(wave => wave.tyranidEnemyCount);
                const expectedTyranidCount = tyranidCounts.reduce(
                    (sum, count, idx) => sum + count * (weights[idx] / totalWeight),
                    0
                );
                tierTotal += expectedTyranidCount;
            });
            tierExpectedTotals[data.visualId] = tierTotal;
        });

        // Append tier total to last wave of each tier
        const rowsByTier: Record<string, number> = {};
        for (let i = rows.length - 1; i > 0; i--) {
            const parts = rows[i].split(',');
            const visualId = parts[0];
            if (!rowsByTier[visualId]) {
                rowsByTier[visualId] = i;
                rows[i] += `,${tierExpectedTotals[visualId].toFixed(2)}`;
            }
        }

        fs.writeFileSync(statsPath, rows.join('\n'));
        console.log(`Success! Extracted stats to ${statsPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
