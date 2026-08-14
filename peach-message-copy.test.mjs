import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./peach-daily-news.mjs", import.meta.url), "utf8");

function stringArraySize(name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(match, `missing ${name} array`);
  return [...match[1].matchAll(/^\s*"/gm)].length;
}

test("keeps the recent message-copy window smaller than both copy pools", () => {
  const limitMatch = source.match(/const RECENT_MESSAGE_COPY_MEMORY_LIMIT = (\d+);/);
  assert.ok(limitMatch, "missing bounded message-copy memory limit");

  const limit = Number(limitMatch[1]);
  assert.ok(limit < stringArraySize("encouragements"), "intro memory exhausts the intro copy pool");
  assert.ok(limit < stringArraySize("closingNotes"), "closing memory exhausts the closing copy pool");
  assert.match(
    source,
    /getRecentIds\(state, stateKey, \[\], RECENT_MESSAGE_COPY_MEMORY_LIMIT\)/,
    "selection must ignore state entries older than the bounded window"
  );
  assert.match(
    source,
    /const recentIntroTexts = new Set\(getRecentIds\(previousState, "recentIntroTexts", \[\], RECENT_MESSAGE_COPY_MEMORY_LIMIT\)\)/,
    "intro validation must use the same bounded window as selection"
  );
  assert.match(
    source,
    /const recentClosingTexts = new Set\(getRecentIds\(previousState, "recentClosingTexts", \[\], RECENT_MESSAGE_COPY_MEMORY_LIMIT\)\)/,
    "closing validation must use the same bounded window as selection"
  );
  assert.match(
    source,
    /mergeRecentIds\(state\.recentIntroTexts, \[encouragement\.fingerprint\], RECENT_MESSAGE_COPY_MEMORY_LIMIT\)/
  );
  assert.match(
    source,
    /mergeRecentIds\(state\.recentClosingTexts, \[closingNote\.fingerprint\], RECENT_MESSAGE_COPY_MEMORY_LIMIT\)/
  );
});
