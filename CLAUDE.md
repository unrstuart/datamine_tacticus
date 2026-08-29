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
