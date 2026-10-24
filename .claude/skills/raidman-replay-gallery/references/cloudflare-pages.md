# Deploying to Cloudflare Pages

All playlists live on ONE Pages project, `kharnage-replays` (`https://kharnage-replays.pages.dev/<name>`), one HTML file per playlist. Cloudflare serves `/<name>.html` by redirecting to the clean `/<name>`; share the clean URL.

## The site folder is in the repo

The whole site lives in `kharnage_replays_site/` at the repo root and is version controlled:

```
kharnage_replays_site/
  kimm-quest.html  nubari-quest.html  death-guard-extremis.html     (~100 KB each)
  assets/
    img/<content-hash>.png|webp    portraits, ranks, stars, ability and reward icons, maps
    fonts/<hash>.woff2, fonts.css  Chakra Petch
```

Pages reference `assets/...` relatively and share the files: images are named by a hash of their bytes, so an icon used by several pages is one file. Build a page with `site_dir` and `page` in its config (`references/config.md`; configs are in `examples/`) and the builder writes the page and any new assets there. It only adds to `assets/`, so rebuilding or retiring a page can leave unreferenced files behind; if the folder gets bloated, delete `assets/img/` and rebuild every page from `examples/`. (The repo's `.gitignore` ignores `assets/` everywhere. The local copy has an exception for this folder, but `.gitignore` is not itself tracked, so on a fresh clone commit new assets with `git add -f kharnage_replays_site/assets`.)

A deploy replaces the whole site, so it always uploads the whole folder: never deploy one page on its own.

## Page names

- Quests: `<name>-quest.html` - the quest's hero or event name, e.g. `kimm-quest.html`, `nubari-quest.html`.
- Campaign-event Extremis playthroughs: `<enemy-faction-name>-extremis.html`, e.g. `death-guard-extremis.html`.
- Anything else: `<event>-<kind>.html`, lowercase and hyphenated. Ask the user if it isn't clear.

Re-publishing a page means rebuilding it into the site folder and redeploying; a name is a URL people may have shared, so don't rename without telling the user.

## Setup (once)

```bash
npx wrangler login            # opens a browser; the user signs in. Don't ask for or handle their password/token.
npx wrangler whoami
npx wrangler pages project list
```

The project already exists. If it ever has to be recreated, the user does it (`npx wrangler pages project create kharnage-replays --force`, production branch `main`).

**`--force` is required.** Wrangler 4.152 delegates `pages` commands to a Workers deploy that fails here ("Missing entry-point to Worker script or to assets directory"); `--force` runs the classic Pages flow. Re-check if a later wrangler changes this.

## Deploy

```bash
cd <repo>/kharnage_replays_site
# preview: any branch other than main; production untouched
npx wrangler pages deploy . --project-name kharnage-replays --branch preview --force
# production: replaces the live site
npx wrangler pages deploy . --project-name kharnage-replays --branch main --force
```

- Deploy a **preview** first and let the user look at it; production is a separate yes. A preview URL is `https://<branch>.kharnage-replays.pages.dev/<name>`. Its TLS certificate can take a while, so `curl` may fail with a handshake error for the first minutes; have the user open it in a browser.
- Verify production with `curl -sSL -o /dev/null -w "%{http_code} %{size_download} %{url_effective}\n" https://kharnage-replays.pages.dev/<name>.html` (`-L`: it 308-redirects to `/<name>`). Expect 200 and the file's byte size, and grep the `<title>`.
- Rolling back: earlier deployments stay listed in the Cloudflare dashboard (Workers & Pages -> kharnage-replays) and can be promoted.
- Other projects in the account (e.g. `puzzle-log`) are not ours; never deploy to them.
