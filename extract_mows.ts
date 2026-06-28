import * as fs from 'fs';

interface IMoW {
    id: string;
    name: string;
    faction: string;
    alliance: string;
    abilities: string[];
    mythicAbilities: string[];
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
        console.error('Usage: npx ts-node extract_mows.ts --input <gameconfig.json> --output <result.json>');
        process.exit(1);
    }

    try {
        console.log(`Reading: ${inputPath}...`);
        const rawData = fs.readFileSync(inputPath, 'utf-8');
        const data = JSON.parse(rawData);

        const rawUnits: Record<string, any> = data.clientGameConfig.units.lineup;

        const ret: IMoW[] = Object.entries(rawUnits)
            .filter(([, unit]) => (unit.traits as string[])?.includes('MachineOfWar'))
            .map(([id, unit]) => ({
                id,
                name: unit.name,
                faction: unit.FactionId,
                alliance: unit.GrandAllianceId,
                abilities: unit.activeAbilities ?? [],
                mythicAbilities: unit.mythicAbilities ?? [],
            }));

        fs.writeFileSync(outputPath, JSON.stringify(ret, null, 2));
        console.log(`Success! Extracted ${ret.length} machines of war to ${outputPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
