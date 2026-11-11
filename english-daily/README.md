# 桃子英语 · 词汇与原书伴读

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

### 课程与当前状态

当前入口为 `v2/`。每天两部分：五个 Power Up 3 起步的重点词，加一段原书阅读。词汇有原创插画、语音、例句、遮挡回忆、听音选图与拼写；本机记录学后第1、3、7天的复习提醒。当前样章模式提供阅读提示、重点片段音频、两个词汇解释、一个语法点和两道带原书页码依据的理解题。

已找到出版社免登录样章：Oxford Reading Tree Level 7《The Broken Roof》。2026-11-11 在官方 PageTiger 阅读器逐页目视核对了印刷页1–6；对应阅读器第2–7页（封面占第1页）。孩子的 RAZ C–D 用于确定伴读支持，不与牛津树级别直接等同。

**当前备好3课，不是整本书或无限期内容库存。** 正式课号2读第1–2页并学习五词；课号3读第3–4页、听音回忆同组词；课号4读第5–6页、拼写运用同组词。后两课明确为复习课，不新增五词。每课约23分钟（词汇10、阅读10、回顾3），无强制倒计时。第5课尚未备好时停止推送，不换原创故事，也不推进状态。旧版189课库不再用于发送；已发送第1课保留回看。

原书图文在出版社阅读器联网显示，无需登录，不复制到仓库或附件。课程内嵌词汇图文音频、补充讲解及练习，可离线使用。每课只对一个原书短片段配音，并标注原创迁移例句；出版社页面不能随课程音频高亮或自动翻页，不宣称整页逐句朗读。公开试学包含第一份完整样章伴读课。

首组词为 cereal、yoghurt、pancake、noodles、cabbage，对照 Power Up 3 第二版 Unit 2 官方样章第19页；这是可核对的词汇示例，不是全书第一单元。图片、记忆提示和例句原创，见[插画生成记录](v2/assets/PROVENANCE.md)。

### 构建与原书接入

需要 Node.js 24、Python 和 `edge-tts==7.2.8`：

```sh
python3 -m pip install edge-tts==7.2.8
node english-daily/v2/build.mjs 2 --preview
node --test english-daily/test.mjs english-daily/v2/test.mjs
```

试学文件为 `english-daily/output/v2/preview/index.html`，本课原创插画与语音全部内嵌；出版社原页需联网。`--cached` 仅复用文字、声音参数及音频哈希匹配的音频。中文为 Xiaoyi，英文为 Sonia。重点片段音频与本课展示的对应短句绑定；原书页面不伪造同步。作答和复习记录只保存在当前浏览器。

出版社样章目录在 `v2/publisher-samples.json`，访问条件在 `v2/catalog.json`。每个选段保存官方链接、已核对的页码、两个页面的字节长度和 SHA-256，`readiness`、构建和发送前重新请求并核对来源；变更或不可用时停止。页面仅在原出版社阅读器展示，不下载存储或重新发布原页。单本书所有课程的不同直接引文合计不得超过25个英文词；目前三课共12词。增加样章需扩展允许的出版社阅读器、逐页核对、补齐讲解题目及来源指纹，不能仅根据书名编写。

后续若有适当使用许可的完整电子书或用户提供的书页，仍可使用内嵌原书模式。按照 `v2/model.mjs` 核对书名、级别、原文、图片和来源哈希，准备私有 JSON：`{books:[...],lessons:[{number:5,packId:"food",readingId:"..."}]}`。原书图片 data URI、句子与补充讲解分开标记，语法引用和题目依据必须对应原文。单段不超过150词、12页、24句。测试样本不能正式发送，在线可阅读不等于授权复制整本书。明文只放在已忽略的 `english-daily/private-content/`。不要用打包器覆盖当前样章目录，接入时合并保留已有课序。

设置32字节十六进制 `ENGLISH_CONTENT_KEY` 后运行：

```sh
node english-daily/v2/pack-library.mjs english-daily/private-content/library.json
node english-daily/v2/delivery.mjs readiness
```

打包器生成加密 `v2/library.enc.json` 及无正文的目录。相同密钥须设置为 GitHub Secret `ENGLISH_CONTENT_KEY`。不得提交明文输入、音频缓存或密钥。

### 云端与内容保护

