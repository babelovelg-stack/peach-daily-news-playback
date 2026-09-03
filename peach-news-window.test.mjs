import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  isPublishedInNewsWindow,
  newsWindowBounds,
  reportCutoffForDate,
  reportCutoffForInstant
} from "./peach-news-window.mjs";

test("anchors a selected report date to the configured Shanghai send hour", () => {
  assert.equal(
    reportCutoffForDate("2026-09-03", { timezone: "Asia/Shanghai", sendHour: 18 }).toISOString(),
    "2026-09-03T10:00:00.000Z"
  );
});

test("anchors a delayed run to the scheduled cutoff instead of the actual start minute", () => {
  assert.equal(
    reportCutoffForInstant(new Date("2026-09-03T10:17:00.000Z"), {
      timezone: "Asia/Shanghai",
      sendHour: 18
    }).toISOString(),
    "2026-09-03T10:00:00.000Z"
  );
});

test("uses the previous scheduled cutoff when a run starts before today's send hour", () => {
  assert.equal(
    reportCutoffForInstant(new Date("2026-09-03T09:59:59.000Z"), {
      timezone: "Asia/Shanghai",
      sendHour: 18
    }).toISOString(),
    "2026-09-02T10:00:00.000Z"
  );
});

test("uses a non-overlapping rolling 24-hour publication window", () => {
  const cutoff = new Date("2026-09-03T10:00:00.000Z");
  const bounds = newsWindowBounds(cutoff, 24);

  assert.equal(bounds.start.toISOString(), "2026-09-02T10:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-09-03T10:00:00.000Z");
  assert.equal(isPublishedInNewsWindow("2026-09-02T10:00:00.000Z", cutoff, 24), false);
  assert.equal(isPublishedInNewsWindow("2026-09-02T10:00:00.001Z", cutoff, 24), true);
  assert.equal(isPublishedInNewsWindow(Date.parse("2026-09-02T10:00:00.001Z"), cutoff, 24), true);
  assert.equal(isPublishedInNewsWindow("2026-09-03T10:00:00.000Z", cutoff, 24), true);
  assert.equal(isPublishedInNewsWindow("2026-09-03T10:00:00.001Z", cutoff, 24), false);
});

test("keeps the existing explicit window-length override", () => {
  const cutoff = new Date("2026-09-03T10:00:00.000Z");
  assert.equal(isPublishedInNewsWindow("2026-09-02T09:00:00.000Z", cutoff, 24), false);
  assert.equal(isPublishedInNewsWindow("2026-09-02T09:00:00.000Z", cutoff, 26), true);
});

test("wires the daily generator and self-check to the 24-hour default", async () => {
  const [generator, selfCheck] = await Promise.all([
    fs.readFile("peach-daily-news.mjs", "utf8"),
    fs.readFile("peach-news-self-check.mjs", "utf8")
  ]);

  assert.match(generator, /PEACH_NEWS_MAX_AGE_HOURS \|\| 24/);
  assert.match(generator, /isPublishedInNewsWindow\(item\.published, asOf, MAX_NEWS_AGE_HOURS\)/);
  assert.match(selfCheck, /maxAgeHours: 24/);
});
