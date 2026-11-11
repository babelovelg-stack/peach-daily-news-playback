#!/usr/bin/env bash
set -euo pipefail
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
if [ "$1" = 'publish' ]; then
  git add english/
else
  git add english-daily/state.json
fi
if ! git diff --cached --quiet; then git commit -m "English daily: $1"; fi
for attempt in 1 2 3 4; do
  if git push origin "HEAD:$GITHUB_REF_NAME"; then exit 0; fi
  git pull --rebase origin "$GITHUB_REF_NAME"
  sleep 2
done
echo 'Could not persist English delivery state' >&2
exit 1
