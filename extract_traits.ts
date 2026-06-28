import * as fs from 'fs';

interface ITrait {
    id: string;
    name: string;
    styledName: string;
    description: string;
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

const KNOWN_SUFFIXES = new Set(['Name', 'StyledName', 'Description']);

function main() {
    const flags = getArgs();
    const i2Path = flags.i2;
    const outputPath = flags.output;

    if (!i2Path || !outputPath) {
        console.error('Usage: npx ts-node extract_traits.ts --i2 <I2Languages_en.json> --output <result.json>');
        process.exit(1);
    }

    try {
        console.log(`Reading: ${i2Path}...`);
        const raw = fs.readFileSync(i2Path, 'utf-8');
        const data = JSON.parse(raw);

        const allTerms: { Term: string; Languages: string[] }[] = data.mSource.mTerms;
        const traitTerms = allTerms.filter(t => t.Term.startsWith('Traits/'));

        // Group by trait id, collecting suffix -> value
        const byTrait = new Map<string, Map<string, string>>();
        for (const term of traitTerms) {
            const withoutPrefix = term.Term.slice('Traits/'.length);
            const underscoreIdx = withoutPrefix.indexOf('_');
            if (underscoreIdx === -1) continue;
            const traitId = withoutPrefix.slice(0, underscoreIdx);
            const suffix = withoutPrefix.slice(underscoreIdx + 1);

            if (!byTrait.has(traitId)) byTrait.set(traitId, new Map());
            byTrait.get(traitId)!.set(suffix, term.Languages?.[0] ?? '');
        }

        const ret: ITrait[] = [];
        for (const [id, fields] of byTrait) {
            for (const suffix of fields.keys()) {
                if (!KNOWN_SUFFIXES.has(suffix)) {
                    console.error(`WARNING: unexpected field "${suffix}" on trait "${id}"`);
                }
            }

            const name = fields.get('Name');
            const styledName = fields.get('StyledName');
            const description = fields.get('Description');

            if (!name) console.error(`WARNING: missing Name for trait "${id}"`);
            if (!styledName) console.error(`WARNING: missing StyledName for trait "${id}"`);
            if (!description) console.error(`WARNING: missing Description for trait "${id}"`);

            ret.push({
                id,
                name: name ?? '',
                styledName: styledName ?? '',
                description: description ?? '',
            });
        }

        fs.writeFileSync(outputPath, JSON.stringify(ret, null, 2));
        console.log(`Success! Extracted ${ret.length} traits to ${outputPath}.`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
