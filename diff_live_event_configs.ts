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
        console.error('Usage: npx ts-node diff_live_event_configs.ts --input1 <file1.json> --input2 <file2.json>');
        process.exit(1);
    }

    try {
        const data1 = JSON.parse(fs.readFileSync(input1, 'utf-8'));
        const data2 = JSON.parse(fs.readFileSync(input2, 'utf-8'));

        const events1: any[] = data1.clientGameConfig.liveEvents.idunLiveEventConfigs;
        const events2: any[] = data2.clientGameConfig.liveEvents.idunLiveEventConfigs;

        const names1 = new Set<string>(events1.map((e: any) => e.eventName));
        const names2 = new Set<string>(events2.map((e: any) => e.eventName));

        const onlyIn1 = events1.filter((e: any) => !names2.has(e.eventName));
        const onlyIn2 = events2.filter((e: any) => !names1.has(e.eventName));

        if (onlyIn1.length === 0 && onlyIn2.length === 0) {
            console.log('No differences found.');
            return;
        }

        if (onlyIn1.length > 0) {
            console.log(`Only in ${input1}:`);
            for (const e of onlyIn1) {
                const idx = events1.indexOf(e);
                console.log(`  ${idx}: ${e.eventName} (${e.eventType})`);
            }
        }

        if (onlyIn2.length > 0) {
            console.log(`Only in ${input2}:`);
            for (const e of onlyIn2) {
                const idx = events2.indexOf(e);
                console.log(`  ${idx}: ${e.eventName} (${e.eventType})`);
            }
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
