#!/usr/bin/env node
// Discover + fetch the live Tacticus GlobalConfig. Flow credit: Ahriman dev (TableTheTable).
// Usage: node query_loki.ts > GlobalConfig.json
// Reads the account's userId from LOKI_USER_ID if set, otherwise from the local Tacticus
// install's own live-loki_user_data.json - see readLokiUserId(). Also importable from
// extract_all.ts (readLokiUserId/fetchLatestGlobalConfigText) for the live-fetch pre-step.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

// Any recent known hash works as a seed; the server tells you the real latest one.
const SEED_HASH = 'a6117d40ed0e8688a3dca497aa29e1e6';

export function readLokiUserId(): string {
    if (process.env.LOKI_USER_ID) return process.env.LOKI_USER_ID;

    const credPath = path.join(
        os.homedir(),
        'Library/Application Support/com.snowprintstudios.tacticus/live-loki_user_data.json'
    );
    let raw: string;
    try {
        raw = fs.readFileSync(credPath, 'utf-8');
    } catch (error: any) {
        throw new Error(
            `Couldn't read Loki credentials from "${credPath}" (${error.message}). Set LOKI_USER_ID or pass --global-config explicitly.`
        );
    }
    const userId = JSON.parse(raw)?.userId;
    if (!userId) throw new Error(`"${credPath}" has no "userId" field.`);
    return userId;
}

export async function discoverLatestHash(userId: string): Promise<string> {
    const payload = {
        playerEvent: {
            playerEventType: 'APP_START',
            playerEventData: {
                appId: 'loki',
                apiVersion: '0.1',
                os: 'Linux',
                deviceType: 'server',
                deviceName: 'scraper',
                deviceId: 'scraper',
                locale: 'en_US',
                userId,
                appVersion: '1.21.46.689',
                universeVersion: 'universe_not_needed',
                installId: 'scraper-installid',
                platform: 'Linux',
                store: 'Server',
                countryCode: 'US',
            },
            universeVersion: 'universe_not_needed',
            gameConfigVersion: SEED_HASH,
            createdOn: String(Date.now()),
            multiConfigVersion: 'e9aad1344fd7284448d52cedcea18251',
        },
        builtInMultiConfigVersion: '08407f913a5f030d1cca80f604e46f0d',
        installId: 'scraper-installid',
    };
    const res = await fetch(
        `https://api-live.loki.snowprintstudios.com/player/player2/userId/${encodeURIComponent(userId)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new Error(`APP_START HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const hash =
        data?.eventResult?.eventResponseData?.latestGlobalGameConfigVersion ?? data?.latestGlobalGameConfigVersion;
    if (!hash) throw new Error('no latestGlobalGameConfigVersion in response');
    return hash;
}

export async function fetchLatestGlobalConfigText(userId: string): Promise<{ hash: string; text: string }> {
    const hash = await discoverLatestHash(userId);
    const res = await fetch(`https://cdn.loki.snowprintstudios.com/config/global/GlobalConfig.${hash}.json`);
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    return { hash, text: await res.text() };
}

async function main() {
    const { hash, text } = await fetchLatestGlobalConfigText(readLokiUserId());
    console.error(`latest hash: ${hash}`);
    process.stdout.write(text); // full ~2MB config to stdout
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => {
        console.error('FAILED:', e.message);
        process.exit(1);
    });
}
