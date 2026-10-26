# Cloud Daily Reliability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the existing cloud daily delivery by implementing the approved zero-qualified-news science edition and a sustainable reviewed exploration-question reserve, without weakening quality or date deduplication.

**Architecture:** One coupled delivery task: collect and individually validate news, choose an explicit per-date mode, validate the complete issue, publish/verify playback, then send and persist state. Share science/audit validators between generation, final self-check and resend; preserve legacy news manifests. Keep editorial material in a source-backed local catalog, not a new model service.

**Tech Stack:** Node.js 24 ESM, node:test, existing nodemailer/XML parser, Python edge-tts 7.2.8, GitHub Actions/Pages and current external cloud scheduler.

**Approved spec:** `docs/superpowers/specs/2026-10-14-zero-news-science-fallback-design.md`. On 2026-10-26 the user confirmed receipt of Oct 23 and explicitly requested repair and daily delivery. Execute the approved boundary without another design approval cycle. Do not backfill the whole gap or change the recipient/time.

## Chunk 1: End-to-end implementation

### Task 1: Science fallback, question reserve, audit and send integration

This is one tightly coupled task owned by one implementer to avoid concurrent changes to the large main module. Review spec compliance and then code quality before integration.

**Files:**
- Create `peach-science-catalog.json`: at least 150 editorially checked, distinct scientific concepts; stable ID/concept/tags/text and primary-source name, URL, checked date. Preserve a 45-issue/135-item exclusion window; do not ship a reserve that exhausts after a few days.
- Create `peach-science-mode.mjs` and `peach-science-mode.test.mjs`: pure decision, catalog quality and selection, explicit zero-news audit evidence, shared normalization and state history.
- Create `peach-reserve-quiz.mjs` and `peach-reserve-quiz.test.mjs`: at least 24 genuinely different reviewed reasoning concepts, with deterministic bounded numeric variations and explained correct answers. Simulated data must be labelled; variation is not a substitute for concept deduplication. Exercise the real current question validator, not a parallel weaker validator.
- Modify `peach-daily-news.mjs`: collector diagnostics, per-story final quality/link rejection, science/news mode, catalog and reserve integration, rendering/playback, mode/state/audit metadata and import-safe test seam.
- Modify `peach-news-self-check.mjs` and tests: versioned mode-aware validation, authoritative catalog consistency, source checks and old-news-manifest compatibility.
- Modify `send-existing-peach-email.mjs` and add focused tests: preserve science subject and perform mandatory audit/date/mode/content/four-asset verification for science send/resend, including when no news titles exist.
- Modify `.github/workflows/peach-daily-news.yml` only as needed to package verification evidence and run tests; preserve schedules, concurrency and receipt-before-state ordering.
- Modify `package.json` to include new tests, README (Chinese/English) and AGENTS.md to document the narrow science exception, reserve capacity and remaining fail-closed limits.

- [x] Step 1: Add failing tests for explicit 0/1/2 boundaries and invalid fallback evidence.

```js
assert.equal(decideContentMode({ qualifiedCount: 0, collectionSucceeded: true }), 'science');
assert.equal(decideContentMode({ qualifiedCount: 1, collectionSucceeded: true }), 'news');
assert.equal(decideContentMode({ qualifiedCount: 2, collectionSucceeded: true }), 'news');
assert.throws(() => decideContentMode({ qualifiedCount: 0, collectionSucceeded: false }));
```

Run `node --test peach-science-mode.test.mjs`; capture the expected initial failure before implementation.

- [x] Step 2: Implement the shared decision and quality contract, with the core decision equivalent to:

```js
export function decideContentMode({ qualifiedCount, collectionSucceeded }) {
  if (!Number.isInteger(qualifiedCount) || qualifiedCount < 0) throw new Error('Invalid news count');
  if (!collectionSucceeded) throw new Error('News collection did not complete reliably');
  return qualifiedCount === 0 ? 'science' : 'news';
}
```

Zero must be the count after per-item freshness, suitability, explanation, final semantic quality, source validation and duplicate checks, not after catching arbitrary exceptions. Keep evidence for rejected candidates and collection success. HTTP 404/410 may reject individual sources; exhausted transient errors (timeouts, 429, 5xx) remain technical failures. At least one real live feed must be successfully parsed for an empty-window decision, unless there are fresh reviewed curated candidates; an old static JSON file alone must not mask all-feed failure. Normal one-news issues still fail the old two-news gate; test/merged thresholds remain as documented.

- [x] Step 3: Build the reviewed science catalog using browsed authoritative original sources (NASA, NOAA, USGS, research institutions, museums). Check that each source supports the actual fact, not merely a domain. Use at least 3 different primary topics within each selected issue, elementary-readable 22–90-character explanation bodies, and source links in email/page (not spoken URLs). Reuse existing IDs for identical existing knowledge where relevant, plus text/concept matching against recent state. Do not relabel cultural/financial anecdotes as science or claim evergreen facts are new discoveries.

Run focused catalog tests for duplicate IDs/concepts/text, missing source/check date, unsuitable text, insufficient 3-item selection and >=150 entries. Simulate at least 60 consecutive science issues with rolling histories and distinct daily topics; no repeats inside 45 issues, no pool exhaustion. Legacy known fact IDs/text must also be excluded.

