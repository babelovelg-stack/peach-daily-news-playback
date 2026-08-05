import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dailyNewsIssueQualityIssues } from "./peach-content-quality.mjs";

const DEFAULT_AUDIT_FILE = "peach-news-audit.json";

function requirementsFor(manifest = {}) {
  return {
    minimumNewsCount: 2,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 72,
    ...(manifest.requirements || {})
  };
}

export function validateNewsAuditManifest(manifest = {}) {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push("新闻自检清单版本无效");
  if (!manifest.generatedAt || !Number.isFinite(Date.parse(manifest.generatedAt))) errors.push("新闻自检清单缺少有效生成时间");
  if (!Array.isArray(manifest.issues) || !manifest.issues.length) return [...errors, "新闻自检清单没有日报内容"];

  const requirements = requirementsFor(manifest);
  for (const [index, issue] of manifest.issues.entries()) {
    const label = issue.dateKey || `第${index + 1}天`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.dateKey || "")) errors.push(`${label}的日报日期无效`);
    errors.push(...dailyNewsIssueQualityIssues({
      newsItems: issue.newsItems,
      recentNewsTitles: manifest.recentNewsTitles,
      asOf: issue.asOf,
      ...requirements
    }).map((problem) => `${label}：${problem}`));
  }
  return errors;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkNewsSourceLinks(manifest = {}, {
  fetchImpl = fetch,
  attempts = 2,
  timeoutMs = 12000
} = {}) {
  const errors = [];
  const links = [...new Set((manifest.issues || []).flatMap((issue) => issue.newsItems || []).map((item) => item.link).filter(Boolean))];

  for (const link of links) {
    let lastProblem = "unknown error";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(link, {
          method: "GET",
          redirect: "follow",
          headers: {
            "user-agent": "Mozilla/5.0 PeachDailyNewsSelfCheck/1.0",
            range: "bytes=0-2047"
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (response.ok || (response.status >= 200 && response.status < 400)) {
          lastProblem = "";
          break;
        }
        lastProblem = `HTTP ${response.status}`;
      } catch (error) {
        lastProblem = error?.message || String(error);
      }
      if (attempt < attempts) await wait(500 * attempt);
    }
    if (lastProblem) errors.push(`来源链接无法访问：${link}（${lastProblem}）`);
  }
  return errors;
}

async function main() {
  const auditFile = process.argv[2] || DEFAULT_AUDIT_FILE;
  const manifest = JSON.parse(await fs.readFile(auditFile, "utf8"));
  const contentErrors = validateNewsAuditManifest(manifest);
  if (contentErrors.length) throw new Error(`Mandatory news self-check failed:\n- ${contentErrors.join("\n- ")}`);

  const linkErrors = await checkNewsSourceLinks(manifest);
  if (linkErrors.length) throw new Error(`Mandatory news source check failed:\n- ${linkErrors.join("\n- ")}`);

  const storyCount = manifest.issues.reduce((count, issue) => count + issue.newsItems.length, 0);
  const sourceCount = new Set(manifest.issues.flatMap((issue) => issue.newsItems.map((item) => item.domain || item.publisher || item.feed))).size;
  console.log(`Mandatory news self-check passed: ${storyCount} stories, ${sourceCount} independent sources, all article links reachable.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
