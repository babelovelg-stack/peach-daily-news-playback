const PEACH_CONFIG = Object.freeze({
  owner: "babelovelg-stack",
  repo: "peach-daily-news-playback",
  workflow: "peach-daily-news.yml",
  workflowName: "Peach Daily News",
  workflowPath: ".github/workflows/peach-daily-news.yml",
  ref: "main",
  timezone: "Asia/Shanghai",
  utcOffset: "+08:00",
  slots: Object.freeze({
    primary: Object.freeze({ handler: "peachCloudPrimary", hour: 18, minute: 0 }),
    backup: Object.freeze({ handler: "peachCloudBackup", hour: 18, minute: 10 })
  })
});

const PEACH_KEYS = Object.freeze({
  githubToken: "GITHUB_TOKEN",
  primaryTarget: "PEACH_PRIMARY_TARGET_DATE",
  backupTarget: "PEACH_BACKUP_TARGET_DATE",
  primaryDispatch: "PEACH_PRIMARY_DISPATCH_DATE",
  backupDispatch: "PEACH_BACKUP_DISPATCH_DATE"
});

const PEACH_REPAIR_HANDLER = "repairPeachCloudSchedule";

function installPeachCloudSchedule() {
  return withPeachLock_(function () {
    const validation = validatePeachConfiguration();
    removePeachManagedTriggers_();

    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(PEACH_KEYS.primaryTarget);
    properties.deleteProperty(PEACH_KEYS.backupTarget);

    ScriptApp.newTrigger(PEACH_REPAIR_HANDLER).timeBased().everyHours(1).create();
    const schedule = ensurePeachDailyTriggers_(new Date());

    return {
      installed: true,
      workflow: validation.workflow,
      primary: schedule.primary,
      backup: schedule.backup,
      repairTrigger: PEACH_REPAIR_HANDLER
    };
  });
}

function uninstallPeachCloudSchedule() {
  return withPeachLock_(function () {
    removePeachManagedTriggers_();
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(PEACH_KEYS.primaryTarget);
    properties.deleteProperty(PEACH_KEYS.backupTarget);
    return { installed: false };
  });
}

function peachCloudPrimary() {
  return runPeachSlot_("primary");
}

function peachCloudBackup() {
  return runPeachSlot_("backup");
}

function repairPeachCloudSchedule() {
  return withPeachLock_(function () {
    return ensurePeachDailyTriggers_(new Date());
  });
}