- [x] Step 4: Add reserve reasoning questions as a secondary candidate pool after reviewed news-linked choices, not as a replacement for quiz quality checks. Use valid supported reasoning patterns, three plausible comparable options, explicit answer reasoning and existing option rotation. Preserve 14-concept and text-history exclusion. Use deterministic variations to avoid exhausting a short 17-variant pool, but never reset history or merely change concept IDs to disguise duplicates. Pure mathematics/simulated observations need no claim about real experiments. Keep scientific claims supported by the catalog.

Run tests that reproduce the Oct 24/25 state constraint, validate every reserve family through the existing validator, independently calculate numeric answers, and simulate at least 400 consecutive dates with ordinary question history. Check variant generation, option rotation and answers remain consistent across dates; no low-quality option exemptions.

- [x] Step 5: Wire daily and merged generation. Make module import safe so tests can inject deterministic news/fetch/state without sending mail. Preserve current CLI behavior. Render explicit `儿童科学知识版` labels for zero-news issues, exactly three science entries (not six), prior answer and fresh quiz. Speech includes science but excludes quiz. Use per-date modes for merged reports and rolling dedupe state.

Emit a new audit schema version with full per-date contentMode, trusted selection evidence, science entries, relevant histories and question. `science` must have zero news and exactly 3 catalog-backed eligible facts. `news` always uses existing thresholds. Old schema has no science exemption. Unknown modes, forged mismatched counts and arbitrary catalog copies must fail. Keep non-news errors fail-closed.

- [x] Step 6: Wire independent self-check and actual sender. Serialize final artifact SHA-256 evidence after playback generation. Sender verifies the audit and exact local/remote four-file hashes for science, matching mode/date/content and subject, both in normal send and resend; missing audit/hash evidence or playback URL is an error. Keep legacy news compatibility. Do not let caller subject override drop science identification. Update only after successful SMTP send; preserve past news history and add last mode/science concept history. Test mock SMTP no-send on any validation failure.

- [x] Step 7: Run `npm test` and all new integration tests; exercise 0-news, 1-news and healthy news with fixtures, mixed merged dates, transient errors, malformed state, bad link, empty catalog, duplicate science, stale/forged audit, missing audio/captions, date mismatch, resend and state writes. Keep generated artifacts ignored with existing rules.

- [x] Step 8: Update README CN/EN and AGENTS narrow exception. Document finite pool size, rolling exclusion, reserve simulation results and conditions that still stop delivery. Do not promise unconditional delivery or claim a cloud model was added. Self-review full diff and report tests, remaining concerns and actual files. Main agent handles final deployment and task commit; no push or real send from the implementer.

## Chunk 2: Independent review and deployment

- [x] Spec reviewer checks all approved boundaries and the added exploration-question repair; implementer fixes/rechecks findings.
- [x] Code reviewer independently inspects security, failure classification, duplication, audit/send invariants, evidence integrity, actual integration tests and content correctness; implementer fixes/rechecks findings.
- [x] Main agent runs fresh full tests and no-send render with the latest remote Oct 23 state, then reviews actual text/page/audio assets. Real-time candidates and source links must be verified; avoid forcing science if one valid story survives.
- [ ] Main agent commits isolated changes after git/README/AGENTS gates, integrates latest origin/main without discarding state updates, and deploys to the canonical cloud repo. User explicitly requested repairing cloud daily delivery; deployment is part of this repair, no new service/recipient.
- [ ] Track exact deployed head SHA. Run a non-sending cloud verification where possible, then verify the next normal 18:00 issue (or a scoped current-date validation send without duplicate date). Do not create a computer-dependent automation. If waiting for 18:00 is needed, use the existing product automation/wait mechanism with truthful pending status rather than claim successful send early.
- [ ] Confirm send log, lastSentDate and four hosted hashes before declaring the issue delivered. Keep the existing 18:00 and 18:10 cloud trigger and retries. Do not backfill prior missed dates unless requested.

## Progress

- Baseline: isolated worktree from local approved design plus origin/main (Oct 23 state), no user edits.
- Plan review: approved by the independent spec reviewer on 2026-10-26.
- Baseline verification: `npm test` passed 67/67 tests after merging the latest remote Oct 23 delivery state.
- Implementation: the main agent independently reran all 135 tests successfully. Latest-schema real news and science previews both generated Xiaoyi audio and passed source, audit, exact narration/caption, page and email consistency checks without SMTP; the final numeric and previous-answer checks also pass on those real assets. Formal state remains October 23.
- Spec review: Approved after three adversarial gaps were repaired and independently retested: parsed-feed/candidate accounting, science-to-news semantic history, and exact approved speech coverage.
- Code-quality review: Approved after two additional gaps (displayed numeric semantics and previous-answer completeness/date order) were repaired and independently reproduced through the actual sender with zero SMTP calls. Independent final verification passed all 135 tests and `git diff --check`.
- Source verification: 23 of 38 catalog source URLs passed locally; the 15 `www.usgs.gov` URLs timed out through the local network. A validate-only cloud catalog check will distinguish local routing from a real availability defect; no source bypass is allowed.
- Deployment and cloud proof: pending. No live email, publication, or production state mutation has occurred during this repair.
