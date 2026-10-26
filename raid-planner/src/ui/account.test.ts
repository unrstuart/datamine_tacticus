import { describe, expect, it } from 'vitest';
import { fetchPlayer } from './account';

const respond = (status: number, body = '{}') => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('fetching the account', () => {
    it('sends the key (trimmed) to our own endpoint and returns the data', async () => {
        let call: { url: string; key: string | null } | undefined;
        const fake = (async (url: string, init: RequestInit) => {
            call = { url, key: new Headers(init.headers).get('X-API-KEY') };
            return new Response('{"player":{"units":[]}}', { status: 200 });
        }) as unknown as typeof fetch;
        const r = await fetchPlayer('  abc-123 ', fake);
        expect(call).toEqual({ url: '/api/player', key: 'abc-123' });
        expect(r).toEqual({ ok: true, data: { player: { units: [] } } });
    });

    it('says what went wrong in words', async () => {
        expect((await fetchPlayer('', respond(200))).ok).toBe(false);
        const messages = new Set<string>();
        for (const status of [400, 401, 403, 429, 500, 502, 418]) {
            const r = await fetchPlayer('k', respond(status));
            expect(r.ok).toBe(false);
            if (!r.ok) messages.add(r.message);
        }
        expect(messages.size).toBeGreaterThanOrEqual(5);
        const r401 = await fetchPlayer('k', respond(401));
        expect(!r401.ok && r401.message).toMatch(/rejected that key/);
    });

    it('survives the network failing and an answer that is not JSON', async () => {
        const down = (async () => {
            throw new Error('offline');
        }) as unknown as typeof fetch;
        const r = await fetchPlayer('k', down);
        expect(!r.ok && r.message).toMatch(/reach the server/);
        const bad = await fetchPlayer('k', respond(200, 'not json'));
        expect(!bad.ok && bad.message).toMatch(/readable/);
    });
});
