import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

function localParts(date, timezone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDateKey(value) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function evaluatePeachSchedule({
  eventName,
  scheduledTrigger = false,
  lastSentDate = "",
  now = new Date(),
  requestedDate = "",
  timezone = "Asia/Shanghai",
  sendHour = 18,
  catchupEndHour = 23,
  overnightCatchupEndHour = 5
}) {
  if (eventName !== "schedule" && !scheduledTrigger) {
    return { shouldSend: true, reason: "manual-dispatch", reportDate: requestedDate };
  }

  const parts = localParts(now, timezone);
  const hour = Number(parts.hour);
  const today = dateKey(parts);
  const eveningCatchup = hour >= sendHour && hour <= catchupEndHour;
  const overnightCatchup = hour >= 0 && hour <= overnightCatchupEndHour;
  if (!eveningCatchup && !overnightCatchup) {
    return { shouldSend: false, reason: `outside-send-window:${parts.hour}`, reportDate: "" };
  }

  const targetDate = overnightCatchup ? previousDateKey(today) : today;
  if (lastSentDate && lastSentDate >= targetDate) {
    return { shouldSend: false, reason: `already-sent:${targetDate}`, reportDate: "" };
  }

  return overnightCatchup
    ? { shouldSend: true, reason: `overnight-backfill:${targetDate}`, reportDate: targetDate }
    : { shouldSend: true, reason: `scheduled-catchup:${parts.hour}`, reportDate: "" };
}

async function readLastSentDate(statePath) {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    return String(state.lastSentDate || "");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function runCli() {
  const result = evaluatePeachSchedule({
    eventName: process.env.GITHUB_EVENT_NAME || "workflow_dispatch",
    scheduledTrigger: process.env.PEACH_NEWS_SCHEDULED_TRIGGER === "true",
    lastSentDate: await readLastSentDate(process.env.PEACH_NEWS_STATE_FILE || "peach-news-state.json"),
    now: process.env.PEACH_SCHEDULE_NOW ? new Date(process.env.PEACH_SCHEDULE_NOW) : new Date(),
    requestedDate: process.env.PEACH_NEWS_DATE || "",
    timezone: process.env.PEACH_NEWS_TIMEZONE || "Asia/Shanghai",
    sendHour: Number(process.env.PEACH_NEWS_SEND_HOUR || 18),
    catchupEndHour: Number(process.env.PEACH_NEWS_CATCHUP_END_HOUR || 23),
    overnightCatchupEndHour: Number(process.env.PEACH_NEWS_OVERNIGHT_END_HOUR || 5)
  });

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, [
      `should_send=${result.shouldSend}`,
      `reason=${result.reason}`,
      `report_date=${result.reportDate}`,
      ""
    ].join("\n"));
  }
  console.log(`Peach send gate: ${result.shouldSend} (${result.reason})${result.reportDate ? ` report_date=${result.reportDate}` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
