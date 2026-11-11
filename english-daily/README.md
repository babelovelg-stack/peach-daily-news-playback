# 桃子英语 · 每天 15 分钟

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

### 孩子如何学习

邮件中的按钮打开当天课程；也可下载 HTML 附件，在浏览器离线使用。五步依次为：听故事 2 分钟、学词汇 3 分钟、语法 3 分钟、互动练习 4 分钟、自己表达 3 分钟。计时器供参考，不强制限时。

内容从已确认适合的 Level 3 难度起步，为原创 A1 至初步 A2 练习，不是 Power Up 官方教材、逐单元配套或等级认证。课程预置 27 周 / 189 天，每周六个重点词、一个语法重点和一个故事。七天分别侧重新词、词汇运用、语法观察、听力、句子、表达及复习；同周故事会重复以便巩固。第 189 课后停止，不自动宣称升级或衔接考试。

前六周依次练习一般现在时、现在进行时、频率副词、可数/不可数名词、数量询问、should/must；之后学习过去时、比较级、最高级、方位、将来表达、连接词等。完整路线由 `course.mjs` 生成到课程目录页。

页面提供中英文合成语音、变速、词卡、选择题即时反馈、拼句、自查、英文草稿和口语录音。选择题可自动核对；作文、口语及自查不自动评分。麦克风只在主动点击后请求权限；不支持录音时可直接开口练习。录音离页前需下载。草稿与进度仅在当前浏览器保存，不跨设备同步；清除浏览器数据可能丢失，可导出 TXT。

### 本地构建

需要 Node.js 24、Python 3.12（本机 3.9 亦已验证）及联网语音服务：

```sh
python3 -m pip install edge-tts==7.2.8
node english-daily/build.mjs 1
node --test english-daily/test.mjs
```

生成文件为 `english-daily/output/lesson-001/index.html`。所有语音内嵌，可断网播放；`--cached` 只在现有音频清单匹配时使用。中文为 Xiaoyi，英文为 Sonia，生成时核对完整文字边界、声音参数和 SHA-256。修改内容后必须重建，不能复用不匹配的音频。

### 云端推送

部署仓库为 `babelovelg-stack/peach-daily-news-playback`。本目录源码复制到其 `english-daily/`，`workflow.yml` 部署为 `.github/workflows/peach-english-daily.yml`。依赖 SMTP 的发送命令使用父仓库已锁定的 nodemailer；本地构建与测试不依赖邮件凭据。

