import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./.github/workflows/peach-daily-news.yml", import.meta.url), "utf8");
const cloudScheduler = readFileSync(new URL("./google-apps-script/Code.gs", import.meta.url), "utf8");

test("keeps the established delivery and recovery schedule", () => {
  for (const cron of [
    "0,10,20,30,40,50 10 * * *",
    "15 11 * * *",
    "15 13 * * *",
    "15 15 * * *",
    "30 16 * * *"
  ]) {
    assert.match(workflow, new RegExp(cron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("publishes playback assets inside the current repository", () => {
  assert.match(workflow, /site_dir="peach\/\$date_key"/);
  assert.match(workflow, /git add "\$site_dir"/);
  assert.doesNotMatch(workflow, /PEACH_PLAYBACK_DEPLOY_KEY/);
  assert.doesNotMatch(workflow, /git clone .*peach-daily-news-playback/);
});

test("points the external cloud scheduler to this repository", () => {
  assert.match(cloudScheduler, /repo: "peach-daily-news-playback"/);
  assert.match(cloudScheduler, /workflow: "peach-daily-news\.yml"/);
});
