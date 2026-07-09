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
    const input1 = flags.input1;
    const input2 = flags.input2;

    if (!input1 || !input2) {
        console.error('Usage: npx ts-node diff_merchant_events.ts --input1 <file1.json> --input2 <file2.json>');
        process.exit(1);
    }

    try {
        const data1 = JSON.parse(fs.readFileSync(input1, 'utf-8'));
        const data2 = JSON.parse(fs.readFileSync(input2, 'utf-8'));

        const merchants1 = new Set<string>(Object.keys(data1.clientGameConfig.shop.merchants));
        const merchants2 = new Set<string>(Object.keys(data2.clientGameConfig.shop.merchants));

        const onlyIn1 = [...merchants1].filter(k => !merchants2.has(k));
        const onlyIn2 = [...merchants2].filter(k => !merchants1.has(k));

        if (onlyIn1.length === 0 && onlyIn2.length === 0) {
            console.log('No differences found.');
            return;
        }

        if (onlyIn1.length > 0) {
            console.log(`Only in ${input1}:`);
            for (const key of onlyIn1) {
                console.log(`  ${key}`);
            }
        }

        if (onlyIn2.length > 0) {
            console.log(`Only in ${input2}:`);
            for (const key of onlyIn2) {
                console.log(`  ${key}`);
            }
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
