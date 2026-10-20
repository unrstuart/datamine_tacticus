# Deploying to Netlify

Only the built `index.html` goes up - deploy a folder that contains nothing else (not the raw replays, the CSV or the repo).

## Setup (once)

```bash
npm install -g netlify-cli        # npm may warn that install scripts for esbuild/sharp/unix-dgram didn't run; the CLI still works
netlify login                     # opens a browser; the user signs in. Don't ask for or handle their password/token.
netlify status                    # shows the account
netlify sites:list                # existing sites, with ids
```

Check `which netlify` first; it may already be installed.

## Deploy

Pass the site id and directory explicitly so nothing gets linked or written into a repo:

```bash
# draft: a preview URL, production untouched
netlify deploy --dir "<out_dir>" --site <site-id> --message "<short note>"

# production: replaces whatever the site serves now
netlify deploy --prod --dir "<out_dir>" --site <site-id> --message "<short note>"
```

- **One page per site.** A deploy replaces the whole site, so a second playlist must NOT go to a site that already serves another one. Before any deploy look at what the target serves (`curl -s <url> | grep -o '<title>[^<]*</title>'`); if it's a different page, create a new site (`netlify sites:create --name <name> --account-slug <team>`; names are global, so add a suffix if taken) and deploy there. The first Death Guard page and the Nubari quest page each have their own site for this reason.
- **Which site?** Ask. If the account has exactly one site with a random default name it is probably a placeholder, but it is still the user's call; creating a new named site (`netlify sites:create --name <name>`) is the alternative. Say plainly that `--prod` overwrites the site's current content.
- **Draft URLs may be login-protected.** On the account this was built with, an anonymous request to the draft URL got HTTP 401 "Login Redirect". So you can't verify a draft from the shell; ask the user to open it while signed in to Netlify.
- **Verify production** after deploying: `curl -sS -o /dev/null -w "%{http_code} %{size_download}\n" <url>` should give 200 and the byte size of `index.html`, and `grep -o "<title>[^<]*</title>"` the right title.
- The default `*.netlify.app` name is random (`starlit-blini-...`). Renaming is under Site configuration -> Change site name, and changes the URL - tell the user before they share it.
- Rolling back: the previous deploy stays in the site's Deploys list and can be restored there.
