import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dailyNewsIssueQualityIssues } from "./peach-content-quality.mjs";
import { isPublishedInNewsWindow, newsWindowBounds } from "./peach-news-window.mjs";
import { scienceIssueIssues, assertValidState } from './peach-science-mode.mjs';
import { validateQuestionQuality, validateKnowledgeQuality, museumEncyclopedia, approvedPlaybackDataForIssue } from './peach-daily-news.mjs';

const DEFAULT_AUDIT_FILE = "peach-news-audit.json";

function requirementsFor(manifest = {}) {
  return {
    minimumNewsCount: 2,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 24,
    ...(manifest.requirements || {})
  };
}

export function validateNewsAuditManifest(manifest = {}) {
  const errors = [];
  if (![1,2].includes(manifest.schemaVersion)) errors.push("新闻自检清单版本无效");
  if (!manifest.generatedAt || !Number.isFinite(Date.parse(manifest.generatedAt))) errors.push("新闻自检清单缺少有效生成时间");
  if (!Array.isArray(manifest.issues) || !manifest.issues.length) return [...errors, "新闻自检清单没有日报内容"];

  const requirements = requirementsFor(manifest);
  const questionSeen={texts:new Set(),concepts:new Set()}, knowledgeSeen=new Set(), dateSeen=new Set();
  const isV2=manifest.schemaVersion===2;
  if (isV2 && !['daily','test','merged-backfill'].includes(manifest.reportType)) errors.push('Unknown report type');
  const minimum=isV2 && manifest.reportType==='daily' ? 2 : 1;
  if (!Number.isInteger(requirements.minimumNewsCount) || requirements.minimumNewsCount<minimum || !Number.isInteger(requirements.minimumPublisherCount) || requirements.minimumPublisherCount<minimum) errors.push('Invalid news thresholds');
  for (const [index, issue] of manifest.issues.entries()) {
    const label = issue.dateKey || `第${index + 1}天`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.dateKey || "")) errors.push(`${label}的日报日期无效`);
    if(dateSeen.has(issue.dateKey)) errors.push('Duplicate issue date'); dateSeen.add(issue.dateKey);
    if(!Array.isArray(issue.newsItems)) {errors.push('Invalid news items');continue;}
    const mode=isV2 ? issue.contentMode : 'news';
    if(!['news','science'].includes(mode) || (!isV2 && issue.contentMode && issue.contentMode!=='news')) errors.push('Unknown or legacy science content mode');
    if(isV2) {
      const cutoff=new Date(issue.asOf);
      if(!Number.isFinite(+cutoff) || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(cutoff)!==issue.dateKey) errors.push('Invalid issue cutoff/date');
      const evidence=issue.selectionEvidence;
      if(!evidence || evidence.collectionSucceeded!==true || !Number.isSafeInteger(evidence.qualifiedCount) || evidence.qualifiedCount<0
        || !Array.isArray(evidence.qualified) || evidence.qualified.length!==evidence.qualifiedCount
        || !Array.isArray(evidence.candidates) || !Array.isArray(evidence.rejected)
        || evidence.candidates.length!==evidence.qualified.length+evidence.rejected.length) errors.push('Inconsistent selection count evidence');
      else {
        const all=[...evidence.qualified,...evidence.rejected];
        const ids=new Set(all.map(item=>item.candidateId));
        if(ids.has(undefined) || ids.size!==all.length || new Set(evidence.candidates.map(item=>item.candidateId)).size!==all.length || evidence.candidates.some(item=>!ids.has(item.candidateId))
          || evidence.rejected.some(item=>!Array.isArray(item.reasons)||!item.reasons.length)) errors.push('Invalid candidate/rejection evidence');
        if(!Array.isArray(evidence.feeds) || evidence.feeds.some(feed=>!['success','failed'].includes(feed.status) || !Number.isSafeInteger(feed.parsedCount) || feed.parsedCount<0)
          || !(evidence.feeds.some(feed=>feed.status==='success') || evidence.qualified.some(item=>item.origin==='curated'))) errors.push('Invalid successful collection evidence');
        else {
          const feedIds=new Set(evidence.feeds.map(feed=>feed.feedId));
          const curated=evidence.candidates.filter(item=>item.origin==='curated');
          const feedCandidates=evidence.candidates.filter(item=>item.origin==='feed');
          if(!Number.isSafeInteger(evidence.curatedCount) || evidence.curatedCount<0 || evidence.curatedCount!==curated.length
            || curated.length+feedCandidates.length!==evidence.candidates.length
            || evidence.feeds.some(feed=>typeof feed.feedId!=='string' || !feed.feedId)
            || feedIds.size!==evidence.feeds.length || feedCandidates.some(item=>!feedIds.has(item.feedId))
            || curated.some(item=>item.feedId!==undefined)
            || evidence.feeds.some(feed=>feed.parsedCount!==feedCandidates.filter(item=>item.feedId===feed.feedId).length || (feed.status==='failed' && feed.parsedCount!==0))) errors.push('Feed/curated parsed counts differ from candidate evidence');
        }
        if(all.some(item=>{
          const candidate=evidence.candidates.find(c=>c.candidateId===item.candidateId);
          return !candidate || ['title','link','published','origin','feedId'].some(key=>candidate[key]!==item[key]);
        })) errors.push('Candidate origin or content changed in qualification evidence');
        if(mode==='science' && evidence.feeds?.some(feed=>feed.transient)) errors.push('Unresolved transient source failure cannot become science');
        if(mode==='news' && (!evidence.qualifiedCount || issue.newsItems.some(item=>!evidence.qualified.some(q=>JSON.stringify(q.newsItem)===JSON.stringify(item))))) errors.push('Selected news differs from qualified evidence');
      }
      try {
        assertValidState(issue.previousState);
        errors.push(...validateQuestionQuality(issue.question,issue.previousState,label+'探索题',questionSeen));
        errors.push(...validateKnowledgeQuality(issue.knowledgeItems,issue.previousState,label+'百科'));
        for(const item of issue.knowledgeItems || []) {
          const key=item.conceptId || item.id;
          if(knowledgeSeen.has(key)) errors.push('Duplicate knowledge across merged dates');
          knowledgeSeen.add(key);
        }
        if(mode==='science') errors.push(...scienceIssueIssues(issue,undefined,museumEncyclopedia));
        approvedPlaybackDataForIssue(issue);
      } catch(error) { errors.push(`Invalid learning evidence: ${error.message}`); }
    }
    if(mode==='news') errors.push(...dailyNewsIssueQualityIssues({
      newsItems: issue.newsItems,
      recentNewsTitles: isV2 ? [...(issue.previousState?.recentNewsTitles || []),...(issue.previousState?.lastNewsTitles || [])] : manifest.recentNewsTitles,
      asOf: issue.asOf,
      ...requirements
    }).map((problem) => `${label}：${problem}`));

    if (Number.isFinite(Date.parse(issue.asOf))) {
      const { start } = newsWindowBounds(issue.asOf, requirements.maxAgeHours);
      if (issue.windowStart && Date.parse(issue.windowStart) !== start.getTime()) {
        errors.push(`${label}：新闻收集窗口起点与截止点不匹配`);
      }
      for (const [storyIndex, item] of (issue.newsItems || []).entries()) {
        if (Number.isFinite(Number(item.published)) && !isPublishedInNewsWindow(
          Number(item.published),
          issue.asOf,
          requirements.maxAgeHours
        )) {
          errors.push(`${label}：第${storyIndex + 1}条小情报不在滚动${requirements.maxAgeHours}小时收集窗口内`);
        }
      }
    }
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
  const links = [...new Set((manifest.issues || []).flatMap((issue) => [...(issue.newsItems || []), ...(issue.contentMode==='science' ? issue.knowledgeItems || [] : [])]).map((item) => item.link).filter(Boolean))];

  for (const link of links) {
    let lastProblem = "unknown error";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(link, {
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
      } finally {
        // Header-only checks must release Node fetch connections on every
        // status; cleanup failure must not replace the accessibility result.
        try { await response?.body?.cancel(); } catch {}
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
