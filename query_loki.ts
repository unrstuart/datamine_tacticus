#!/usr/bin/env node
// Discover + fetch the live Tacticus GlobalConfig. Flow credit: Ahriman dev (TableTheTable).
// Usage: LOKI_USER_ID=<your-tacticus-uuid> node loki-config.js > GlobalConfig.json
const USER_ID = process.env.LOKI_USER_ID;
if (!USER_ID) {
    console.error('set LOKI_USER_ID');
    process.exit(2);
}

// Any recent known hash works as a seed; the server tells you the real latest one.
const SEED_HASH = 'a6117d40ed0e8688a3dca497aa29e1e6';

async function discoverLatestHash() {
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
                userId: USER_ID,
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
        `https://api-live.loki.snowprintstudios.com/player/player2/userId/${encodeURIComponent(USER_ID)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new Error(`APP_START HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const hash =
        data?.eventResult?.eventResponseData?.latestGlobalGameConfigVersion ?? data?.latestGlobalGameConfigVersion;
    if (!hash) throw new Error('no latestGlobalGameConfigVersion in response');
    return hash;
}

async function main() {
    const hash = await discoverLatestHash();
    console.error(`latest hash: ${hash}`);
    const res = await fetch(`https://cdn.loki.snowprintstudios.com/config/global/GlobalConfig.${hash}.json`);
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    process.stdout.write(await res.text()); // full ~2MB config to stdout
}
main().catch(e => {
    console.error('FAILED:', e.message);
    process.exit(1);
});
