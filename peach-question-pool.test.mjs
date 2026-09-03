import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./peach-daily-news.mjs", import.meta.url), "utf8");
const curatedNews = JSON.parse(fs.readFileSync(new URL("./peach-curated-news.json", import.meta.url), "utf8"));

test("provides a reviewed high-quality quiz for real-time hyperspectral imaging news", () => {
  assert.match(source, /"hyperspectral-realtime-validation-1"/);
  assert.match(source, /高光谱相机[\s\S]{0,5000}\n\s+4,\n\s+"comparative-evidence"/);
});

test("provides two independent authoritative stories for September 3", () => {
  const stories = curatedNews.filter((item) => item.published.startsWith("2026-09-03"));
  assert.ok(stories.length >= 2);
  assert.ok(new Set(stories.map((item) => item.publisher)).size >= 2);
  assert.ok(stories.every((item) => /^https:\/\/(?:www\.)?(?:news\.cn|cas\.cn)\//.test(item.link)));
});

test("provides a reviewed high-quality quiz for quantum-memory scaling news", () => {
  assert.match(source, /"quantum-memory-scaling-evidence-1"/);
  assert.match(source, /量子随机存储器[\s\S]{0,5000}\n\s+4,\n\s+"difference-comparison"/);
});
