# Peach Daily News

[中文](#中文) | [English](#english)

<a id="中文"></a>

## 中文

### 项目简介

本仓库完整承载“桃子宝贝每日情报”：资讯采集、儿童内容改写、质量门禁、探索题与百科状态、邮件生成、Xiaoyi 语音、字幕、静态播放页、GitHub Pages 发布、线上文件校验和邮件发送都在这里完成。

它既是生成项目，也是静态播放站。每日内容只有在全部质量检查和线上播放文件校验通过后才会发送。

### 不可降低的内容与质量约束

正常模式每期最多 5 条新闻，不把 5 条当作配额；至少需要 2 条合格新闻和 2 个独立来源。完整且来源多样的人工编辑稿不会再用低置信度抓取稿补足数量。同一来源默认最多入选 2 条。新闻默认按相邻推送截止点之间的滚动 24 小时收集；北京时区的默认推送截止点是 18:00，因此窗口从前一天 18:00 之后开始，到当天 18:00 为止，不按自然日的 00:00–24:00 切分。测试模式使用更小样本，但不绕过质量规则。

每条新闻必须包含：

- 清楚且忠于来源的标题。
- “发生了什么”“价值是什么”“可能影响什么”三层解释。
- 来源名称、发布时间和可供大人核对的原文链接。
- 适合孩子理解、但不歪曲事实的表达。

自动门禁会拒绝：

- 展会广告、市场炒作、研学推广、地方形象宣传和低价值统计。
- 与标题不一致、地区错配、主题漂移或套用通用模板的解释。
- 超出政治、科技、社会公共利益和重大国际事务范围的低价值资讯。
- 来源过旧、链接不可达、来源过度集中或语义重复的新闻。
- 与近期已发送新闻、百科或探索题重复的内容和知识点。
- 新闻数量、来源多样性、百科数量或题目质量不足的整期内容。

门禁失败时工作流必须停止，不能为了按时发信而编造新闻、降低标准或复用近期内容。

### 唯一的零新闻科普例外

采集成功且逐条通过时效、儿童适宜性、具体解释、语义质量、来源与去重检查的新闻恰好为 **0 条** 时，当期使用“儿童科学知识版”。只有 1 条时仍是新闻版，正常日报依然必须满足 2 条／2 来源；测试与合并补发保留原有 1 条／1 来源门槛。成功解析的空 feed 可以证明零候选；所有 feed 失败时，只有真正合格的新鲜人工稿才能维持新闻模式，旧 JSON 不能掩盖采集失败。临时超时、429 或 5xx 重试后未解决，不得被当作零新闻质量结论。

科普版只用 3 条科学知识替换原来的 3 条百科，并明确说明本期没有合格新闻；不伪装成新闻或新发现、不出现空新闻卡片。`peach-science-catalog.json` 有 152 个独立概念，逐条保留 NASA、NOAA、USGS 的具体来源及核对日期；每期覆盖 3 个不同主主题，保持 45 期／135 条排除窗口，并映射旧百科 ID、文本与语义。来源链接保留在邮件和页面，不朗读网址。目录损坏、来源不通或库存不足时停止，不清空历史。

探索题优先采用合格的新闻关联题，次级后备池提供 24 个不同推理概念（16 类计算、8 类实验与证据），使用标明“模拟数据”的有界数值变体；不依赖 LLM 或新增密钥。14 个近期概念和长文本去重、原质量验证及选项轮换不变。回归测试覆盖真实状态起点的连续 60 期科普和 400 个日期选题，并独立重算全部数值题答案。它提高库存可靠性，但不保证采集、语音、发布或 SMTP 永远成功，也不以科普掩盖这些错误。

审计 schema 2 保存逐日模式、候选／拒绝理由、合格数量、来源及相关学习历史；每个 feed 的解析数量和人工稿数量都必须与候选清单分别对账。科普与旧百科使用双向概念映射，切回新闻版也不能重讲 135 条窗口内的同一知识。发送器重新对照受信目录与审计校验正文，再验证四资产的 SHA-256、日期、模式与事实；朗读稿必须完整等于受信开场／结尾模板和已审内容的确定性拼装，仅规整空白，不接受任意“预期朗读稿”。字幕、邮件和播放页可容忍格式与句读差异，但小数点、负号、百分比、范围与算式仍严格检查；追加题干、答案或其他朗读内容即使重算哈希也拒绝。上一期题目与答案从逐日历史重新推导，在邮件正文、邮件 HTML 和播放页均须完整展示，不得缺失或改写，也不进入音频。旧 schema 1 仅兼容正常新闻重发，不支持旧零新闻邮件。科普发信成功后正常记录日期并去重，不追加同日第二封。

### 固定内容结构

每期包含：

- 桃子宝贝每日情报开场与日期。
- 当日合格小情报，不设固定数量指标，最多 5 条，以质量门禁结果为准。
- 3 条不重复的“博物小百科”。
- 1 道今日探索题。
- 上一期探索题及参考答案。

探索题只在邮件和网页中展示，不进入语音播报；答案在下一期公布。选项顺序会轮换，答案字母会同步重映射，避免固定位置形成提示。

### 语音与页面格式

- 语音引擎：`edge-tts==7.2.8`。
- 生成入口自动通过项目内的 `peach-edge-tts.py` 调用语音引擎，将合成请求指向微软当前的 `api.msedgeservices.com` 地址，修复旧地址返回 403 的问题；不修改全局 Python 包，也不改变声音、语速、音高或签名算法。兼容措施依据[上游待合并修复](https://github.com/rany2/edge-tts/pull/491)，不是已发布的官方新版。升级依赖前必须重新验证并移除不再需要的兼容层；遇到其他版本时适配器会主动停止。
- 默认声音：`zh-CN-XiaoyiNeural`。
- 默认语速：`-4%`。
- 默认音高：`+8Hz`。
- 默认音量：`+0%`。
- 音频必须通过最小体积与 MP3 文件特征检查。
- 字幕必须是有效 WebVTT，并与播报文本一起生成。
- 页面必须引用同目录的 `audio.mp3` 与 `captions.vtt`。
- 页面和邮件均为适合桌面、手机阅读的 Light Mode 图文布局。

### 端到端发送链路

```text
RSS / 搜索源 / 人工精选源
  -> 时效、领域、来源与重复过滤
  -> 儿童可读改写与结构一致性检查
  -> 百科与探索题选择
  -> 整期强制自检
  -> HTML / 纯文本邮件
  -> Xiaoyi MP3 / WebVTT / 播报文本 / 播放页
  -> 提交到 peach/YYYY-MM-DD/
  -> 等待 GitHub Pages 发布
  -> 逐字节校验线上四个文件
  -> 发送邮件
  -> 保存新闻、百科、题目和发送日期状态
```

任何线上文件缺失或与本地产物不一致，邮件都不会发送。

### 定时与防重复

`.github/workflows/peach-daily-news.yml` 保留原有发送策略：

- 北京时间 18:00 开始，并在 18:10、18:20、18:30、18:40、18:50 提供计划任务容错。
- 北京时间 19:15、21:15、23:15 提供晚间补偿。
- 次日 00:30 只补发尚未发送的前一天内容。
- 手动运行支持测试、指定日期、多日期补发、使用已发布播放页和重发历史产物。历史日期补推如果并非紧接着当前状态，会把答案区标为“上一期”，避免误称“昨天”。
- `peach-news-state.json`、定时门禁和并发组共同阻止同一天重复发送。

`google-apps-script/` 提供独立于电脑的外部云触发器：北京时间 18:00 主触发、18:10 备触发，小时级修复任务负责补建缺失触发器。外部触发和 GitHub 计划任务使用同一日期门禁。

定时触发成功不等于当天一定发出。当前选稿依赖 RSS、预设改写规则与 `peach-curated-news.json` 中已核对的编辑稿，尚未接入云端模型进行自主检索、阅读全文和智能编辑。成功采集后合格新闻为零时按上述规则使用科普版；只有一条、源故障或其他质量失败仍停止。请以实际发信日志、发送状态和线上播放文件核验投递结果，而不是只查看任务启用状态。

### 在线访问

- 站点首页：<https://babelovelg-stack.github.io/peach-daily-news-playback/>
- 日期页面：`https://babelovelg-stack.github.io/peach-daily-news-playback/peach/YYYY-MM-DD/`

每个日期目录包含一个完整、不可拆分的发布单元：

| 文件 | 用途 |
| --- | --- |
| `index.html` | 当日图文页面与音频入口 |
| `audio.mp3` | Xiaoyi 当日语音播报 |
| `captions.vtt` | 与音频对应的中文字幕 |
| `speech.txt` | 用于生成和核对音频的播报文本 |

### 环境要求

- Node.js 24 或更高版本
- npm
- Python 3.12
- `edge-tts==7.2.8`
- 发送邮件所需的 SMTP 账号

### 快速开始

```bash
git clone https://github.com/babelovelg-stack/peach-daily-news-playback.git
cd peach-daily-news-playback
npm ci
npm test
```

本地生成但不发邮件：

```bash
node peach-daily-news.mjs --test --dry-run
```

该命令仍会检查新鲜度和防重复状态；当内容池不足时主动失败属于预期保护行为。

云端只验证可在手动运行工作流时设置 `validate_only=true`（默认 `false`）：运行全量测试、生成真实语音资产并自检，但不发布、不发送、不更新正式状态。不能与历史重发／准备目录组合使用。审计及哈希清单随 `peach-daily-news` 产物包一起保存，下载后须保留整个目录结构；科普重发必须有审计、哈希清单及四资产。

该验证模式还会检查整个科普目录的全部独立来源 URL（当前 38 个），而不只检查当期 3 条。可单独运行只读命令 `node peach-science-source-check.mjs`：最多 6 路并发，沿用来源自检的两次尝试与超时规则，任何 URL 仍不可访问都会失败。它不发送邮件、不修改状态或目录；本机代理／网络失败不能代替云端结果，也不能据此跳过来源检查或删减库存。

本地预览静态站：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/` 或 `http://localhost:8000/peach/YYYY-MM-DD/`。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm test` | 运行全部内容质量、自检、调度、题目与云触发测试 |
| `npm run news` | 生成并发送当期内容，需要 SMTP 配置 |
| `node peach-daily-news.mjs --test --dry-run` | 测试模式生成但不发送 |
| `node peach-daily-news.mjs --date YYYY-MM-DD --dry-run` | 为指定日期准备产物 |
| `npm run self-check` | 校验默认审计文件 |
| `node send-existing-peach-email.mjs` | 校验并发送已准备的历史产物 |

### 关键配置

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | 发送时 | SMTP 服务器与凭据 |
| `SMTP_PORT` / `SMTP_SECURE` | 否 | SMTP 端口与安全连接设置 |
| `REPORT_EMAIL_FROM` | 否 | 发件人，默认使用 SMTP 用户 |
| `PEACH_NEWS_EMAIL_TO` | 发送时 | 收件人 |
| `PEACH_NEWS_DATE` / `PEACH_NEWS_DATES` | 否 | 指定单个或多个生成日期 |
| `PEACH_NEWS_TIMEZONE` | 否 | 推送截止点时区；当前使用 `Asia/Shanghai` |
| `PEACH_NEWS_SEND_HOUR` | 否 | 每日推送截止点小时，默认 `18` |
| `PEACH_NEWS_MAX_AGE_HOURS` | 否 | 以本次推送截止点向前计算的滚动窗口长度，默认 `24` 小时 |
| `PEACH_NEWS_MAX_PER_PUBLISHER` | 否 | 单一来源最多入选数，默认 `2` |
| `PEACH_NEWS_ENABLE_PLAYBACK` | 否 | 是否生成图文语音产物 |
| `PEACH_NEWS_PLAYBACK_BASE_URL` | 发布时 | 按日期拼接的播放页基础地址 |
| `PEACH_NEWS_PLAYBACK_URL_OVERRIDE` | 重发时 | 指定已经发布并需要校验的播放页 |
| `PEACH_NEWS_PLAYBACK_VOICE` | 否 | 默认 `zh-CN-XiaoyiNeural` |
| `PEACH_NEWS_PLAYBACK_RATE` | 否 | 默认 `-4%` |
| `PEACH_NEWS_PLAYBACK_PITCH` | 否 | 默认 `+8Hz` |
| `PEACH_NEWS_PLAYBACK_VOLUME` | 否 | 默认 `+0%` |

GitHub Actions 必须配置 `REPORT_EMAIL_FROM`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER` 和 `SMTP_PASS`。所有凭据只存放在 GitHub Secrets 中。

### 生成与状态文件

- `peach-daily-news.html` 与 `peach-daily-news.txt`：准备发送的邮件正文。
- `peach-news-audit.json`：内容、来源和质量审计数据。
- `peach-playback-manifest.json`：四资产 SHA-256／字节数、逐日模式与知识 ID、审计摘要；四文件生成完毕后才写入。
- `peach-news-next-state.json`：本次通过后准备写入的下一状态。
- `peach-news-state.json`：已发送新闻、百科、题目和日期状态。
- `peach-playback/YYYY-MM-DD/`：本地生成、等待发布的四文件目录。
- `peach/YYYY-MM-DD/`：GitHub Pages 使用的已发布四文件目录。
- `peach-prepared/`：需要保留的历史准备产物。

### 项目结构

```text
.
├── .github/workflows/
│   ├── peach-daily-news.yml       # 生成、质检、发布、校验和发信
│   └── pages.yml                  # 手动 GitHub Pages 部署
├── google-apps-script/            # 18:00/18:10 外部云触发器
├── peach/                         # 按日期发布的静态图文语音内容
├── peach-prepared/                # 历史准备产物
├── peach-daily-news.mjs           # 每日情报主入口
├── peach-content-quality.mjs      # 新闻内容质量规则
├── peach-news-self-check.mjs      # 整期强制自检
├── peach-schedule-gate.mjs        # 日期、补偿和去重门禁
├── peach-quiz-option-rotation.mjs # 探索题选项与答案映射
├── send-existing-peach-email.mjs  # 已准备产物的校验与发送
├── peach-news-state.json          # 持久化状态
├── package.json                   # Node.js 命令与固定依赖版本
└── index.html                     # 站点入口
```

### 发布与维护约束

- 内容生成、状态更新和静态页面发布必须保持在同一个并发组中。
- 必须先运行整期自检，再发布播放页；必须先验证线上文件，再发送邮件。
- 每次发布必须同时提交页面、音频、字幕和播报文本。
- 已发布日期目录不应手工改写，修订应重新通过完整生成与校验链路。
- 不要删除或手工清空 `peach-news-state.json`，否则可能导致重复内容或重复发送。
- 不要在代码、日志或产物中提交 SMTP 密码、GitHub Token 或其他账号凭据。

### 许可证

仓库当前未声明开源许可证。除非仓库所有者另行授权，否则不要假定内容或代码可以复制、修改或分发。

<a id="english"></a>

## English

### Overview

This repository is the complete home of “Peach Daily News.” Source collection, child-friendly rewriting, quality gates, encyclopedia and quiz state, email generation, Xiaoyi speech, captions, static playback pages, GitHub Pages publishing, hosted-file verification, and email delivery all run here.

It is both the generator and the static playback site. A daily issue is sent only after every quality check and hosted playback-file check succeeds.

### Non-negotiable content and quality rules

Normal mode accepts up to five stories rather than treating five as a quota, and it requires at least two eligible stories from at least two independent publishers. A complete, source-diverse edited issue is not padded with lower-confidence feed rewrites. One publisher contributes at most two stories by default. Stories are collected from the rolling 24-hour interval between adjacent delivery cutoffs. With the default 18:00 cutoff in the Beijing time zone, the interval starts just after the previous day's 18:00 cutoff and ends at the current day's 18:00 cutoff, rather than following the natural 00:00–24:00 calendar day. Test mode uses a smaller sample without bypassing quality rules.

Every story must include:

- A clear title faithful to the source.
- Three explanation layers: what happened, why it matters, and what it may affect.
- Publisher, publication time, and an original link for adult verification.
- Child-readable wording that does not distort the facts.

Automated gates reject:

- Event promotion, market hype, study-tour advertising, local self-promotion, and low-value statistics.
- Title-body mismatches, region mismatches, topic drift, and generic template explanations.
- Low-value stories outside politics, technology, public-interest society, and major international affairs.
- Stale sources, unreachable links, excessive concentration from one publisher, and semantic duplicates.
- Stories, encyclopedia entries, quiz text, or quiz concepts repeated from recent issues.
- An entire issue with too few stories, insufficient source diversity, fewer than three encyclopedia entries, or an inadequate quiz.

When a gate fails, the workflow stops. It must never invent news, reduce standards, or reuse recent content merely to send on time.

### The narrow zero-news science exception

Only successful collection with **exactly zero** individually qualified fresh stories selects the clearly labelled “儿童科学知识版” (children's science edition). One story stays in news mode: normal issues still require two stories from two publishers; legacy test/merged issues retain one story/one publisher. A successfully parsed empty feed is legitimate zero-candidate evidence. All-feed failure requires genuinely qualified fresh curated news to proceed; stale curated JSON cannot hide collection failure. Unresolved timeouts, 429s, and 5xx errors are retried and never counted as quality-based zero news.

Science replaces the usual three encyclopedia entries with exactly three facts from different primary topics, without empty news cards or claims of a new discovery. The 152-concept catalog retains specific NASA, NOAA, and USGS sources and verification dates. Legacy IDs, text, and semantic mappings preserve the 45-issue/135-fact exclusion window. Source links appear in email and the page, not speech. Malformed catalogs, inaccessible sources, or insufficient inventory stop delivery without resetting history.

Eligible reviewed news-linked questions come first. A secondary reserve offers 24 distinct reasoning concepts (16 arithmetic and eight experiment/evidence families) with bounded deterministic numeric variations labelled simulated data. No LLM or new key is required. Existing quality checks, option rotation, 14-concept exclusion, and long-text history remain in force. Tests simulate 60 consecutive science issues and 400 question dates from real state and independently recalculate every numeric answer. This improves inventory resilience; it does not guarantee feed, speech, publication, or SMTP availability, and none of those failures triggers science mode.

Audit schema 2 records per-date modes, candidates/rejection reasons, qualified counts, sources, and relevant learning history. Every feed's parsed count and the curated count must separately reconcile with its candidates. Bidirectional concept mappings also prevent repeating recent science through legacy encyclopedia IDs when returning to news mode, within the unchanged 135-entry window. The sender rechecks trusted catalog records and all four assets' SHA-256 hashes, dates, modes, and facts. Complete speech must equal the deterministic assembly of trusted greeting/closing templates and audited content, allowing whitespace differences only—not an arbitrary expected-speech field. Captions, emails, and the playback page may vary in formatting and sentence punctuation but must preserve decimals, negative signs, percentages, ranges, and arithmetic. Appended questions, answers, or other spoken content fail even with recomputed hashes. The complete previous question and answer are reconstructed from each issue's history and must remain present and unchanged in plain-text email, HTML email, and the page, never in audio. Schema 1 remains news-only; legacy zero-news resend is forbidden. A successfully sent science edition records the normal delivery date and prevents a second email for that date.

### Fixed issue structure

Every issue contains:

- The Peach Daily News greeting and date.
- Eligible daily stories, with no fixed quota and a maximum of five, determined by the quality gates.
- Three non-repeating encyclopedia entries.
- One daily exploration question.
- The previous exploration question and its reference answer.

The exploration question appears in email and on the page but is excluded from narration; its answer is published in the next issue. Option order rotates together with the mapped answer letter so position does not become a hint.

### Speech and page format

- Speech engine: `edge-tts==7.2.8`.
- Generation invokes the engine through the project-local `peach-edge-tts.py`, directing synthesis requests to Microsoft's current `api.msedgeservices.com` endpoint to resolve the legacy endpoint's 403 response. It does not modify global Python packages, voice, rate, pitch, or signing. This compatibility measure follows an [unmerged upstream fix](https://github.com/rany2/edge-tts/pull/491), not a newly released official version. Revalidate it before upgrading the dependency and remove it when no longer needed; the adapter stops on any other version.
- Default voice: `zh-CN-XiaoyiNeural`.
- Default rate: `-4%`.
- Default pitch: `+8Hz`.
- Default volume: `+0%`.
- Audio must pass minimum-size and MP3 signature checks.
- Captions must be valid WebVTT and are generated with the narration text.
- The page must reference `audio.mp3` and `captions.vtt` in the same directory.
- Page and email use a responsive Light Mode visual layout for desktop and mobile.

### End-to-end delivery pipeline

```text
RSS / search feeds / curated sources
  -> freshness, topic, publisher, and duplicate filters
  -> child-readable rewriting and structural coherence checks
  -> encyclopedia and quiz selection
  -> mandatory full-issue self-check
  -> HTML / plain-text email
  -> Xiaoyi MP3 / WebVTT / narration text / playback page
  -> commit to peach/YYYY-MM-DD/
  -> wait for GitHub Pages
  -> byte-for-byte verification of all four hosted files
  -> send email
  -> persist story, encyclopedia, quiz, and delivery-date state
```

Email is never sent when a hosted file is missing or differs from the local output.

### Schedule and deduplication

`.github/workflows/peach-daily-news.yml` preserves the established delivery policy:

- Starts at 18:00 Beijing time, with scheduled fallbacks at 18:10, 18:20, 18:30, 18:40, and 18:50.
- Adds evening recovery windows at 19:15, 21:15, and 23:15 Beijing time.
- At 00:30 the next day, backfills only a still-missing previous-day issue.
- Manual dispatch supports test mode, one or multiple selected dates, a pre-published playback URL, and prepared historical output. When a historical backfill does not immediately follow the current state, its answer section is labelled “previous issue” rather than incorrectly calling it “yesterday.”
- `peach-news-state.json`, the schedule gate, and the concurrency group jointly prevent duplicate delivery for one date.

`google-apps-script/` provides a computer-independent cloud trigger: a primary event at 18:00 Beijing time, a backup at 18:10, and an hourly repair job that recreates missing triggers. External dispatch and GitHub schedules use the same date gate.

A successful trigger does not guarantee daily delivery. Selection relies on RSS, predefined rewriting rules, and reviewed entries in `peach-curated-news.json`; no cloud model is integrated for autonomous research, full-article reading, or intelligent editing. Successful collection yielding zero qualified news uses the narrow science mode above; one story, source failures, and other quality failures still stop. Confirm delivery through actual send logs, persisted state, and hosted playback files, not merely an enabled workflow.

### Live site

- Site root: <https://babelovelg-stack.github.io/peach-daily-news-playback/>
- Dated page: `https://babelovelg-stack.github.io/peach-daily-news-playback/peach/YYYY-MM-DD/`

Every dated directory contains one complete, indivisible release unit:

| File | Purpose |
| --- | --- |
| `index.html` | Daily visual page and audio entry point |
| `audio.mp3` | Daily Xiaoyi narration |
| `captions.vtt` | Chinese captions aligned with the audio |
| `speech.txt` | Narration text used to generate and verify audio |

### Requirements

- Node.js 24 or later
- npm
- Python 3.12
- `edge-tts==7.2.8`
- SMTP credentials for email delivery

### Quick start

```bash
git clone https://github.com/babelovelg-stack/peach-daily-news-playback.git
cd peach-daily-news-playback
npm ci
npm test
```

Generate locally without sending email:

```bash
node peach-daily-news.mjs --test --dry-run
```

The command still enforces freshness and recent-content state. Intentional failure when the eligible pool is exhausted is a protective behavior.

Preview the static site locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` or `http://localhost:8000/peach/YYYY-MM-DD/`.

### Common commands

For a cloud no-send check, manually dispatch with `validate_only=true` (default `false`). It runs all tests, generates real speech assets, and self-checks, but does not publish, send, or save formal state. It cannot be combined with prepared-directory or historical-resend inputs. The `peach-daily-news` artifact includes the audit and hash manifest; retain its directory layout when downloading. Science resend requires both manifests and all four assets.

This mode also checks every distinct source URL in the entire science catalog (currently 38), not just the current three facts. Run the read-only diagnostic separately with `node peach-science-source-check.mjs`: at most six concurrent requests, using the existing source check's two attempts and timeout rules. Any remaining inaccessible URL fails validation. It never sends email or changes state/catalog data. Local proxy/network failures do not establish cloud availability and must not be bypassed by skipping checks or removing facts.

| Command | Purpose |
| --- | --- |
| `npm test` | Run all content-quality, self-check, schedule, quiz, and cloud-trigger tests |
| `npm run news` | Generate and send the current issue; requires SMTP settings |
| `node peach-daily-news.mjs --test --dry-run` | Generate in test mode without sending |
| `node peach-daily-news.mjs --date YYYY-MM-DD --dry-run` | Prepare output for a selected date |
| `npm run self-check` | Validate the default audit file |
| `node send-existing-peach-email.mjs` | Validate and send prepared historical output |

### Key configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | For sending | SMTP server and credentials |
| `SMTP_PORT` / `SMTP_SECURE` | No | SMTP port and secure-connection settings |
| `REPORT_EMAIL_FROM` | No | Sender; defaults to the SMTP user |
| `PEACH_NEWS_EMAIL_TO` | For sending | Recipient |
| `PEACH_NEWS_DATE` / `PEACH_NEWS_DATES` | No | One or more generation dates |
| `PEACH_NEWS_TIMEZONE` | No | Delivery-cutoff time zone; currently `Asia/Shanghai` |
| `PEACH_NEWS_SEND_HOUR` | No | Daily delivery-cutoff hour; defaults to `18` |
| `PEACH_NEWS_MAX_AGE_HOURS` | No | Rolling window length ending at the current delivery cutoff; defaults to `24` hours |
| `PEACH_NEWS_MAX_PER_PUBLISHER` | No | Maximum items per publisher; defaults to `2` |
| `PEACH_NEWS_ENABLE_PLAYBACK` | No | Enables visual-and-audio output |
| `PEACH_NEWS_PLAYBACK_BASE_URL` | For publishing | Base URL used to build dated playback URLs |
| `PEACH_NEWS_PLAYBACK_URL_OVERRIDE` | For resending | Already-published playback URL to validate |
| `PEACH_NEWS_PLAYBACK_VOICE` | No | Defaults to `zh-CN-XiaoyiNeural` |
| `PEACH_NEWS_PLAYBACK_RATE` | No | Defaults to `-4%` |
| `PEACH_NEWS_PLAYBACK_PITCH` | No | Defaults to `+8Hz` |
| `PEACH_NEWS_PLAYBACK_VOLUME` | No | Defaults to `+0%` |

GitHub Actions requires `REPORT_EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS`. Keep every credential in GitHub Secrets only.

### Generated and state files

- `peach-daily-news.html` and `peach-daily-news.txt`: prepared email bodies.
- `peach-news-audit.json`: content, source, and quality audit data.
- `peach-playback-manifest.json`: four-file SHA-256/byte counts, per-date modes/knowledge IDs, and audit digest; written only after all four assets exist.
- `peach-news-next-state.json`: next state prepared after a successful run.
- `peach-news-state.json`: delivered story, encyclopedia, quiz, and date state.
- `peach-playback/YYYY-MM-DD/`: locally generated four-file directory awaiting publication.
- `peach/YYYY-MM-DD/`: tracked four-file directory published by GitHub Pages.
- `peach-prepared/`: retained historical prepared output.

### Project structure

```text
.
├── .github/workflows/
│   ├── peach-daily-news.yml       # Generate, validate, publish, verify, and send
│   └── pages.yml                  # Manual GitHub Pages deployment
├── google-apps-script/            # External 18:00/18:10 cloud trigger
├── peach/                         # Published dated visual-and-audio issues
├── peach-prepared/                # Historical prepared output
├── peach-daily-news.mjs           # Daily issue entry point
├── peach-content-quality.mjs      # Story-quality rules
├── peach-news-self-check.mjs      # Mandatory full-issue self-check
├── peach-schedule-gate.mjs        # Date, recovery, and deduplication gate
├── peach-quiz-option-rotation.mjs # Quiz option and answer mapping
├── send-existing-peach-email.mjs  # Prepared-output verification and delivery
├── peach-news-state.json          # Persistent state
├── package.json                   # Node.js commands and pinned dependencies
└── index.html                     # Site entry point
```

### Publishing and maintenance rules

- Content generation, state updates, and static-page publication must remain in the same concurrency group.
- Run the full-issue self-check before publishing; verify hosted files before sending email.
- Every release must contain the page, audio, captions, and narration text together.
- Do not hand-edit a published date directory; regenerate revisions through the full validation pipeline.
- Never delete or manually empty `peach-news-state.json`, which protects against repeated content and duplicate delivery.
- Never commit SMTP passwords, GitHub tokens, or other account credentials to code, logs, or output.

### License

This repository currently does not declare an open-source license. Do not assume permission to copy, modify, or distribute its content or code unless the repository owner grants it separately.
