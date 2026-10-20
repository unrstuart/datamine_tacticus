# tacticus-raidman.com

A React single-page app. Pages like `https://tacticus-raidman.com/public/replays/<hash>` return **404 to a plain HTTP fetch** (only `/` serves the shell and the router runs client-side), so you can't read them with curl/WebFetch. Use the API instead.

## Upload

`POST <api>/api/replay` with the raw replay text (the base64 string, unmodified) as the body.

- `content-type`: `text/plain` (the site sends `application/json` only if the body parses as JSON).
- Header `x-guild-tag: <tag>` files it under a guild; **omit it for an unlisted upload** (the site's "upload unlisted" does exactly this).
- No authentication was needed.
- Reply (JSON): `hash` (the id in the URL), `bossUnitId`/title, `mapId`, `gameMode`, `gameVersion`, `players`, `sortedTeam`, `alreadyUploaded` (true when the same replay was uploaded before), `message`.
- Replay URL = `https://tacticus-raidman.com/public/replays/<hash>`.
- Read back: `GET <api>/api/replay?hash=<hash>`.

`<api>` is a Lambda function URL the frontend calls (in `scripts/upload_replays.py` as `DEFAULT_API`). It can change when the site is redeployed. If uploads fail with 403/404, download `https://tacticus-raidman.com/` -> find the `assets/index-*.js` script tag -> fetch it and search for `/api/replay` to read the current base URL.

The frontend normalises some text before uploading (smart quotes to plain). Base64 replay files don't contain any, so posting the file as-is worked for all 27.

## Things to keep in mind

- Uploads are public by link and there is no delete in the API we used. Dry-run first (`upload_replays.py` without `--upload`).
- The replay's title on the site is `BattleConfiguration.Id` from inside the file; you can't set it.
- "Replaylist": the Raidman bundle has replay-list pages (library, guild, cluster, quest-chain lists) but we found no API for creating a list of your own. The "playlist" in this workflow is the gallery page, built from the upload CSV.
