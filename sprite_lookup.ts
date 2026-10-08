import * as fs from 'fs';

// The C++ source does exact-case filename matching, which misses real files that exist on disk
// under different capitalization. This builds a case-insensitive lookup of a sprites directory
// instead, so callers can resolve the file that actually exists (with its real on-disk casing).
export function loadSpriteFilesByLowercaseName(spritesDir: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const file of fs.readdirSync(spritesDir)) {
        map.set(file.toLowerCase(), file);
    }
    return map;
}

export function resolveSpriteCaseInsensitive(spriteFiles: Map<string, string>, wantedFilename: string): string | undefined {
    return spriteFiles.get(wantedFilename.toLowerCase());
}

/** One sprite file to copy somewhere, e.g. into a tacops checkout (dest is relative to that checkout's root). */
export interface SpriteCopy {
    destRelPath: string;
    sourceAbsPath: string;
}

/** Every .png in `<assetsDir>/sprites` whose name (case-insensitively) starts with `prefix`, in name order. */
export function listSpritesWithPrefix(assetsDir: string, prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return fs
        .readdirSync(`${assetsDir}/sprites`)
        .filter((f) => f.toLowerCase().startsWith(lower) && f.toLowerCase().endsWith('.png'))
        .sort();
}

