import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./peach-daily-news.mjs", import.meta.url), "utf8");

test("provides a reviewed high-quality quiz for real-time hyperspectral imaging news", () => {
  assert.match(source, /"hyperspectral-realtime-validation-1"/);
  assert.match(source, /高光谱相机[\s\S]{0,5000}\n\s+4,\n\s+"comparative-evidence"/);
});