沿用 `babelovelg-stack/peach-daily-news-playback` 的 SMTP Secrets、收件人 `ctmt1412@qq.com` 和每日18:00（北京时间）开始的检查。18:15、18:30、18:45、19:15、21:15以及新闻工作流完成触发保留；云端排队可能延迟。新增内容加密 Secret，不改变新闻推送逻辑。

正式课程采用 AES-256-GCM 加密：公开页面只有密文，每课密钥通过邮件链接的 URL fragment 传递，浏览器解密后清除地址中的密钥。邮件另附 HTML；其中词汇与讲解可离线，出版社原书图文需联网。发信前逐字节核对公开密文及清单，已发布未发送的课程从密文还原，避免重新合成造成版本漂移。发送占位先持久化，SMTP不明确时停止自动重发并核查回执，确认接受后再推进原有 `state.json`，保留旧版第1课记录。本地 `state.json` 是初始化模板，云端仓库保存实际进度；部署不得用本地模板覆盖云端状态。

原书明文、离线附件、音频缓存和密钥不上传为工作流产物，公开 Actions 缓存关闭；产物仅含无正文的计划、脱敏回执、状态和公开密文。手动运行默认 `validate_only=true`，改为 `false` 才允许完整课程发送；缺少原书时两种模式均不发信。

### 验证与来源

30项课程/投递测试通过，覆盖来源、引用预算、配量、加密篡改、缺书阻断、连续状态及邮件联网说明。三课均构建并核对22段音频的文本/声音指纹与字节哈希。真实浏览器验证了出版社样章在桌面与390px手机宽度的加载、翻页、重点片段音频播放、答题反馈、阅读确认和完成门槛；390px无横向溢出。旧内嵌阅读模式的逐句高亮与解密使用明确标记的测试文本验证，测试文本不是原书。

