const MS_PER_HOUR = 60 * 60 * 1000;

function requireValidDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${label} 不是有效时间`);
  }
  return date;
}

function requireValidSendHour(value) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("sendHour 必须是 0 到 23 之间的整数");
  }
  return hour;
}

function requireValidWindowHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("windowHours 必须是正数");
  }
  return hours;
}

function localDateKey(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function reportCutoffForDate(
  dateKey,
  { timezone = "Asia/Shanghai", sendHour = 18 } = {}
) {
  if (timezone !== "Asia/Shanghai") {
    throw new Error("当前仅支持 Asia/Shanghai 时区");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("日期必须使用 YYYY-MM-DD 格式");
  }

  const hour = requireValidSendHour(sendHour);
  const cutoff = requireValidDate(
    `${dateKey}T${String(hour).padStart(2, "0")}:00:00+08:00`,
    "推送截止点"
  );
  if (localDateKey(cutoff, timezone) !== dateKey) {
    throw new Error(`日期不存在：${dateKey}`);
  }
  return cutoff;
}

export function reportCutoffForInstant(
  value = new Date(),
  { timezone = "Asia/Shanghai", sendHour = 18 } = {}
) {
  const instant = requireValidDate(value, "当前时间");
  const cutoff = reportCutoffForDate(localDateKey(instant, timezone), {
    timezone,
    sendHour
  });
  if (cutoff.getTime() <= instant.getTime()) return cutoff;
  return new Date(cutoff.getTime() - 24 * MS_PER_HOUR);
}

export function newsWindowBounds(cutoffValue, windowHours = 24) {
  const end = requireValidDate(cutoffValue, "新闻收集截止点");
  const hours = requireValidWindowHours(windowHours);
  return {
    start: new Date(end.getTime() - hours * MS_PER_HOUR),
    end
  };
}

export function isPublishedInNewsWindow(publishedValue, cutoffValue, windowHours = 24) {
  const published = publishedValue instanceof Date
    ? publishedValue.getTime()
    : typeof publishedValue === "number"
      ? publishedValue
      : Date.parse(publishedValue);
  if (!Number.isFinite(published)) return false;

  const { start, end } = newsWindowBounds(cutoffValue, windowHours);
  return published > start.getTime() && published <= end.getTime();
}
