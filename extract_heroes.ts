import * as fs from 'fs';

interface MeleeAttack {
    hitCount: number;
    pierce: string;
}

interface RangedAttack {
    hitCount: number;
    pierce: string;
    range: number;
}

interface Stats {
    damage: number;
    armor: number;
    health: number;
    initialProgressionIndex: number;
}

interface IUnit {
    id: string;
    name: string;
    movement: number;
    activeAbilityId: string;
    passiveAbilityIds: string;
    traits: string[];
    itemSlots: string[];
    statIncreases: number[][];
    relicSlot: number;
    meleeAttack: MeleeAttack;
    rangedAttack?: RangedAttack;
    initialStats: Stats;
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

        const rawUnits: Record<string, any> = data.clientGameConfig.units.lineup;

        const ret: IUnit[] = Object.entries(rawUnits).map(([id, unit]) => {
            if ((unit.Movement ?? 0) === 0) return undefined;
            console.log(unit.name);
            return {
                id: id,
                name: unit.name,
                movement: unit.Movement ?? 0,
                activeAbilityId: unit.activeAbilities[0],
                passiveAbilityIds: unit.passiveAbilities[0],
                traits: unit.traits,
                itemSlots: unit.itemSlots,
                relicSlot: unit.itemSlotsRelic[0],
                initialStats: {
                    damage: unit.stats.Damage,
                    armor: unit.stats.FixedArmor,
                    health: unit.stats.Health,
                    initialProgressionIndex: unit.stats.ProgressionIndex,
                },
                statIncreases: unit.upgradesStatIncrease,
                meleeAttack: {
                    hitCount: unit.weapons[0].hits,
                    pierce: unit.weapons[0].DamageProfile,
                },
                rangedAttack:
                    unit.weapons.length < 2
                        ? undefined
                        : {
                              hitCount: unit.weapons[1].hits,
                              pierce: unit.weapons[1].DamageProfile,
                              range: unit.weapons[1].Range,
                          },
            };
        }).filter(unit => !!unit);

        fs.writeFileSync(outputPath, JSON.stringify(ret, null, 2));
        console.log(`Success! Extracted ${ret.length} matching nodes to ${outputPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
