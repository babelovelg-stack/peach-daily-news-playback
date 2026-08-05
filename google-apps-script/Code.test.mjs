import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8");

function shanghaiDateKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const valueOf = (type) => parts.find((part) => part.type === type).value;
  return `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`;
}

function createHarness() {
  const properties = new Map([["GITHUB_TOKEN", "test-token"]]);
  const fetchCalls = [];
  const scriptProperties = {
    deleteProperty: (key) => properties.delete(key),
    getProperty: (key) => properties.get(key) || null,
    setProperty: (key, value) => properties.set(key, value)
  };
  const context = {
    PropertiesService: { getScriptProperties: () => scriptProperties },
    UrlFetchApp: {
      fetch(url, options) {
        fetchCalls.push({ url, options });
        return {
          getContentText: () => "",
          getResponseCode: () => 204
        };
      }
    },
    Utilities: { formatDate: shanghaiDateKey }
  };

  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, fetchCalls, properties };
}

test("schedules the primary and backup slots on the correct Shanghai date", () => {
  const { context } = createHarness();
  const cases = vm.runInContext(
    `[
      nextPeachSlot_(new Date("2026-07-14T09:59:00Z"), 18, 0),
      nextPeachSlot_(new Date("2026-07-14T10:00:01Z"), 18, 0),
      nextPeachSlot_(new Date("2026-07-14T10:05:00Z"), 18, 10),
      nextPeachSlot_(new Date("2026-07-14T10:10:01Z"), 18, 10)
    ].map((target) => ({ date: target.date, iso: target.when.toISOString() }))`,
    context
  );

  assert.deepEqual(Array.from(cases, (value) => ({ ...value })), [
    { date: "2026-07-14", iso: "2026-07-14T10:00:00.000Z" },
    { date: "2026-07-15", iso: "2026-07-15T10:00:00.000Z" },
    { date: "2026-07-14", iso: "2026-07-14T10:10:00.000Z" },
    { date: "2026-07-15", iso: "2026-07-15T10:10:00.000Z" }
  ]);
});

test("dispatches only Peach Daily News and deduplicates the same slot", () => {
  const { context, fetchCalls, properties } = createHarness();
  const first = vm.runInContext(
    `dispatchPeachSlotOnce_("primary", new Date("2026-07-14T10:00:00Z"))`,
    context
  );
  const second = vm.runInContext(
    `dispatchPeachSlotOnce_("primary", new Date("2026-07-14T10:01:00Z"))`,
    context
  );

  assert.equal(first.dispatched, true);
  assert.equal(second.dispatched, false);
  assert.equal(second.reason, "slot-already-dispatched");
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://api.github.com/repos/babelovelg-stack/peach-daily-news-playback/actions/workflows/peach-daily-news.yml/dispatches"
  );
  assert.deepEqual(JSON.parse(fetchCalls[0].options.payload), {
    ref: "main",
    inputs: { scheduled_trigger: "true" }
  });
  assert.equal(properties.get("PEACH_PRIMARY_DISPATCH_DATE"), "2026-07-14");
});
