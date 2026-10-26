// Asking for the player's account from this app's own /api/player (the worker in production, the dev server's proxy while
// developing), which forwards it to Snowprint with the key.

const KEY_STORAGE = 'raid-planner:api-key';

/** The minimal part of localStorage used here, so tests can pass a stand-in. */
export type KeyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The key saved on this device, or undefined if none is (or storage isn't available). The key isn't encrypted: it is only read-only account access. */
export function loadSavedKey(storage: KeyStorage = localStorage): string | undefined {
    try {
        return storage.getItem(KEY_STORAGE) || undefined;
    } catch {
        return undefined;
    }
}

export function saveKey(key: string, storage: KeyStorage = localStorage): void {
    try {
        storage.setItem(KEY_STORAGE, key);
    } catch {
        // Blocked storage just doesn't remember.
    }
}

export function clearSavedKey(storage: KeyStorage = localStorage): void {
    try {
        storage.removeItem(KEY_STORAGE);
    } catch {
        // Nothing to clear.
    }
}

export type FetchResult = { ok: true; data: unknown } | { ok: false; message: string };

export async function fetchPlayer(key: string, fetchImpl: typeof fetch = fetch): Promise<FetchResult> {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, message: 'Enter your player API key first.' };
    let response: Response;
    try {
        response = await fetchImpl('/api/player', { headers: { 'X-API-KEY': trimmed }, cache: 'no-store' });
    } catch {
        return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
    }
    if (response.ok) {
        try {
            return { ok: true, data: await response.json() };
        } catch {
            return { ok: false, message: "The server's answer wasn't readable. Try again in a moment." };
        }
    }
    const message =
        response.status === 401 || response.status === 403
            ? 'Snowprint rejected that key. Check you copied all of it, and that it is a player key with the Player scope.'
            : response.status === 429
              ? 'Too many requests to the Tacticus API. Wait a minute and try again.'
              : response.status === 400
                ? 'Enter your player API key first.'
                : response.status >= 500
                  ? 'The Tacticus API had a problem. Try again in a moment.'
                  : `The request failed (status ${response.status}).`;
    return { ok: false, message };
}
