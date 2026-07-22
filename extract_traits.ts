import * as fs from 'fs';

export interface ITrait {
    id: string;
    name: string;
    styledName: string;
    description: string;
}

const KNOWN_SUFFIXES = new Set(['Name', 'StyledName', 'Description']);

export interface ExtractTraitsParams {
    i2Path: string;
}

export function extractTraits({ i2Path }: ExtractTraitsParams): ITrait[] {
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

    return ret;
}
