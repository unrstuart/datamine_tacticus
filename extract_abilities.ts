import * as fs from 'fs';

export type AttackRangeType = 'melee' | 'ranged';

interface IAbility {
    id: string;
    attackRangeType?: AttackRangeType;
    variables: Record<string, number[]>;
    constants: Record<string, string>;
    variablesAffectedByRarityBonus: string[];
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
        console.error('Usage: npx ts-node extract_abilities.ts --input <file.json> --output <result.json>');
        process.exit(1);
    }

    try {
        console.log(`Reading: ${inputPath}...`);
        const rawData = fs.readFileSync(inputPath, 'utf-8');
        const data = JSON.parse(rawData);

        const rawAbilities: Record<string, any> = data.clientGameConfig.units.abilities;

        const ret: IAbility[] = Object.entries(rawAbilities)
            .map(([id, ability]) => {
                return {
                    id: id,
                    attackRangeType:
                        ability.attackRangeType === 'Melee'
                            ? ('melee' as AttackRangeType)
                            : ability.attackRangeType === 'Ranged'
                              ? ('ranged' as AttackRangeType)
                              : undefined,
                    variables: ability.variables,
                    constants: ability.constants,
                    variablesAffectedByRarityBonus: ability.variablesAffectedByRarityBonus,
                };
            })
            .filter(unit => !!unit);

        fs.writeFileSync(outputPath, JSON.stringify(ret, null, 2));
        console.log(`Success! Extracted ${ret.length} matching nodes to ${outputPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
