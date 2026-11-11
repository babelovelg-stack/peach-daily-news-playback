# 桃子英语 · 词汇与原书伴读

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

### 课程与当前状态

当前入口为 `v2/`。每天两部分：五个 Power Up 3 起步的重点词，加一段原书阅读。词汇有原创插画、语音、例句、遮挡回忆、听音选图与拼写；本机记录学后第1、3、7天的复习日期，配课时优先安排复习词。阅读有原书图片、逐句音频与同步高亮、1–3个词汇解释、一个语法点和1–2道带原文依据的理解题。

用户已选 Oxford Reading Tree Level 7。已自行查到 Oxford Owl 免费书库中的 *Red Planet*（Biff, Chip and Kipper Stories），改从这本有官方电子书入口的书开始。孩子目前的 RAZ C–D 用于确定伴读支持，不与其他分级直接等同。长书分为不超过150词、12页、24句的选段；整课按25分钟以内配量，不设强制倒计时。

**已找到官方电子书入口；免费账号登录及全文核对尚未完成，正式课程目录仍为空。** 每日18:00检查保留，但缺书时不发布、不发送、不推进状态，也不退回旧故事。试学含已核对的五个词，以及第二部分的官方原书和 Level 7 书架链接。已在官网页面核实书名、系列、级别和“Log in to Read eBook”入口；未登录读取正文，不能把目录当作正文已核对。官网阅读需联网，建议电脑或平板，原书未内嵌在离线附件中。旧版27周/189课库停止用于定时发送，已发送第1课保留回看。

首组词为 cereal、yoghurt、pancake、noodles、cabbage，对照 Power Up 3 第二版 Unit 2 官方样章第19页；这是可核对的词汇示例，不是全书第一单元。图片、记忆提示和例句原创，见[插画生成记录](v2/assets/PROVENANCE.md)。

### 构建与原书接入

需要 Node.js 24、Python 和 `edge-tts==7.2.8`：

```sh
python3 -m pip install edge-tts==7.2.8
node english-daily/v2/build.mjs 2 --preview
node --test english-daily/test.mjs english-daily/v2/test.mjs
```

试学文件为 `english-daily/output/v2/preview/index.html`，图片与语音全部内嵌。`--cached` 仅复用文字、声音参数及音频哈希匹配的音频。中文为 Xiaoyi，英文为 Sonia。原书逐句音频与页面绑定，不用估计时间点伪造同步。作答和复习记录只保存在当前浏览器。

原书由课程维护者主动查找，优先出版社免费书库或官方样章；当前访问条件记录在 `v2/catalog.json` 的 `readingAccess`。登录官网后先核对正文并确认可用方式；官方在线可阅读不等于授权复制整本书到邮件或仓库。对于具有适当使用许可的电子书或用户提供的书页，核对书名、级别、原文、图片和来源哈希，按 `v2/model.mjs` 的验证规则准备私有 JSON：`{books:[...],lessons:[{number:2,packId:"food",readingId:"..."}]}`。页面包含图片 data URI、原文和单独标记的中文讲解；语法引用与题目依据必须对应原文中的一句。测试样本不能用于正式推送，找到书目不等于已核对原书。私有输入放在已忽略的 `english-daily/private-content/`。

设置32字节十六进制 `ENGLISH_CONTENT_KEY` 后运行：

```sh
node english-daily/v2/pack-library.mjs english-daily/private-content/library.json
node english-daily/v2/delivery.mjs readiness
```

打包器生成加密 `v2/library.enc.json` 及无正文的目录。相同密钥须设置为 GitHub Secret `ENGLISH_CONTENT_KEY`。不得提交明文输入、音频缓存或密钥。

### 云端与内容保护

沿用 `babelovelg-stack/peach-daily-news-playback` 的 SMTP Secrets、收件人 `ctmt1412@qq.com` 和每日18:00（北京时间）开始的检查。18:15、18:30、18:45、19:15、21:15以及新闻工作流完成触发保留；云端排队可能延迟。新增内容加密 Secret，不改变新闻推送逻辑。

