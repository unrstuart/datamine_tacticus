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