function validatePeachConfiguration() {
  const response = UrlFetchApp.fetch(peachWorkflowUrl_(), {
    method: "get",
    headers: peachGithubHeaders_(),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code !== 200) {
    throw new Error("GitHub workflow validation failed (HTTP " + code + "): " + safePeachBody_(body));
  }

  const workflow = JSON.parse(body);
  if (
    workflow.name !== PEACH_CONFIG.workflowName ||
    workflow.path !== PEACH_CONFIG.workflowPath ||
    workflow.state !== "active"
  ) {
    throw new Error("The configured workflow is not the active Peach Daily News workflow.");
  }

  return {
    valid: true,
    workflow: workflow.name,
    path: workflow.path,
    state: workflow.state
  };
}

function peachCloudStatus() {
  const properties = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers().map(function (trigger) {
    return {
      handler: trigger.getHandlerFunction(),
      source: String(trigger.getTriggerSource()),
      id: trigger.getUniqueId()
    };
  });

  return {
    workflow: PEACH_CONFIG.workflowPath,
    timezone: PEACH_CONFIG.timezone,
    primaryTargetDate: properties.getProperty(PEACH_KEYS.primaryTarget) || "",
    backupTargetDate: properties.getProperty(PEACH_KEYS.backupTarget) || "",
    lastPrimaryDispatchDate: properties.getProperty(PEACH_KEYS.primaryDispatch) || "",
    lastBackupDispatchDate: properties.getProperty(PEACH_KEYS.backupDispatch) || "",
    triggers: triggers
  };
}

function runPeachSlot_(slotName) {
  return withPeachLock_(function () {
    const now = new Date();
    ensurePeachDailyTriggers_(now);
    return dispatchPeachSlotOnce_(slotName, now);
  });
}

function dispatchPeachSlotOnce_(slotName, now) {
  const dispatchKey = slotName === "primary" ? PEACH_KEYS.primaryDispatch : PEACH_KEYS.backupDispatch;
  const properties = PropertiesService.getScriptProperties();
  const dateKey = peachDateKey_(now);

  if (properties.getProperty(dispatchKey) === dateKey) {
    return { dispatched: false, reason: "slot-already-dispatched", slot: slotName, date: dateKey };
  }

  const response = UrlFetchApp.fetch(peachWorkflowUrl_() + "/dispatches", {
    method: "post",
    contentType: "application/json",
    headers: peachGithubHeaders_(),
    payload: JSON.stringify({
      ref: PEACH_CONFIG.ref,
      inputs: { scheduled_trigger: "true" }
    }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();

  if (code !== 204) {
    throw new Error(
      "GitHub Peach workflow dispatch failed (HTTP " +
        code +
        "): " +
        safePeachBody_(response.getContentText())
    );
  }

  properties.setProperty(dispatchKey, dateKey);
  return { dispatched: true, slot: slotName, date: dateKey, workflow: PEACH_CONFIG.workflowPath };
}

function ensurePeachDailyTriggers_(now) {
  return {
    primary: ensurePeachSlotTrigger_("primary", now),
    backup: ensurePeachSlotTrigger_("backup", now)
  };
}

function ensurePeachSlotTrigger_(slotName, now) {
  const slot = PEACH_CONFIG.slots[slotName];
  const targetKey = slotName === "primary" ? PEACH_KEYS.primaryTarget : PEACH_KEYS.backupTarget;
  const target = nextPeachSlot_(now, slot.hour, slot.minute);
  const properties = PropertiesService.getScriptProperties();
  const existing = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === slot.handler;
  });

  if (properties.getProperty(targetKey) === target.date && existing.length === 1) {
    return { date: target.date, time: peachTimeLabel_(slot.hour, slot.minute), reused: true };
  }

  existing.forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(slot.handler).timeBased().at(target.when).create();
  properties.setProperty(targetKey, target.date);

  return { date: target.date, time: peachTimeLabel_(slot.hour, slot.minute), reused: false };
}

function nextPeachSlot_(now, hour, minute) {
  let dateKey = peachDateKey_(now);
  let when = peachDateAt_(dateKey, hour, minute);

  if (when.getTime() <= now.getTime()) {
    dateKey = addPeachDays_(dateKey, 1);
    when = peachDateAt_(dateKey, hour, minute);
  }

  return { date: dateKey, when: when };
}

function peachDateAt_(dateKey, hour, minute) {
  return new Date(
    dateKey +
      "T" +
      String(hour).padStart(2, "0") +
      ":" +
      String(minute).padStart(2, "0") +
      ":00" +
      PEACH_CONFIG.utcOffset
  );
}

function addPeachDays_(dateKey, days) {
  const value = new Date(dateKey + "T12:00:00" + PEACH_CONFIG.utcOffset);
  value.setUTCDate(value.getUTCDate() + days);
  return peachDateKey_(value);
}

function peachDateKey_(value) {
  return Utilities.formatDate(value, PEACH_CONFIG.timezone, "yyyy-MM-dd");
}

function peachTimeLabel_(hour, minute) {
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function peachWorkflowUrl_() {
  return (
    "https://api.github.com/repos/" +
    PEACH_CONFIG.owner +
    "/" +
    PEACH_CONFIG.repo +
    "/actions/workflows/" +
    encodeURIComponent(PEACH_CONFIG.workflow)
  );
}

function peachGithubHeaders_() {
  return {
    Authorization: "Bearer " + peachGithubToken_(),
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function peachGithubToken_() {
  const token = PropertiesService.getScriptProperties().getProperty(PEACH_KEYS.githubToken);
  if (!token || !token.trim()) {
    throw new Error("Missing GITHUB_TOKEN in Apps Script properties.");
  }
  return token.trim();
}

function removePeachManagedTriggers_() {
  const handlers = [
    PEACH_CONFIG.slots.primary.handler,
    PEACH_CONFIG.slots.backup.handler,
    PEACH_REPAIR_HANDLER
  ];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function safePeachBody_(body) {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function withPeachLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("Could not acquire the Peach scheduler lock.");
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