原书采用 AES-256-GCM 加密：公开页面只有密文，每课密钥通过邮件链接的 URL fragment 传递，浏览器解密后清除地址中的密钥。邮件另附完整离线 HTML。发信前逐字节核对公开密文及清单，已发布未发送的课程从密文还原，避免重新合成造成版本漂移。发送占位先持久化，SMTP不明确时停止自动重发并核查回执，确认接受后再推进原有 `state.json`，保留旧版第1课记录。本地 `state.json` 是初始化模板，云端仓库保存实际进度；部署不得用本地模板覆盖云端状态。

原书明文、离线附件、音频缓存和密钥不上传为工作流产物，公开 Actions 缓存关闭；产物仅含无正文的计划、脱敏回执、状态和公开密文。手动运行默认 `validate_only=true`，改为 `false` 才允许完整课程发送；缺少原书时两种模式均不发信。

### 验证与来源

自动测试覆盖原书来源、原文引用、题量与配量、语音一致性、加密篡改、缺书阻断、连续状态与脱敏产物。浏览器验证记录在 `qa/`，含真实词汇音频、离线图片、听音/拼写、记忆记录与手机布局；逐句高亮、翻页、证据回跳和网页解密使用明确标记的人工测试文本验证，测试阅读不是原书。

- [Cambridge 官方样章](https://assets.cambridge.org/97810098/09887/excerpt/9781009809887_excerpt.pdf)
- [Oxford Owl 免费书库与登录说明](https://home.oxfordowl.co.uk/reading/free-ebooks/)
- [Red Planet 官方书目](https://home.oxfordowl.co.uk/ebooks/red-planet/)
- [Oxford Level 7 目录](https://www.oupjapan.co.jp/en/gradedreaders/ort/resources/index.shtml?language=en)
- [Oxford 分级说明](https://home.oxfordowl.co.uk/reading/reading-schemes-oxford-levels/oxford-reading-tree-levels/)
- [RAZ 文本难度框架](https://www.readinga-z.com/evaluating-text-complexity/)

<a id="english"></a>
## English

### Course and current status

The active entry point is `v2/`. Each lesson has five vocabulary targets starting at Power Up 3 level and an original-book reading selection. Vocabulary combines original illustrations, audio, examples, concealed recall, listening-to-picture matching and spelling. Browser-local records schedule reviews on days 1, 3 and 7; editorial planning prioritises review terms. Reading uses original images, sentence audio/highlighting, 1–3 glossary explanations, one grammar pattern and 1–2 questions with exact textual evidence.

The user selected Oxford Reading Tree Level 7. Independent research found *Red Planet* (Biff, Chip and Kipper Stories) in Oxford Owl’s free library, so it replaces *Lost in the Jungle* as the intended first title. RAZ C–D informs scaffolding, not a direct level equivalence. Longer books are split into selections of at most 150 words, 12 pages and 24 sentences, budgeted within 25 minutes without a forced countdown.

**The official ebook has been located; free-account login and full-text verification are pending, and the production catalog remains empty.** The daily 18:00 check remains, but missing content blocks publishing, email and state advancement, with no fallback story. The preview contains five verified terms plus official reader and Level 7 bookshelf links in part two. The publisher UI confirms the title, series, level and “Log in to Read eBook” control; the full text has not been accessed. Catalog verification does not verify story content. Publisher reading requires internet access and is best on a computer or tablet; the original book is not embedded in the offline preview. The old 27-week/189-lesson library is retired from scheduled delivery; previously sent lesson 1 remains available.

The first sample terms are cereal, yoghurt, pancake, noodles and cabbage, checked against page 19 of the official Power Up 3 second-edition Unit 2 sample. This is not Unit 1. Illustrations, memory cues and examples are original; see [image provenance](v2/assets/PROVENANCE.md).

### Build and original-book intake

Use Node.js 24, Python and `edge-tts==7.2.8`:

```sh
python3 -m pip install edge-tts==7.2.8
node english-daily/v2/build.mjs 2 --preview
node --test english-daily/test.mjs english-daily/v2/test.mjs
```

The preview is `english-daily/output/v2/preview/index.html`, with embedded images/audio. `--cached` requires matching text, voice and hashes. Xiaoyi narrates Chinese and Sonia English. Each original sentence has audio bound to its page; no guessed timings are used. Learning records remain in the current browser.

Course maintainers find books themselves, prioritising free publisher libraries or official samples; `v2/catalog.json` records current access conditions under `readingAccess`. After publisher login, verify the text and permitted usage. Online reading availability does not authorise copying whole books into email or a repository. For suitably licensed ebooks or user-supplied page images, verify title, level, original text/images and source hash. Prepare private JSON using the validation rules in `v2/model.mjs`: `{books:[...],lessons:[{number:2,packId:"food",readingId:"..."}]}`. Pages include image data URIs, original text and separately labelled explanations. Grammar quotations and question evidence must match original sentences. Fixtures cannot be delivered; a catalog listing does not verify the book. Keep private inputs under ignored `english-daily/private-content/`.

Configure a 32-byte hexadecimal `ENGLISH_CONTENT_KEY`, then run:

```sh
node english-daily/v2/pack-library.mjs english-daily/private-content/library.json
node english-daily/v2/delivery.mjs readiness
```

The packer writes encrypted `v2/library.enc.json` and a text-free catalog. Store the same key as GitHub Secret `ENGLISH_CONTENT_KEY`. Never commit plaintext inputs, audio caches or keys.

### Cloud delivery and content protection

Reuse SMTP Secrets, recipient `ctmt1412@qq.com`, and the 18:00 Asia/Shanghai schedule in `babelovelg-stack/peach-daily-news-playback`. Recovery checks at 18:15, 18:30, 18:45, 19:15 and 21:15 and the news-workflow completion trigger remain. Queues can delay execution. The content-key Secret is additional; news behavior is unchanged.

AES-256-GCM protects original-book HTML. The public page contains ciphertext, while each lesson key is sent in the email URL fragment and removed after browser decryption. The email also attaches a full offline HTML lesson. Hosted ciphertext and manifest must match before SMTP. Already-published unsent lessons are decrypted and reused to prevent audio drift. Persist a claim before SMTP; uncertain outcomes block automatic retries pending evidence review. Confirmed acceptance advances the existing `state.json` while retaining legacy lesson 1. The local `state.json` is an initial template; the cloud repository owns live progress and must not be overwritten during deployment.

Plaintext books, offline attachments, audio caches and keys are excluded from workflow artifacts. Public Actions caching is disabled. Artifacts contain only text-free plans, redacted receipts, state and public ciphertext. Manual dispatch defaults to `validate_only=true`; `false` enables sending complete lessons. Neither mode sends when original material is missing.

### Validation and sources

Tests cover source evidence, exact quotations, exercise/workload limits, audio integrity, encryption tampering, missing-book blocking, sequential state and redacted artifacts. Browser QA in `qa/` covers real vocabulary audio, offline images, listening/spelling, recall records and mobile layout. Explicitly synthetic test text verifies sentence highlighting, page turns, evidence links and browser decryption; it is not an original book.

- [Cambridge sample](https://assets.cambridge.org/97810098/09887/excerpt/9781009809887_excerpt.pdf)
- [Oxford Owl free library and login requirements](https://home.oxfordowl.co.uk/reading/free-ebooks/)
- [Red Planet publisher listing](https://home.oxfordowl.co.uk/ebooks/red-planet/)
- [Oxford Level 7 catalog](https://www.oupjapan.co.jp/en/gradedreaders/ort/resources/index.shtml?language=en)
- [Oxford level guide](https://home.oxfordowl.co.uk/reading/reading-schemes-oxford-levels/oxford-reading-tree-levels/)
- [RAZ text-complexity framework](https://www.readinga-z.com/evaluating-text-complexity/)
