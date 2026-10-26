// Forwards a player's request for their account to Snowprint's server. The page can't call that server itself (it sends no CORS
// headers), so this runs on the same origin as the app: the page sends the player's API key in X-API-KEY, this passes it on and
// returns the response. The key is only ever held for the length of the request: it is not stored or logged.

export const TACTICUS_PLAYER_URL = 'https://api.tacticusgame.com/api/v1/player';

const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function proxyPlayer(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
    if (request.method !== 'GET') return json(405, { error: 'Use GET.' });
    const key = request.headers.get('X-API-KEY')?.trim();
    if (!key) return json(400, { error: 'Send your player API key in the X-API-KEY header.' });

    let upstream: Response;
    try {
        upstream = await fetchImpl(TACTICUS_PLAYER_URL, { headers: { 'X-API-KEY': key, Accept: 'application/json' } });
    } catch {
        return json(502, { error: "Couldn't reach the Tacticus API." });
    }
    // Pass the answer through as it came, whatever the status, so the page can say what went wrong.
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' } });
}
