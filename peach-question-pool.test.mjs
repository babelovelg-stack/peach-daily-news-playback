import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { newsQualityIssues } from "./peach-content-quality.mjs";

const source = fs.readFileSync(new URL("./peach-daily-news.mjs", import.meta.url), "utf8");
const curatedNews = JSON.parse(fs.readFileSync(new URL("./peach-curated-news.json", import.meta.url), "utf8"));

test("provides two independent stories across the September 18 rolling window", () => {
  const start = Date.parse("2026-09-17T18:00:00+08:00");
  const end = Date.parse("2026-09-18T18:00:00+08:00");
  const stories = curatedNews.filter((item) => Date.parse(item.published) > start && Date.parse(item.published) <= end);
  assert.ok(stories.length >= 2);
  assert.ok(new Set(stories.map((item) => item.publisher)).size >= 2);
  assert.ok(new Set(stories.map((item) => new URL(item.link).hostname)).size >= 2);
  assert.ok(stories.some((item) => item.published.startsWith("2026-09-17")));
  assert.ok(stories.some((item) => item.published.startsWith("2026-09-18")));
  for (const item of stories) {
    assert.deepEqual(newsQualityIssues({ sourceTitle: item.title, sourceDescription: item.description,
      title: item.kidTitle, summary: item.kidSummary, value: item.kidValue, impact: item.kidImpact }), []);
  }
});

test("provides two coherent independent stories inside the September 17 cutoff window", () => {
  const start = Date.parse("2026-09-16T18:00:00+08:00");
  const end = Date.parse("2026-09-17T18:00:00+08:00");
  const stories = curatedNews.filter((item) => Date.parse(item.published) > start && Date.parse(item.published) <= end);
  assert.ok(stories.length >= 2);
  assert.ok(new Set(stories.map((item) => item.publisher)).size >= 2);
  assert.ok(new Set(stories.map((item) => new URL(item.link).hostname)).size >= 2);
  for (const item of stories) {
    assert.deepEqual(newsQualityIssues({ sourceTitle: item.title, sourceDescription: item.description,
      title: item.kidTitle, summary: item.kidSummary, value: item.kidValue, impact: item.kidImpact }), []);
  }
});

test("provides a fossil preservation quiz that labels hypothetical evidence", () => {
  assert.ok(source.includes('"fossil-preservation-missing-evidence-1"'));
  assert.ok(source.includes("这是假设情境，不是报道中的四件标本记录"));
  assert.ok(/"fossil-preservation-missing-evidence-1"[\s\S]{0,2500}\n\s+4,\n\s+"comparative-evidence"/.test(source));
  assert.ok(source.includes("没有观察到，不等于原来不存在"));
});

test("provides two coherent independent stories inside the September 16 cutoff window", () => {
  const start = Date.parse("2026-09-15T18:00:00+08:00");
  const end = Date.parse("2026-09-16T18:00:00+08:00");
  const stories = curatedNews.filter((item) => Date.parse(item.published) > start && Date.parse(item.published) <= end);
  assert.ok(stories.length >= 2);
  assert.ok(new Set(stories.map((item) => item.publisher)).size >= 2);
  assert.ok(new Set(stories.map((item) => new URL(item.link).hostname)).size >= 2);
  for (const item of stories) {
    assert.deepEqual(newsQualityIssues({ sourceTitle: item.title, sourceDescription: item.description,
      title: item.kidTitle, summary: item.kidSummary, value: item.kidValue, impact: item.kidImpact }), []);
  }
});

test("provides a new peach-pigment interaction quiz with clearly labelled simulated data", () => {
  assert.match(source, /"peach-pigment-light-interaction-1"/);
  assert.match(source, /模拟数据，不是新闻中的实测数值/);
  assert.match(source, /"peach-pigment-light-interaction-1"[\s\S]{0,2500}\n\s+4,\n\s+"difference-comparison"/);
  assert.match(source, /4－2＝2，11－3＝8/);
});

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