- [Cambridge 官方样章](https://assets.cambridge.org/97810098/09887/excerpt/9781009809887_excerpt.pdf)
- [OUP Level 7 产品与样章入口](https://shop.oupchina.com.hk/en/products/oxford-reading-tree-biff-chip-and-kipper-stories-level-7-mixed-pack-of-6)
- [The Broken Roof 官方样章](https://oup.pagetiger.com/ort-broken-roof/)
- [词汇原创插画记录](v2/assets/PROVENANCE.md)

<a id="english"></a>
## English

### Course and current status

The current entry point is `v2/`. Each lesson combines five Power Up 3 vocabulary targets with original-book reading. Original illustrations, audio, examples, concealed recall, listening-picture matching and spelling support the vocabulary. Local records remind learners to review on days 1, 3 and 7. The active publisher-sample mode adds reading guidance, one short original quotation with audio, two glossary notes, one grammar pattern and two questions with page references.

An official, no-login sample of Oxford Reading Tree Level 7 *The Broken Roof* is available. Printed pages 1–6 were visually verified in the publisher’s PageTiger reader on 2026-11-11; they correspond to viewer pages 2–7 because the cover counts as page 1. RAZ C–D informs scaffolding, not direct level equivalence.

**Three lessons are prepared, not a full book or indefinite supply.** Production lesson 2 covers printed pages 1–2 and teaches five terms. Lesson 3 covers pages 3–4 with listening recall of the same terms; lesson 4 covers pages 5–6 with spelling/application. Both later lessons explicitly review rather than add five new terms. Each is budgeted at 23 minutes (10 vocabulary, 10 reading, 3 review), without a forced timer. Missing lesson 5 stops delivery without a replacement story or state advancement. The legacy 189-lesson catalog is retired; previously sent lesson 1 remains available.

Original pages load online in the publisher reader without login and are not copied into the repository or attachment. Vocabulary illustrations/audio, companion explanations and exercises are embedded for offline use. Each lesson voices only a short original excerpt and labels its newly written example separately. Publisher pages do not synchronize highlighting or page turns with course audio; this is not full-page sentence narration. The public preview contains the first complete sample companion lesson.

The first sample terms are cereal, yoghurt, pancake, noodles and cabbage, checked against page 19 of the official Power Up 3 second-edition Unit 2 sample. This is not Unit 1. Illustrations, memory cues and examples are original; see [image provenance](v2/assets/PROVENANCE.md).

### Build and original-book intake

Use Node.js 24, Python and `edge-tts==7.2.8`:

```sh
python3 -m pip install edge-tts==7.2.8
node english-daily/v2/build.mjs 2 --preview
node --test english-daily/test.mjs english-daily/v2/test.mjs
```

The preview is `english-daily/output/v2/preview/index.html`, with embedded original learning illustrations/audio; publisher pages require internet access. `--cached` requires matching text, voice and hashes. Xiaoyi narrates Chinese and Sonia English. Short excerpt audio highlights its corresponding course quotation; publisher-page synchronization is not simulated. Learning records remain in the current browser.

Publisher selections live in `v2/publisher-samples.json`; access conditions are recorded in `v2/catalog.json`. Each selection stores official URLs, verified page numbers, byte lengths and SHA-256 fingerprints for two pages. Readiness, build and pre-send checks refetch and verify the source bytes, stopping on changes or failures. Original pages remain in the publisher reader; they are not stored or republished. Distinct direct quotations across all lessons from one book may total at most 25 English words; the current three lessons total 12. Adding samples requires approving the publisher reader, visually checking pages, and supplying explanations, questions and fingerprints.

The embedded-original mode remains available for appropriately licensed full books or user-provided pages. Follow `v2/model.mjs` to verify title, level, original text/images and source hashes, then prepare private JSON: `{books:[...],lessons:[{number:5,packId:"food",readingId:"..."}]}`. Original images/sentences and companion explanations are clearly separated; grammar quotations and answer evidence must match the text. Each selection is limited to 150 words, 12 pages and 24 sentences. Fixtures cannot be delivered, and online reading access does not authorise copying whole books. Keep plaintext under ignored `english-daily/private-content/`. Merge existing lesson order when importing; do not overwrite the current sample catalog with the packer.

Configure a 32-byte hexadecimal `ENGLISH_CONTENT_KEY`, then run:

```sh
node english-daily/v2/pack-library.mjs english-daily/private-content/library.json
node english-daily/v2/delivery.mjs readiness
```

The packer writes encrypted `v2/library.enc.json` and a text-free catalog. Store the same key as GitHub Secret `ENGLISH_CONTENT_KEY`. Never commit plaintext inputs, audio caches or keys.

### Cloud delivery and content protection

Reuse SMTP Secrets, recipient `ctmt1412@qq.com`, and the 18:00 Asia/Shanghai schedule in `babelovelg-stack/peach-daily-news-playback`. Recovery checks at 18:15, 18:30, 18:45, 19:15 and 21:15 and the news-workflow completion trigger remain. Queues can delay execution. The content-key Secret is additional; news behavior is unchanged.

AES-256-GCM protects production lesson HTML. The public page contains ciphertext, while each lesson key is sent in the email URL fragment and removed after browser decryption. The email also attaches HTML with offline vocabulary/explanations; publisher pages still require internet access. Hosted ciphertext and manifest must match before SMTP. Already-published unsent lessons are decrypted and reused to prevent audio drift. Persist a claim before SMTP; uncertain outcomes block automatic retries pending evidence review. Confirmed acceptance advances the existing `state.json` while retaining legacy lesson 1. The local `state.json` is an initial template; the cloud repository owns live progress and must not be overwritten during deployment.

Plaintext books, offline attachments, audio caches and keys are excluded from workflow artifacts. Public Actions caching is disabled. Artifacts contain only text-free plans, redacted receipts, state and public ciphertext. Manual dispatch defaults to `validate_only=true`; `false` enables sending complete lessons. Neither mode sends when original material is missing.

### Validation and sources

All 30 curriculum/delivery tests passed, covering sources, quotation budgets, workload, encryption tampering, missing-content blocking, sequential state and online/offline email disclosure. All three lessons were built with 22 audio clips each and verified text/voice fingerprints and byte hashes. Browser QA covered the real publisher sample on desktop and a 390px mobile viewport, page turns, real excerpt audio, answer feedback, reading acknowledgement and completion gates. No horizontal overflow occurred at 390px. Clearly labelled fixtures test sentence highlighting/decryption in the older embedded-original mode; they are not original books.

- [Cambridge sample](https://assets.cambridge.org/97810098/09887/excerpt/9781009809887_excerpt.pdf)
- [OUP Level 7 product and sample links](https://shop.oupchina.com.hk/en/products/oxford-reading-tree-biff-chip-and-kipper-stories-level-7-mixed-pack-of-6)
- [The Broken Roof publisher sample](https://oup.pagetiger.com/ort-broken-roof/)
- [Original vocabulary image provenance](v2/assets/PROVENANCE.md)
