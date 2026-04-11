import * as fs from 'fs';

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
        console.error('Usage: npx ts-node extract_pierce.ts --input <file.json> --output <result.json>');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
        console.log(`Reading: ${inputPath}...`);
        console.log(data.clientGameConfig.units.damageProfiles);
        const ret: Record<string, number> = Object.fromEntries(
            Object.entries(data.clientGameConfig.units.damageProfiles).map(
                ([id, tuple]) => [id, tuple['PiercingRatio']]
            )
        );

        console.log('ret: ', ret);
        fs.writeFileSync(outputPath, JSON.stringify(ret, null, 2));
        console.log(`Success! Extracted ${Object.keys(ret).length} matching nodes to ${outputPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
