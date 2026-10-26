import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readScienceCatalog } from './peach-science-mode.mjs';
import { checkScienceCatalogSources } from './peach-science-source-check.mjs';

test('full catalog source check visits every distinct URL with at most six concurrent requests', async () => {
  const expected = new Set(readScienceCatalog().map(item => item.link));
  const requested = new Set();
  let active = 0, peak = 0;
  const result = await checkScienceCatalogSources({ fetchImpl: async url => {
    requested.add(url);
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return new Response('source');
  } });
  assert.deepEqual(requested, expected);
  assert.equal(result.checked, expected.size);
  assert.ok(peak > 1 && peak <= 6, `peak concurrency ${peak}`);
});

test('full catalog check retains two retries and fails when even one source stays inaccessible', async () => {
  const links = [...new Set(readScienceCatalog().map(item => item.link))];
  const failed = links.find(link => new URL(link).hostname === 'www.usgs.gov');
  const attempts = new Map();
  await assert.rejects(checkScienceCatalogSources({ fetchImpl: async url => {
    attempts.set(url, (attempts.get(url) || 0) + 1);
    return new Response('', { status: url === failed ? 403 : 200 });
  } }), /Science catalog source check failed/);
  assert.equal(attempts.size, links.length);
  assert.equal(attempts.get(failed), 2);
  assert.ok(links.filter(link => link !== failed).every(link => attempts.get(link) === 1));
});

test('full inventory diagnostic runs only in validate-only workflow mode', () => {
  const workflow = readFileSync(new URL('./.github/workflows/peach-daily-news.yml', import.meta.url), 'utf8');
  const step = workflow.slice(workflow.indexOf('- name: Check all science catalog sources')).split('\n      - name:')[0];
  assert.ok(step.includes("github.event.inputs.validate_only == 'true'"));
  assert.ok(step.includes('node peach-science-source-check.mjs'));
});
