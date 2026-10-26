import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// SharedArrayBuffer (the search's progress counters, read live by the page) needs a cross-origin isolated page. Whatever
// serves a build of this app has to send the same two headers.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

// In development (and in a local preview) the dev server plays the part of the worker's /api/player: it forwards the request,
// with the player's X-API-KEY header, to Snowprint's server.
const playerProxy = { '/api/player': { target: 'https://api.tacticusgame.com', changeOrigin: true, rewrite: () => '/api/v1/player' } };

export default defineConfig({
    plugins: [react()],
    server: { headers: isolation, proxy: playerProxy },
    preview: { headers: isolation, proxy: playerProxy },
    worker: { format: 'es' },
    test: { environment: 'node', include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
});
