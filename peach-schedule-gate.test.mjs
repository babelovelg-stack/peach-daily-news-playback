import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePeachSchedule } from "./peach-schedule-gate.mjs";

const timezone = "Asia/Shanghai";

function evaluate({ now, lastSentDate = "2026-07-11", eventName = "schedule", requestedDate = "", scheduledTrigger = false }) {
  return evaluatePeachSchedule({
    eventName,
    scheduledTrigger,
    lastSentDate,
    now: new Date(now),
    requestedDate,
    timezone,
    sendHour: 18,
    catchupEndHour: 23,
    overnightCatchupEndHour: 5
  });
}

test("manual dispatch remains allowed and preserves an optional requested date", () => {
  assert.deepEqual(
    evaluate({
      now: "2026-07-13T02:00:00Z",
      eventName: "workflow_dispatch",
      requestedDate: "2026-07-12"
    }),
    { shouldSend: true, reason: "manual-dispatch", reportDate: "2026-07-12" }
  );
});

test("an external cloud dispatch uses the scheduled window and same-day dedupe", () => {
  assert.deepEqual(
    evaluate({
      now: "2026-07-14T10:00:00Z",
      eventName: "workflow_dispatch",
      scheduledTrigger: true,
      lastSentDate: "2026-07-13"
    }),
    { shouldSend: true, reason: "scheduled-catchup:18", reportDate: "" }
  );

  assert.deepEqual(
    evaluate({
      now: "2026-07-14T10:10:00Z",
      eventName: "workflow_dispatch",
      scheduledTrigger: true,
      lastSentDate: "2026-07-14"
    }),
    { shouldSend: false, reason: "already-sent:2026-07-14", reportDate: "" }
  );
});

test("a delayed 18:00 schedule still sends when GitHub starts it at 19:05", () => {
  assert.deepEqual(
    evaluate({ now: "2026-07-12T11:05:00Z" }),
    { shouldSend: true, reason: "scheduled-catchup:19", reportDate: "" }
  );
});

test("the catch-up window does not send the same date twice", () => {
  assert.deepEqual(
    evaluate({ now: "2026-07-12T13:15:00Z", lastSentDate: "2026-07-12" }),
    { shouldSend: false, reason: "already-sent:2026-07-12", reportDate: "" }
  );
});

test("a next-day overnight fallback backfills only the missing previous date", () => {
  assert.deepEqual(
    evaluate({ now: "2026-07-12T16:30:00Z" }),
    { shouldSend: true, reason: "overnight-backfill:2026-07-12", reportDate: "2026-07-12" }
  );
});

test("the overnight fallback skips when the previous date was already sent", () => {
  assert.deepEqual(
    evaluate({ now: "2026-07-12T16:30:00Z", lastSentDate: "2026-07-12" }),
    { shouldSend: false, reason: "already-sent:2026-07-12", reportDate: "" }
  );
});

test("scheduled runs outside the evening and overnight windows are rejected", () => {
  assert.deepEqual(
    evaluate({ now: "2026-07-12T09:59:00Z" }),
    { shouldSend: false, reason: "outside-send-window:17", reportDate: "" }
  );
  assert.deepEqual(
    evaluate({ now: "2026-07-12T22:00:00Z" }),
    { shouldSend: false, reason: "outside-send-window:06", reportDate: "" }
  );
});
