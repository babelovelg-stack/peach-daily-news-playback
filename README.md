# Peach Daily News Playback

[中文](#中文) | [English](#english)

<a id="中文"></a>

## 中文

### 项目简介

这是“桃子宝贝每日情报”的静态图文语音发布仓库。它保存按日期归档的阅读页面、MP3 音频、WebVTT 字幕和播报文本，并通过 GitHub Pages 提供无需后端服务的访问地址。

本仓库是发布目标，不负责采集资讯或生成内容。上游生成、质量检查、发布和邮件发送逻辑位于 [figma-daily-report](https://github.com/babelovelg-stack/figma-daily-report) 仓库。

### 核心能力

- 每个日期使用独立目录，历史内容不会被新一期覆盖。
- 单页同时提供新闻解释、博物小百科、探索题和上一期答案。
- 使用浏览器原生音频控件播放 MP3，并关联中文字幕轨道。
- 页面使用响应式 Light Mode 布局，兼容桌面与移动端阅读。
- 纯静态文件，无运行时服务、数据库或前端构建依赖。
- `.nojekyll` 保证 GitHub Pages 按原始静态文件发布。

### 发布链路

```text
figma-daily-report
  -> 生成并自检当日内容
  -> 生成 index.html / audio.mp3 / captions.vtt / speech.txt
  -> 推送到本仓库的日期目录
  -> 等待并校验 GitHub Pages 文件
  -> 发送包含已验证播放地址的邮件
```

邮件不会先于线上文件校验发送，因此每个日期目录中的四个文件构成一个完整、不可拆分的发布单元。

### 在线访问

- 站点首页：<https://babelovelg-stack.github.io/peach-daily-news-playback/>
- 日期页面：`https://babelovelg-stack.github.io/peach-daily-news-playback/peach/YYYY-MM-DD/`

例如：

```text
https://babelovelg-stack.github.io/peach-daily-news-playback/peach/2026-08-04/
```

根目录 `index.html` 是一个轻量入口；完整历史内容以日期目录为准。

### 本地预览

本仓库不需要安装依赖。克隆后在仓库根目录启动任意静态文件服务器：

```bash
git clone https://github.com/babelovelg-stack/peach-daily-news-playback.git
cd peach-daily-news-playback
python3 -m http.server 8000
```

然后访问：

```text
http://localhost:8000/
http://localhost:8000/peach/YYYY-MM-DD/
```

直接双击 HTML 也能显示正文，但使用本地 HTTP 服务更接近 GitHub Pages 的实际访问方式。

### 日期目录契约

每个 `peach/YYYY-MM-DD/` 目录必须同时包含：

| 文件 | 用途 |
| --- | --- |
| `index.html` | 当日图文页面与音频入口 |
| `audio.mp3` | 当日语音播报 |
| `captions.vtt` | 与音频关联的中文字幕 |
| `speech.txt` | 用于生成和核对音频的播报文本 |

页面中的相对路径固定引用同目录的 `audio.mp3` 和 `captions.vtt`。移动或重命名其中任意文件都会破坏播放或字幕能力。

### 项目结构

```text
.
├── .github/workflows/pages.yml  # 手动部署 GitHub Pages 的工作流
├── .nojekyll                    # 禁用 Jekyll 处理
├── index.html                   # 轻量站点入口
└── peach/
    └── YYYY-MM-DD/
        ├── index.html           # 当日图文页面
        ├── audio.mp3            # 当日音频
        ├── captions.vtt         # 中文字幕
        └── speech.txt           # 播报文本
```

### 发布与部署

日常发布由上游 `figma-daily-report` 工作流驱动：它通过专用部署密钥克隆本仓库，只暂存目标日期目录，提交后推送到默认分支。随后上游会轮询线上地址，并逐字节比对四个文件；任何文件缺失或不一致都会阻止邮件发送。

本仓库的 `.github/workflows/pages.yml` 只支持手动触发：它上传整个仓库并使用 GitHub Pages 官方 Actions 部署。日常自动发布是否立即上线，还取决于仓库 Pages 设置所采用的发布源；该设置需要与上游的线上校验链路保持一致。

### 维护约束

- 不要手工改写已经发布的日期目录；内容修订应从上游生成与检查流程重新发布。
- 新一期必须一次提交四个文件，不能只推送页面或音频。
- 日期目录使用 `YYYY-MM-DD`，页面内部资源使用相对路径。
- 不要提交部署私钥、邮件凭据或其他账号信息。
- 根目录入口与日期内容相互独立；新增日期不会由当前首页自动生成索引。

### 验证

检查所有日期目录是否都具备完整文件：

```bash
for dir in peach/*; do
  [ -d "$dir" ] || continue
  for file in index.html audio.mp3 captions.vtt speech.txt; do
    test -f "$dir/$file" || echo "missing: $dir/$file"
  done
done
```

启动本地服务后，可以检查首页和指定日期页面：

```bash
curl --fail http://localhost:8000/
curl --fail http://localhost:8000/peach/YYYY-MM-DD/
```

仓库没有构建脚本或单元测试；完整性检查和浏览器预览是主要的本地验证方式。

### 许可证

仓库当前未声明开源许可证。除非仓库所有者另行授权，否则不要假定内容或代码可以复制、修改或分发。

<a id="english"></a>

## English

### Overview

This is the static visual-and-audio publishing repository for “Peach Daily News.” It stores date-based reading pages, MP3 audio, WebVTT captions, and narration text, and serves them through GitHub Pages without a backend.

This repository is a publishing target; it does not collect sources or generate content. The upstream generation, quality checks, publishing, and email-delivery logic lives in the [figma-daily-report](https://github.com/babelovelg-stack/figma-daily-report) repository.

### Core capabilities

- Uses one directory per date so new issues do not overwrite the archive.
- Combines news explanations, short learning items, a daily quiz, and the previous answer on one page.
- Plays MP3 audio with the native browser player and associates a Chinese caption track.
- Uses a responsive Light Mode layout for desktop and mobile reading.
- Contains only static files, with no runtime service, database, or frontend build dependency.
- Uses `.nojekyll` so GitHub Pages publishes the files without Jekyll processing.

### Publishing flow

```text
figma-daily-report
  -> generate and self-check the daily issue
  -> create index.html / audio.mp3 / captions.vtt / speech.txt
  -> push them to a dated directory in this repository
  -> wait for and verify the GitHub Pages files
  -> send an email containing the verified playback URL
```

The email is not sent before hosted-file verification, so the four files in each dated directory form one complete, indivisible release unit.

### Live site

- Site root: <https://babelovelg-stack.github.io/peach-daily-news-playback/>
- Dated page: `https://babelovelg-stack.github.io/peach-daily-news-playback/peach/YYYY-MM-DD/`

Example:

```text
https://babelovelg-stack.github.io/peach-daily-news-playback/peach/2026-08-04/
```

The root `index.html` is a minimal entry point; the dated directories are the source of the full archive.

### Local preview

No dependencies are required. Clone the repository and start any static file server from its root:

```bash
git clone https://github.com/babelovelg-stack/peach-daily-news-playback.git
cd peach-daily-news-playback
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
http://localhost:8000/peach/YYYY-MM-DD/
```

Opening an HTML file directly will display the text, but a local HTTP server more closely matches GitHub Pages behavior.

### Dated-directory contract

Every `peach/YYYY-MM-DD/` directory must contain all four files:

| File | Purpose |
| --- | --- |
| `index.html` | Daily visual page and audio entry point |
| `audio.mp3` | Daily narration |
| `captions.vtt` | Chinese captions associated with the audio |
| `speech.txt` | Narration text used to create and verify the audio |

Each page refers to `audio.mp3` and `captions.vtt` by relative path. Moving or renaming either file breaks playback or captions.

### Project structure

```text
.
├── .github/workflows/pages.yml  # Manually triggered GitHub Pages workflow
├── .nojekyll                    # Disables Jekyll processing
├── index.html                   # Minimal site entry point
└── peach/
    └── YYYY-MM-DD/
        ├── index.html           # Daily visual page
        ├── audio.mp3            # Daily audio
        ├── captions.vtt         # Chinese captions
        └── speech.txt           # Narration text
```

### Publishing and deployment

Routine publishing is driven by the upstream `figma-daily-report` workflow. It clones this repository with a dedicated deploy key, stages only the target date directory, commits, and pushes to the default branch. The upstream job then polls the hosted URL and performs a byte-for-byte comparison of all four files; a missing or mismatched file blocks email delivery.

This repository's `.github/workflows/pages.yml` is manual-only. It uploads the whole repository and deploys it with the official GitHub Pages Actions. Whether a routine push is published immediately also depends on the repository's configured Pages source, which must remain consistent with the upstream hosted-file verification flow.

### Maintenance rules

- Do not hand-edit a published date directory; regenerate and republish revisions through the upstream pipeline.
- Commit all four files for every new issue, never only the page or the audio.
- Use `YYYY-MM-DD` for date directories and relative paths for page assets.
- Never commit deploy keys, email credentials, or other account data.
- The root entry point is independent from the dated content; the current homepage does not automatically index new dates.

### Verification

Check that every dated directory contains the full file set:

```bash
for dir in peach/*; do
  [ -d "$dir" ] || continue
  for file in index.html audio.mp3 captions.vtt speech.txt; do
    test -f "$dir/$file" || echo "missing: $dir/$file"
  done
done
```

After starting the local server, check the root and a selected dated page:

```bash
curl --fail http://localhost:8000/
curl --fail http://localhost:8000/peach/YYYY-MM-DD/
```

The repository has no build script or unit tests; completeness checks and browser preview are its main local verification methods.

### License

This repository currently does not declare an open-source license. Do not assume permission to copy, modify, or distribute its content or code unless the repository owner grants it separately.
