import { proxyPlayer } from './player-proxy';

// The app's Cloudflare Worker: /api/player forwards a player's account request to Snowprint (see player-proxy.ts); everything
// else is the built app, served from the assets binding.

interface Env {
    ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === '/api/player') return proxyPlayer(request);
        return env.ASSETS.fetch(request);
    },
};
