# Peach Daily News Cloud Scheduler

This Google Apps Script is an external cloud trigger for the repository's
GitHub Actions workflow. It is independent of the user's computer and targets only:

`babelovelg-stack/peach-daily-news-playback/.github/workflows/peach-daily-news.yml`

## Runtime design

- Primary one-shot trigger: 18:00 Asia/Shanghai.
- Backup one-shot trigger: 18:10 Asia/Shanghai.
- Hourly repair trigger: recreates missing future one-shot triggers only.
- Both dispatches pass `scheduled_trigger=true`; the Peach workflow's date gate
  and concurrency group prevent duplicate emails.
- `GITHUB_TOKEN` is stored only in Apps Script properties, never in this source.

## Installation

1. Add the fine-grained token to Script Properties as `GITHUB_TOKEN`.
2. Run `validatePeachConfiguration` and confirm it returns the active
   `.github/workflows/peach-daily-news.yml` workflow.
3. Run `installPeachCloudSchedule` once and authorize the requested Google
   scopes. Installation validates the workflow and creates triggers; it does
   not dispatch an email.
4. Run `peachCloudStatus` to verify the three trigger handlers and target dates.

Do not run `peachCloudPrimary` or `peachCloudBackup` manually during setup.
