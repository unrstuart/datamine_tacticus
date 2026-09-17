import * as fs from 'fs';
import * as path from 'path';

// Shared I2Languages helpers. loadI2Terms itself is duplicated near-verbatim across a dozen
// extract_*.ts files (each with its own private copy) - this doesn't retrofit those, just gives
// extract_l10n.ts (the first job that needs to load *every* language, not just one) a single
// place to live instead of adding a 13th copy.

interface I2Term {
    Term: string;
    Languages: string[];
}

export function loadI2Terms(i2Path: string): Map<string, string> {
    const raw = fs.readFileSync(i2Path, 'utf-8');
    const data = JSON.parse(raw);
    const terms: I2Term[] = data.mSource.mTerms;
    const map = new Map<string, string>();
    for (const term of terms) {
        if (term.Languages && term.Languages.length > 0) {
            map.set(term.Term, term.Languages[0]);
        }
    }
    return map;
}

export interface LocaleFile {
    code: string;
    path: string;
}

const I2LANGUAGES_FILE_RE = /^I2Languages_(.+)\.json$/i;

// Derives a directory-safe locale code from an I2Languages_<tag>.json filename's <tag>. Plain
// two-letter tags (de, en, fr, ...) pass through lowercased as-is. Hyphenated regional variants
// (es-US, pt-BR) collapse to their two-letter prefix, EXCEPT zh-CN: the game also ships a bare
// "zh" file distinct from "zh-CN" (simplified/mainland), so collapsing both to "zh" would silently
// drop one - zh-CN keeps its full tag, lowercased, as "zh-cn".
function localeCodeForTag(tag: string): string {
    if (tag.toLowerCase() === 'zh-cn') return 'zh-cn';
    const prefix = tag.split('-')[0];
    return prefix.toLowerCase();
}

// Scans <assetsDir>/monobehaviour/ for I2Languages_*.json files and returns one entry per
// available language, keyed by the two-letter-ish code above (unsorted - callers that care about
// order should sort by .code themselves).
export function listAvailableLocales(assetsDir: string): LocaleFile[] {
    const dir = path.join(assetsDir, 'monobehaviour');
    const locales: LocaleFile[] = [];
    for (const file of fs.readdirSync(dir)) {
        const match = file.match(I2LANGUAGES_FILE_RE);
        if (!match) continue;
        locales.push({ code: localeCodeForTag(match[1]), path: path.join(dir, file) });
    }
    return locales;
}
