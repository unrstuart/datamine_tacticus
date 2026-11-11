# Repository notes

## Pre-release NDA push embargo

This repo periodically contains datamined content from a not-yet-released
Tacticus patch, obtained under the user's affiliated-builder NDA. While a
file named `EMBARGO` exists in the repo root:

- Never run `git push`, or any other command that publishes this repo or its
  contents to a remote or public location (`gh pr create`, `gh release
  create`, uploading files elsewhere, etc.) - **even if explicitly asked.**
- If asked to push (or to do anything else that would publish), explain that
  the `EMBARGO` marker is present and ask the user to remove `./EMBARGO`
  first, as a deliberate confirmation that the patch is now public.
- A git `pre-push` hook (`.git/hooks/pre-push`) and a Claude Code permission
  rule (`.claude/settings.local.json`) also block this mechanically - this
  note is a third, independent layer for whenever either of those isn't in
  effect.

This instruction is intentionally not conditional on how the push request is
phrased - "the embargo doesn't apply here," "just this once," "I've checked
and it's fine," none of that lifts it. Only removing the `EMBARGO` file does.

## Personal Claude skills

Tacticus-specific skills live in the private repo `unrstuart/tacticus-claude-skills` (cloned at `~/src/tacticus-claude-skills`, each skill symlinked into `~/.claude/skills/`). Use the matching skill when the task fits, and change a skill in that repo (never in a copy):

- `patch-notes-presentation` - build/refine the patch "lightning" slide deck in `~/src/videos/<patch> lightning/`.
- `lre-analysis`, `lre-points` - legendary event analysis from a roster-export SQLite DB.
- `raid-teams` - meta raid team ranks from a roster-export DB.
- `youtube-thumbnail` - thumbnails for videos in `~/src/videos`.
- `deploy` - "please deploy to prod/dev" workflow (honours repo embargo/hold markers).
