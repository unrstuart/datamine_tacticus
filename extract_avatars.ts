import * as fs from 'fs';
import { SpriteCopy, listSpritesWithPrefix } from './sprite_lookup';

// Player avatar sprites (ui_avatar_<id>.png) and avatar frame sprites (ui_avatar_frame_<name>.png),
// plus the frame id -> sprite lookup the GameConfig's frame id strings allow.

const FRAME_PREFIX = 'ui_avatar_frame_';

export interface AvatarAssets {
    avatars: SpriteCopy[];
    frames: SpriteCopy[];
}

/** Every avatar sprite and every frame sprite, filenames unchanged (the frames also match the `ui_avatar_` prefix, so they're split out). */
export function collectAvatarAssets(assetsDir: string): AvatarAssets {
    const avatars: SpriteCopy[] = [];
    const frames: SpriteCopy[] = [];
    for (const file of listSpritesWithPrefix(assetsDir, 'ui_avatar_')) {
        if (file.toLowerCase().startsWith(FRAME_PREFIX)) {
            frames.push({ destRelPath: `src/assets/avatar-frames/${file}`, sourceAbsPath: `${assetsDir}/sprites/${file}` });
        } else {
            avatars.push({ destRelPath: `src/assets/avatars/${file}`, sourceAbsPath: `${assetsDir}/sprites/${file}` });
        }
    }
    return { avatars, frames };
}

export interface FrameIndexResult {
    /** { "<frameId>": "<sprite filename>" } - only pairs that resolve to exactly one sprite. */
    index: Record<string, string>;
    /** Frame ids seen in the configs that matched no sprite (or more than one) - left out rather than guessed. */
    unresolvedIds: string[];
    /** Frame sprites no frame id resolved to (events not in any config given, creator/ambassador badges, ...). */
    unmappedFrameFiles: string[];
}

// Frame ids appear as the item in "avatarFrame_<frameId>[:n]" reward strings, e.g.
// "avatarFrame_frameOctober2026:1" or "avatarFrame_frameLoyalty_tier_corporal:1".
const FRAME_REWARD_RE = /avatarFrame_([A-Za-z0-9_]+)/g;

export function findFrameIds(gameconfigTexts: string[]): string[] {
    const ids = new Set<string>();
    for (const text of gameconfigTexts) {
        for (const m of text.matchAll(FRAME_REWARD_RE)) ids.add(m[1]);
    }
    return [...ids].sort();
}

// "frameOctober2026" and "ui_avatar_frame_october_2026.png" both reduce to "october2026" once the
// frame/tier prefix, case and underscores are dropped; that is the one rule used to pair them.
// ("frameLoyalty_tier_high_marshal" -> "highmarshal" pairs with the sprite named "highmarshal".)
function normalizeFrameId(id: string): string {
    return id.replace(/^frameLoyalty_tier_/, '').replace(/^frame/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeFrameFile(file: string): string {
    return file.slice(FRAME_PREFIX.length).replace(/\.png$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Pairs frame ids (from the given GameConfig files - pass older ones too, since events expire out
 * of the live config) with frame sprites. A frame id only gets an entry when it matches exactly one
 * sprite; anything ambiguous or unmatched is reported, never guessed.
 */
export function buildAvatarFrameIndex(gameconfigPaths: string[], frames: SpriteCopy[]): FrameIndexResult {
    const ids = findFrameIds(gameconfigPaths.map((p) => fs.readFileSync(p, 'utf-8')));

    const filesByKey = new Map<string, string[]>();
    for (const frame of frames) {
        const file = frame.destRelPath.slice(frame.destRelPath.lastIndexOf('/') + 1);
        const key = normalizeFrameFile(file);
        filesByKey.set(key, [...(filesByKey.get(key) ?? []), file]);
    }

    const index: Record<string, string> = {};
    const unresolvedIds: string[] = [];
    const used = new Set<string>();
    for (const id of ids) {
        const files = filesByKey.get(normalizeFrameId(id));
        if (files?.length === 1) {
            index[id] = files[0];
            used.add(files[0]);
        } else {
            unresolvedIds.push(id);
        }
    }

    const unmappedFrameFiles = frames
        .map((f) => f.destRelPath.slice(f.destRelPath.lastIndexOf('/') + 1))
        .filter((f) => !used.has(f))
        .sort();
    return { index, unresolvedIds, unmappedFrameFiles };
}
