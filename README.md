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