- 收件地址：`ctmt1412@qq.com`，与现有桃子项目一致。
- 复用仓库的 `REPORT_EMAIL_FROM`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS` Secrets，不保存明文凭据。
- 北京时间 18:00 开始，18:15、18:30、18:45、19:15、21:15 补偿检查。现有 `Peach Daily News` 工作流结束也会触发检查，沿用其外部云端触发链路；06:00–18:00 自动运行不发邮件，00:00–06:00 处理前一天。
- GitHub 定时任务可能排队延迟；每天最多成功推送一课，按上次成功序号继续，漏发不跳课。
- 在线入口：<https://babelovelg-stack.github.io/peach-daily-news-playback/english/>。
- `workflow_dispatch` 默认 `validate_only=true`，仅生成验证；设 `false` 才正式推送。当天已发会跳过。

发送顺序：测试 → 规划 → 生成/复用已发布课 → 验证 → 发布四个文件 → 线上逐字节核对 → 持久化发送占位 → SMTP → 保存成功记录。HTML 附件与线上版本一致。`state.json` 独立于新闻状态；本地初始状态是部署模板，部署后不得覆盖云端实际状态。

如果在 SMTP 与成功状态保存之间中断，保留 `inFlight` 并阻止自动重发。维护者需检查对应工作流 Artifact 的 `receipt.json`、SMTP 日志/邮件记录，再依据证据补录成功或清除确认未发的占位，不能只因重试失败就清空状态。已发布但未发出的课程按哈希复用，避免重新合成语音导致版本冲突。正式发送完成不等于证明邮件已进入收件箱。

### 文件与验证

`course.mjs` 为完整课程；`lesson.html`、`style.css`、`app.js` 为页面；`audio.py`、`build.mjs` 生成语音与课件；`daily.mjs`、`push-state.sh`、`workflow.yml` 维护推送。`output/`、`.audio-cache/`、`qa/`、`node_modules/` 不纳入源码。

自动测试覆盖 189 天结构、答案、语音一致性、时区、连续推进、日期去重、不明确发送阻断与课程终止。本机 Chrome 验证离线音频解码/实际播放、答题反馈、拼句、完成门槛、草稿恢复、无存储权限、离线下载、1440px / 390px 布局，以及使用模拟麦克风的录制回听与下载入口。测试证据保存在本机 `qa/`。

<a id="english"></a>
## English

### Learning flow

Open the daily email link, or download its self-contained HTML attachment for offline use. Each lesson budgets 2 minutes for listening, 3 for vocabulary, 3 for grammar, 4 for challenges and 3 for expression. The optional timer does not lock the page.

The original course starts at the agreed Level 3 difficulty, covering A1 to early A2 practice. It is not an official Power Up textbook, unit-by-unit companion or level certification. There are 27 weeks / 189 lessons. Each week uses six target terms, one grammar focus and one story, revisited through vocabulary, usage, grammar, listening, sentence building, expression and review. Delivery stops after lesson 189. The published archive includes the complete weekly route.

The first six weeks cover present simple, present continuous, frequency, countability, quantity questions and should/must; later weeks cover past tense, comparisons, location, future expressions and conjunctions. Embedded Chinese/English synthesized speech, speed controls, word cards, quizzes, sentence ordering and self-checks support independent practice. Writing and pronunciation are not automatically graded. Microphone permission is requested only on click; recordings stay in memory and should be downloaded before leaving. Drafts and progress are browser-local, with TXT export and no cross-device sync.

### Build

Use Node.js 24 and Python 3.12 (Python 3.9 was also verified locally):

```sh
python3 -m pip install edge-tts==7.2.8
node english-daily/build.mjs 1
node --test english-daily/test.mjs
```

The output is `english-daily/output/lesson-001/index.html`, with all audio embedded. Generation requires network access; playback does not. Xiaoyi narrates Chinese and Sonia narrates English. Full speech boundaries, exact text/voice fingerprints and SHA-256 hashes must match. `--cached` requires an existing matching manifest.

### Cloud delivery

Deploy this directory into `babelovelg-stack/peach-daily-news-playback/english-daily/` and install `workflow.yml` as `.github/workflows/peach-english-daily.yml`. SMTP uses the parent repository's locked nodemailer dependency. Reuse its `REPORT_EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` and `SMTP_PASS` Secrets. The recipient is `ctmt1412@qq.com`, matching Peach Daily News.

Delivery begins at 18:00 Asia/Shanghai, with checks at 18:15, 18:30, 18:45, 19:15 and 21:15. Completion of `Peach Daily News` also triggers a check, retaining its external cloud trigger path. Automatic runs from 06:00 to 18:00 skip delivery; midnight to 06:00 checks the previous date. GitHub schedules may be delayed. At most one successful lesson is sent per date, advancing from the last successful lesson without skipping missed days. Manual dispatch defaults to validation only; set `validate_only=false` for delivery.

The sequence is tests → plan → generate/reuse → validate → publish four assets → byte-check the hosted files → persist the send claim → SMTP → persist acceptance. The email attachment matches the published page. The public archive is <https://babelovelg-stack.github.io/peach-daily-news-playback/english/>. English state is separate from news state. The local initial `state.json` is a deployment template and must never overwrite live cloud progress.

An ambiguous SMTP outcome leaves an `inFlight` claim and blocks automatic retries. Inspect the run artifact's `receipt.json` and mail evidence before recording a confirmed success or clearing a confirmed-unsent claim. Never erase state simply to bypass a retry failure. Already-published unsent lessons are hash-verified and reused. SMTP acceptance does not prove inbox placement.

### Source and validation

`course.mjs` defines the curriculum; `lesson.html`, `style.css` and `app.js` implement the UI; `audio.py` and `build.mjs` produce lessons; `daily.mjs`, `push-state.sh` and `workflow.yml` implement delivery. Generated output, audio caches, local QA and dependencies are ignored.

Tests cover all 189 lessons, answer consistency, audio integrity, time zones, sequential progress, daily deduplication, uncertain-send blocking and course completion. Local Chrome checks cover offline decoding/playback, feedback, sentence ordering, completion gates, draft restoration, denied storage, offline downloads, 1440px / 390px layouts, and recording/replay with a synthetic microphone. Local evidence is in `qa/`.
