import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// SharedArrayBuffer (the search's progress counters, read live by the page) needs a cross-origin isolated page. Whatever
// serves a build of this app has to send the same two headers.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
    plugins: [react()],
    server: { headers: isolation },
    preview: { headers: isolation },
    worker: { format: 'es' },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
