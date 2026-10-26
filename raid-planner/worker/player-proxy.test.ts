import { describe, expect, it } from 'vitest';
import { TACTICUS_PLAYER_URL, proxyPlayer } from './player-proxy';

const request = (headers: Record<string, string> = {}, method = 'GET') => new Request('https://planner.example/api/player', { method, headers });

describe('the player proxy', () => {
    it("asks Snowprint's server with the key the page sent, and returns what it says", async () => {
        let seen: { url: string; key: string | null } | undefined;
        const fake = (async (url: string, init: RequestInit) => {
            seen = { url, key: new Headers(init.headers).get('X-API-KEY') };
            return new Response('{"player":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }) as unknown as typeof fetch;
        const response = await proxyPlayer(request({ 'X-API-KEY': ' secret ' }), fake);
        expect(seen).toEqual({ url: TACTICUS_PLAYER_URL, key: 'secret' });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ player: {} });
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('needs a key and a GET', async () => {
        const fake = (async () => new Response('x')) as unknown as typeof fetch;
        expect((await proxyPlayer(request(), fake)).status).toBe(400);
        expect((await proxyPlayer(request({ 'X-API-KEY': 'k' }, 'POST'), fake)).status).toBe(405);
    });

    it("passes on the server's refusal so the page can say what went wrong, and reports when it can't be reached", async () => {
        const refuse = (async () => new Response('{"error":"bad key"}', { status: 401, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
        const r = await proxyPlayer(request({ 'X-API-KEY': 'k' }), refuse);
        expect(r.status).toBe(401);
        expect(await r.json()).toEqual({ error: 'bad key' });
        const down = (async () => {
            throw new Error('network');
        }) as unknown as typeof fetch;
        expect((await proxyPlayer(request({ 'X-API-KEY': 'k' }), down)).status).toBe(502);
    });

    it('does not echo the key back', async () => {
        const fake = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
        const r = await proxyPlayer(request({ 'X-API-KEY': 'topsecret' }), fake);
        expect([...r.headers.entries()].join()).not.toContain('topsecret');
        expect(await r.text()).not.toContain('topsecret');
    });
});
