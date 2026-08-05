import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

const EMAIL_TO = process.env.PEACH_NEWS_EMAIL_TO || "ctmt1412@qq.com";
const ARTIFACT_DIR = process.env.PEACH_NEWS_RESEND_DIR || "resend-artifact";
const PLAYBACK_URL = String(process.env.PEACH_NEWS_PLAYBACK_URL_OVERRIDE || "").trim();
const PLAYBACK_CACHE_KEY = String(process.env.PEACH_NEWS_PLAYBACK_CACHE_KEY || "").trim();
const MIN_PLAYBACK_AUDIO_BYTES = Number(process.env.PEACH_NEWS_MIN_PLAYBACK_AUDIO_BYTES || 12000);

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function patchPlaybackUrl(text, html) {
  if (!PLAYBACK_URL) return { text, html };

  const patchedText = text.includes("图文语音版：")
    ? text.replace(/(图文语音版：\n)[^\n]+/, `$1${PLAYBACK_URL}`)
    : `图文语音版：\n${PLAYBACK_URL}\n\n${text}`;

  const patchedHtml = /class="play-button"/.test(html)
    ? html.replace(/(<a class="play-button" href=")[^"]+(")/, `$1${escapeHtml(PLAYBACK_URL)}$2`)
    : html.replace(
        /(<div class="hero">[\s\S]*?<\/div>)/,
        `$1<div class="play-card"><p class="play-kicker">图文语音版</p><p class="play-title">点开听 Xiaoyi 女声播报。</p><a class="play-button" href="${escapeHtml(PLAYBACK_URL)}">点击播放图文语音版</a></div>`
      );

  return { text: patchedText, html: patchedHtml };
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeNewsTitle(value = "") {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, "")
    .replace(/^第\s*\d+\s*条小情报[：:]\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

function extractNewsTitlesFromText(text = "") {
  return [...String(text).matchAll(/^第\s*\d+\s*条小情报[：:]\s*(.+)$/gm)]
    .map((match) => normalizeNewsTitle(match[1]))
    .filter(Boolean);
}

function extractNewsTitlesFromHtml(html = "") {
  return [...String(html).matchAll(/第\s*\d+\s*条小情报[：:]\s*([^<\n]+)/g)]
    .map((match) => normalizeNewsTitle(match[1]))
    .filter(Boolean);
}

function stripHtml(value = "") {
  return decodeHtml(String(value))
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpeechText(value = "") {
  return String(value || "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\uFE0F\u200D]/g, "")
    .replace(/\bAI\b/gi, "人工智能")
    .replace(/\bAIGC\b/gi, "人工智能生成内容")
    .replace(/\b5G\b/gi, "五 G")
    .replace(/\b6G\b/gi, "六 G")
    .replace(/\bWi[- ]?Fi\b/gi, "无线网络")
    .replace(/\bGPS\b/gi, "全球定位系统")
    .replace(/\bApp\b/g, "应用")
    .replace(/(\d+)\s*℃/g, "$1 摄氏度")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "百分之 $1")
    .replace(/(\d+)\s*km/g, "$1 公里")
    .replace(/(\d+)\s*kg/g, "$1 千克")
    .replace(/(\d+)\s*cm/g, "$1 厘米")
    .replace(/(\d+)\s*mm/g, "$1 毫米")
    .replace(/[“”]/g, "")
    .replace(/[《》]/g, "")
    .replace(/[A-Za-z]+:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlaybackCoverageText(value = "") {
  return normalizeSpeechText(stripHtml(value))
    .replace(/[~～\s.。:：,，、；;！!？?【】\[\]（）()《》“”"']/g, "")
    .toLowerCase();
}

function validateUniqueNewsTitles(titles = [], label = "news") {
  const seen = new Set();
  const duplicates = [];
  for (const title of titles) {
    if (seen.has(title)) duplicates.push(title);
    seen.add(title);
  }
  if (duplicates.length) {
    throw new Error(`${label} has duplicate news titles: ${[...new Set(duplicates)].join(" / ")}`);
  }
}

function extractNewsPointTextsFromText(text = "") {
  return [...String(text).matchAll(/^-\s*(发生了什么|价值是什么|可能影响什么)[：:]\s*(.+)$/gm)]
    .map((match) => match[2].trim())
    .filter(Boolean);
}

function extractKnowledgeTextsFromText(text = "") {
  return [...String(text).matchAll(/^\d+\.\s*【[^】]+】(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function assertPlaybackCoverage(haystackRaw, needleRaw, label) {
  const needle = normalizePlaybackCoverageText(needleRaw);
  if (!needle) return;
  const haystack = normalizePlaybackCoverageText(haystackRaw);
  if (!haystack.includes(needle)) {
    throw new Error(`Playback content missing ${label}: ${String(needleRaw).slice(0, 80)}`);
  }
}

function playbackAssetUrl(pageUrl, fileName) {
  return new URL(fileName, pageUrl).href;
}

function playbackValidationUrl(url) {
  if (!PLAYBACK_CACHE_KEY) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("v", PLAYBACK_CACHE_KEY);
  return parsed.href;
}

async function fetchRequiredPlaybackText(url, label) {
  const response = await fetch(playbackValidationUrl(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function validateRemotePlaybackAudio(pageUrl) {
  const audioUrl = playbackValidationUrl(playbackAssetUrl(pageUrl, "audio.mp3"));
  let response = await fetch(audioUrl, { method: "HEAD", cache: "no-store" });
  let usedRangeGet = false;
  if (!response.ok) {
    response = await fetch(audioUrl, { cache: "no-store", headers: { Range: "bytes=0-2047" } });
    usedRangeGet = true;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch playback audio: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const contentRange = response.headers.get("content-range") || "";
  const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1] || 0);
  const contentLength = rangeTotal || Number(response.headers.get("content-length") || 0);
  if (!/^audio\//i.test(contentType) && !/mpeg|mp3/i.test(contentType)) {
    throw new Error(`Playback audio is not served as audio: ${contentType || "missing content-type"}`);
  }
  if (contentLength && contentLength < MIN_PLAYBACK_AUDIO_BYTES && !usedRangeGet) {
    throw new Error(`Playback audio is too small to be reliable: ${contentLength} bytes`);
  }
}

function validatePlaybackSpeechContent({ emailText, playbackHtml, speechText }) {
  const requiredItems = [
    ...extractNewsTitlesFromText(emailText),
    ...extractNewsPointTextsFromText(emailText),
    ...extractKnowledgeTextsFromText(emailText)
  ];

  if (/开场/.test(speechText)) {
    throw new Error("Playback speech must not contain the old label: 开场");
  }
  if (!/叮叮\s*[~～]?/.test(speechText)) {
    throw new Error("Playback speech must start with the cheerful cue: 叮叮~");
  }
  if (/今日探索题|昨天探索题|这一天的题目|今天的题目|明天公布参考答案|参考答案：明天公布|题目只展示/.test(speechText)) {
    throw new Error("Playback speech must not read the exploration quiz.");
  }
  if (/(^|[\s\n。！？!?])(发生了什么|价值是什么|可能影响什么)[。:：]/.test(speechText)) {
    throw new Error("Playback speech must not read the news point labels.");
  }

  for (const item of requiredItems.filter(Boolean)) {
    assertPlaybackCoverage(playbackHtml, item, "page item");
    assertPlaybackCoverage(speechText, item, "speech item");
  }
}

async function validatePlaybackPageMatchesEmail(text) {
  if (!PLAYBACK_URL) return;

  const emailTitles = extractNewsTitlesFromText(text);
  if (!emailTitles.length) return;
  validateUniqueNewsTitles(emailTitles, "Email");

  const response = await fetch(playbackValidationUrl(PLAYBACK_URL), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch playback page for validation: ${response.status} ${response.statusText}`);
  }

  const playbackHtml = await response.text();
  const playbackTitles = extractNewsTitlesFromHtml(playbackHtml);
  validateUniqueNewsTitles(playbackTitles, "Playback page");
  const missing = emailTitles.filter((title) => !playbackTitles.includes(title));
  if (playbackTitles.length !== emailTitles.length || missing.length) {
    throw new Error([
      "Playback page news mismatch.",
      `Email news count: ${emailTitles.length}.`,
      `Playback news count: ${playbackTitles.length}.`,
      missing.length ? `Missing in playback: ${missing.join(" / ")}` : ""
    ].filter(Boolean).join(" "));
  }

  await validateRemotePlaybackAudio(PLAYBACK_URL);
  const speechText = await fetchRequiredPlaybackText(playbackAssetUrl(PLAYBACK_URL, "speech.txt"), "playback speech");
  validatePlaybackSpeechContent({ emailText: text, playbackHtml, speechText });
}

function subjectFromText(text) {
  const date = text.match(/^日期：(.+)$/m)?.[1]?.trim();
  if (process.env.PEACH_NEWS_RESEND_SUBJECT_STYLE === "daily") {
    return `桃子宝贝的每日情报${date ? ` - ${date}` : ""}`;
  }
  return `更正 - 桃子宝贝的每日情报${date ? ` - ${date}` : ""}`;
}

async function sendEmail({ subject, text, html }) {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing SMTP env: ${missing.join(", ")}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.REPORT_EMAIL_FROM || process.env.SMTP_USER,
    to: EMAIL_TO,
    subject,
    text,
    html
  });
}

const textPath = path.join(ARTIFACT_DIR, "peach-daily-news.txt");
const htmlPath = path.join(ARTIFACT_DIR, "peach-daily-news.html");
const originalText = await fs.readFile(textPath, "utf8");
const originalHtml = await fs.readFile(htmlPath, "utf8");
const patched = patchPlaybackUrl(originalText, originalHtml);
await validatePlaybackPageMatchesEmail(patched.text);
const subject = process.env.PEACH_NEWS_RESEND_SUBJECT || subjectFromText(patched.text);

await fs.writeFile("peach-daily-news-resend.txt", patched.text, "utf8");
await fs.writeFile("peach-daily-news-resend.html", patched.html, "utf8");
await sendEmail({ subject, ...patched });
console.log(`Sent ${subject} to ${EMAIL_TO}`);
