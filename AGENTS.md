# Peach Daily News

This repository generates, validates, publishes, and emails the child-readable Peach Daily News issue and its hosted playback assets.

## Tooling

- Use Node.js 24 or newer with npm; install dependencies with `npm ci`.
- Playback generation also requires Python 3.12 and `edge-tts==7.2.8`.

## Verification

- Run `npm test` after changing code, workflow behavior, or editorial data.
- For a dated issue, generate it with `PEACH_NEWS_DATE=YYYY-MM-DD PEACH_NEWS_ENABLE_PLAYBACK=false node peach-daily-news.mjs --dry-run`, then run `PEACH_NEWS_DATE=YYYY-MM-DD npm run self-check`.

## Guidance

- Follow [README.md](README.md) for the content contract, commands, state files, and publishing workflow.
- Do not lower the minimum of two eligible stories from two independent sources, bypass semantic deduplication, or substitute stale and promotional material to force a send.
- Preserve the delivery order: generate, run the mandatory self-check, publish all four playback files, verify the hosted files byte-for-byte, send the email, then save state.
- Do not edit an already published `peach/YYYY-MM-DD/` issue by hand or clear `peach-news-state.json`; rerun the complete generation and validation flow instead.
- Keep credentials in GitHub Secrets and never commit SMTP passwords, GitHub tokens, or generated secret material.
