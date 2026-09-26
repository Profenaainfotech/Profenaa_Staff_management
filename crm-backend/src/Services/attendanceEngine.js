// =====================================================
// ATTENDANCE ENGINE  (database + notifications around attendanceCore)
// =====================================================
const Attendance = require("../Models/Attendance.Model");
const AttendanceEvent = require("../Models/AttendanceEvent.Model");
const User = require("../Models/User.Model");
const Branch = require("../Models/Branch.Model");
const Device = require("../Models/Device.Model");
const Holiday = require("../Models/Holiday.Model");
const OfficeIp = require("../Models/OfficeIp.Model");

const core = require("./attendanceCore");
const { getSettings } = require("./settings.service");
const notify = require("./notification.service");
const { isAuthorizedNetwork } = require("../Utils/wifi");
const {
  dateKey,
  endOfDay,
  minutesOfDay,
  timeToMinutes,
  formatMinutes,
  weekday,
} = require("../Utils/time");
const { normalizeIp } = require("../Utils/network");

// CRM_LOGIN mode has no Wi-Fi heartbeat: "are they still around" instead comes from how
// recently their tab last pinged (see pingActive in UserDashboard.jsx). It pings every
// minute, so 3 minutes of silence is a comfortably safe margin before treating the tab
// as gone.
const CRM_ALIVE_WINDOW_MS = 3 * 60 * 1000;

const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const MAX_STALE_MS = 48 * 60 * 60 * 1000;

// ----------------------------------------------------
// One writer per employee at a time (live heartbeat vs. queue replay vs. monitor)
// Single-process lock. If the API is ever scaled to several instances, put
// the agent traffic behind sticky routing or a queue.
// ----------------------------------------------------
const locks = new Map();
function withUserLock(userId, fn) {
  const key = String(userId);
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  next
    .finally(() => {
      if (locks.get(key) === next) locks.delete(key);
    })
    .catch(() => {});
  return next;
}

function buildCtx(user, branch, settings) {
  return {
    hb: branch?.heartbeatInterval || 90,
    grace: branch?.gracePeriod || 300,
    shiftStart: user.shiftStart || "09:30",
    shiftEnd: user.shiftEnd || "18:30",
    settings,
    offDay: null, // { type: "WEEKLY_OFF" | "HOLIDAY" } on a day off
  };
}

// ----------------------------------------------------
// Days off: only the weekly off (Sunday by default) plus holidays the admin adds
// ----------------------------------------------------
const weeklyOff = (settings, date) => ((settings?.weeklyOffDays || []).includes(weekday(date)) ? { type: "WEEKLY_OFF" } : null);

const holidayCache = new Map(); // "date|branch" -> { at, value }
async function offDayFor(settings, branchId, date) {
  const w = weeklyOff(settings, date);
  if (w) return w;
  const key = `${date}|${branchId || ""}`;
  const hit = holidayCache.get(key);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.value;
  let value = null;
  try {
    const list = await Holiday.find({ date }).select("branchId").lean();
    if (list.some((h) => !h.branchId || String(h.branchId) === String(branchId || ""))) value = { type: "HOLIDAY" };
  } catch (_) {
    /* a calendar problem must never block attendance */
  }
  holidayCache.set(key, { at: Date.now(), value });
  return value;
}

// ----------------------------------------------------
// Office network learning: addresses the agents connect from while on the office Wi-Fi
// ----------------------------------------------------
const seenIps = new Map();
async function learnOfficeIp(branchId, ip) {
  const clean = normalizeIp(ip);
  if (!clean) return;
  const k = `${branchId}|${clean}`;
  if (Date.now() - (seenIps.get(k) || 0) < 10 * 60 * 1000) return;
  seenIps.set(k, Date.now());
  try {
    await OfficeIp.updateOne({ branchId, ip: clean }, { $set: { lastSeenAt: new Date() } }, { upsert: true });
  } catch (_) {
    /* non-critical */
  }
}

// ----------------------------------------------------
// Events + notifications
// ----------------------------------------------------
async function persistEvents(att, user, deviceId, events) {
  if (!events?.length) return;
  try {
    await AttendanceEvent.insertMany(
      events.map((e) => ({
        userId: user._id,
        userName: user.name,
        attendanceId: att._id,
        date: att.date,
        deviceId: deviceId || null,
        branchId: att.branchId || null,
        type: e.type,
        ssid: e.ssid || "",
        bssid: e.bssid || "",
        message: e.message || "",
        meta: e.meta || {},
        occurredAt: e.at || new Date(),
      }))
    );
  } catch (err) {
    console.error("[Attendance] event log failed:", err.message);
  }
}

const clock = (d) =>
  new Date(d).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

async function dispatchNotes(att, user, branch, ctx, notes) {
  for (const n of notes || []) {
    try {
      const day = att.date;

      if (n.type === "FIRST_CHECK_IN") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "CHECK_IN",
          severity: "success",
          title: "Attendance started",
          message: `You are marked present at ${branch.name} (${clock(att.checkIn)}).`,
          link: "Attendance",
          dedupeKey: `checkin:${user._id}:${day}`,
        });
        const grace = Number(ctx.settings?.lateGraceMinutes ?? 10);
        if (att.lateMinutes > grace) {
          await notify.notifyAdmins({
            category: "attendance",
            type: "LATE_CHECK_IN",
            severity: "warning",
            title: `${user.name} checked in late`,
            message: `${att.lateMinutes} min after shift start (${ctx.shiftStart}) at ${branch.name}.`,
            link: "AdminAttendance",
            data: { userId: String(user._id), date: day },
            dedupeKey: `late:${user._id}:${day}`,
          });
        }
      }

      if (n.type === "RETURNED") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "RETURN",
          severity: "info",
          title: "Welcome back",
          message: "Your attendance is running again.",
          link: "Attendance",
          dedupeKey: `return:${user._id}:${day}:${att.sessions.length}`,
        });
      }

      if (n.type === "WARNING") {
        const mins = Math.max(1, Math.round(ctx.grace / 60));
        const text =
          n.reason === "WIFI_CHANGED"
            ? `Your computer moved to another network. Reconnect to the ${branch.name} office Wi-Fi within ${mins} minutes to keep your attendance running.`
            : n.reason === "WIFI_DISCONNECTED"
            ? `Wi-Fi is disconnected. Reconnect to the ${branch.name} office Wi-Fi within ${mins} minutes to keep your attendance running.`
            : `We lost contact with your computer. Attendance will pause in about ${mins} minutes unless it reconnects.`;
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "WIFI_WARNING",
          severity: "warning",
          title: "Office Wi-Fi not detected",
          message: text,
          link: "Attendance",
          data: { graceDeadline: n.graceDeadline },
          dedupeKey: `warn:${user._id}:${new Date(att.wifi.warningStartedAt || Date.now()).getTime()}`,
        });
      }

      if (n.type === "RECONNECTED") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "WIFI_RECONNECTED",
          severity: "success",
          title: "Back on office Wi-Fi",
          message: "Attendance is running normally.",
          link: "Attendance",
          dedupeKey: `recon:${user._id}:${Math.floor(Date.now() / 60000)}`,
        });
      }

      if (n.type === "OVERTIME_ASK") {
        const maxAsks = Math.max(1, Number(ctx.settings?.overtimeMaxAsks) || 3);
        const mins = n.repeat ? Number(ctx.settings?.overtimeRepeatMinutes) || 5 : Number(ctx.settings?.overtimePromptMinutes) || 10;
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "OVERTIME_ASK",
          severity: n.repeat ? "critical" : "warning",
          title: n.repeat ? `Still there? (ask ${n.unansweredCount} of ${maxAsks})` : "Your shift has ended - are you still working?",
          message: n.repeat
            ? `You have not answered yet. Answer within ${mins} minutes or you will be asked again. After ${maxAsks} unanswered asks your attendance ends at ${ctx.shiftEnd}${ctx.settings?.noResponseAction === "AUTO_LOGOUT" ? " and you will be signed out." : "."}`
            : `Answer within ${mins} minutes on the pop-up on your PC or on the Attendance page. Yes = overtime, No = finish for the day. No reply ends your attendance at ${ctx.shiftEnd} and marks a half day until you explain.`,
          link: "Attendance",
          data: { sound: true },
          dedupeKey: `ot-ask:${user._id}:${day}:${n.askId}`,
        });
      }

      if (n.type === "OVERTIME_CONFIRMED") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "OVERTIME_CONFIRMED",
          severity: "success",
          title: "Overtime is being recorded",
          message: "Time after your shift end is now counted separately as overtime.",
          link: "Attendance",
          dedupeKey: `ot-yes:${user._id}:${day}:${att.overtime?.askId}`,
        });
      }

      if (n.type === "OFFDAY_ASK") {
        const mins = Number(ctx.settings?.offDayAskMinutes) || 10;
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "OFFDAY_ASK",
          severity: "warning",
          title: "It's your day off - are you working today?",
          message: `Answer within ${mins} minutes. Yes = counted separately as day-off work. No, or no reply, and nothing is counted.`,
          link: "Attendance",
          data: { sound: true },
          dedupeKey: `off-ask:${user._id}:${day}:${n.askId}`,
        });
      }

      if (n.type === "OFFDAY_CONFIRMED") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "OFFDAY_CONFIRMED",
          severity: "success",
          title: "Today's work is being recorded",
          message: "Counted separately as day-off work, not as a normal working day.",
          link: "Attendance",
          dedupeKey: `off-yes:${user._id}:${day}:${att.offDayAsk?.askId}`,
        });
      }

      if (n.type === "OFFDAY_NO_RESPONSE") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "OFFDAY_NO_RESPONSE",
          severity: "info",
          title: "Nothing counted today",
          message: "You did not answer \"are you working today?\", so nothing was recorded - same as any other day off.",
          link: "Attendance",
          dedupeKey: `off-none:${user._id}:${day}`,
        });
      }

      if (n.type === "NO_RESPONSE") {
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "NO_RESPONSE",
          severity: "critical",
          title: "No reply at shift end - day marked half day",
          message: "You did not answer \"Are you still working?\". Open Attendance and explain what happened. An administrator can then make the day Present.",
          link: "Attendance",
          dedupeKey: `ot-none:${user._id}:${day}`,
        });
        await notify.notifyAdmins({
          category: "attendance",
          type: "NO_RESPONSE",
          severity: "warning",
          title: `${user.name} did not answer the shift-end question`,
          message: `Session ended at ${ctx.shiftEnd}. The day is a half day until they explain and you approve it (Attendance > Corrections).`,
          link: "AdminAttendance",
          data: { userId: String(user._id), date: day },
          dedupeKey: `ot-none-admin:${user._id}:${day}`,
        });
      }

      if (n.type === "FORCE_LOGOUT") {
        user.isOnline = false;
        user.logoutTime = new Date();
        await user.save();
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "FORCE_LOGOUT",
          severity: "critical",
          title: "Signed out - no reply at shift end",
          message: "You were signed out because \"Are you still working?\" went unanswered. Sign in again, and open Attendance to explain what happened.",
          link: "Attendance",
          dedupeKey: `ot-logout:${user._id}:${day}`,
        });
        await notify.notifyAdmins({
          category: "attendance",
          type: "FORCE_LOGOUT",
          severity: "warning",
          title: `${user.name} was signed out automatically`,
          message: `No reply to the shift-end question after every repeat ask. Signed out and the day is a half day until they explain (Attendance > Corrections).`,
          link: "AdminAttendance",
          data: { userId: String(user._id), date: day },
          dedupeKey: `ot-logout-admin:${user._id}:${day}`,
        });
      }

      if (n.type === "SESSION_ENDED") {
        const label = core.END_REASON_LABELS[n.reason] || n.reason;
        const bad = ["WIFI_DISCONNECTED", "WIFI_CHANGED", "DEVICE_OFFLINE", "CRM_LOGOUT_UNVERIFIED", "NO_RESPONSE"].includes(n.reason);
        await notify.notifyUser(user._id, {
          category: "attendance",
          type: "SESSION_ENDED",
          severity: bad ? "warning" : "info",
          title: "Attendance session ended",
          message: `${label}. Worked so far today: ${att.totalHours}.`,
          link: "Attendance",
          dedupeKey: `end:${user._id}:${day}:${att.sessions.length}:${n.reason}`,
        });
      }
    } catch (err) {
      console.error("[Attendance] notification failed:", err.message);
    }
  }
}

// ----------------------------------------------------
// Finalising a day
// ----------------------------------------------------
function finalizeDoc(att, ctx, settings, now = new Date()) {
  const open = core.openSession(att);
  if (open) {
    const end = Math.min(
      new Date(open.lastPresentAt || open.checkIn).getTime(),
      endOfDay(att.date).getTime()
    );
    core.closeOpenSession(att, end, "DAY_ROLLOVER", now);
  }
  const dctx = {
    ...ctx,
    settings: ctx.settings || settings,
    offDay: att.dayType && att.dayType !== "WORKING" ? { type: att.dayType } : weeklyOff(settings, att.date),
  };
  core.recompute(att, dctx);
  if (att.sessions.length) {
    att.status = core.effectiveStatus(att, settings);
  }
  att.finalized = true;
  return att;
}

async function rolloverOldDays(user, todayKeyStr, ctx, settings) {
  const stale = await Attendance.find({
    userId: user._id,
    date: { $lt: todayKeyStr },
    "wifi.state": { $in: ["CONNECTED", "WARNING"] },
  });
  for (const old of stale) {
    finalizeDoc(old, ctx, settings);
    await old.save();
  }
}

// ----------------------------------------------------
// Live state returned to the agent / UI
// ----------------------------------------------------
function liveState(att, ctx, now = new Date(), extra = {}) {
  const wifi = att?.wifi || {};
  const state = att && wifi.state ? wifi.state : "IDLE";
  const grace =
    state === "WARNING" && wifi.graceDeadline
      ? Math.max(0, Math.round((new Date(wifi.graceDeadline).getTime() - now.getTime()) / 1000))
      : null;
  return {
    tracking: true,
    state,
    warningReason: state === "WARNING" ? wifi.warningReason : null,
    graceRemainingSeconds: grace,
    graceDeadline: state === "WARNING" ? wifi.graceDeadline : null,
    workedMinutes: att ? core.workedMinutesLive(att, ctx, now) : 0,
    checkIn: att?.checkIn || null,
    sessions: att?.sessions?.length || 0,
    heartbeatInterval: ctx.hb,
    gracePeriod: ctx.grace,
    serverTime: now.toISOString(),
    signedOut: att ? core.isSignedOut(att) : false,
    dayType: att?.dayType || "WORKING",
    overtimeMinutes: att?.overtimeMinutes || 0,
    offDayMinutes: att?.offDayMinutes || 0,
    overtimeState: att?.overtime?.state || "NONE",
    offDayAskState: att?.offDayAsk?.state || "NONE",
    prompt:
      att?.overtime?.state === "ASKING" && att.overtime.deadline
        ? {
            type: "OVERTIME",
            askId: att.overtime.askId,
            deadline: att.overtime.deadline,
            secondsLeft: Math.max(0, Math.round((new Date(att.overtime.deadline).getTime() - now.getTime()) / 1000)),
            shiftEnd: ctx.shiftEnd,
          }
        : att?.offDayAsk?.state === "ASKING" && att.offDayAsk.deadline
        ? {
            type: "OFFDAY",
            askId: att.offDayAsk.askId,
            deadline: att.offDayAsk.deadline,
            secondsLeft: Math.max(0, Math.round((new Date(att.offDayAsk.deadline).getTime() - now.getTime()) / 1000)),
            dayType: att.dayType,
          }
        : null,
    review: att?.review && att.review.state && att.review.state !== "NONE" ? { state: att.review.state, reason: att.review.reason } : null,
    ...extra,
  };
}

// ----------------------------------------------------
// Ingest ONE reading from an agent
// ----------------------------------------------------
const rejectedLog = new Map(); // "userId|bssid" -> last logged ms

async function ingestSignal({ device, signal, live = true, ip = "" }) {
  const user = await User.findById(device.userId);
  if (!user || user.isActive === false) return { tracking: false, reason: "USER_INACTIVE" };
  if (user.attendanceMode !== "WIFI") return { tracking: false, reason: "MODE_NOT_WIFI" };

  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  if (!branch || branch.active === false) return { tracking: false, reason: "NO_BRANCH" };

  return withUserLock(user._id, () => processSignal({ user, branch, device, signal, live, ip }));
}

async function processSignal({ user, branch, device, signal, live, ip = "", retry = true }) {
  const now = new Date();
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);

  let t = signal.occurredAt ? new Date(signal.occurredAt) : now;
  if (Number.isNaN(t.getTime())) t = now;
  if (t.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) t = now; // agent clock ahead
  if (now.getTime() - t.getTime() > MAX_STALE_MS) return { tracking: true, state: "IDLE", ignored: "STALE" };

  const kind = signal.kind === "SHUTDOWN" ? "SHUTDOWN" : "HEARTBEAT";
  const connected = Boolean(signal.connected);
  const present = connected && isAuthorizedNetwork(branch, signal.ssid, signal.bssid);
  const date = dateKey(t);
  ctx.offDay = await offDayFor(settings, branch._id, date);

  await rolloverOldDays(user, date, ctx, settings);

  let att = await Attendance.findOne({ userId: user._id, date });
  let created = false;

  if (!att) {
    if (!(present && kind === "HEARTBEAT")) {
      await touchDevice(device, signal, t, live, ip);
      await logRejected(user, branch, device, signal, connected, present, t);
      return liveState(null, ctx, now, { present });
    }
    att = new Attendance({
      userId: user._id,
      userName: user.name,
      date,
      attendanceSource: "OFFICE_WIFI",
      branchId: branch._id,
      deviceId: device._id,
      status: "Present",
    });
    created = true;
  }

  const sig = {
    kind,
    t,
    present,
    connected,
    ssid: signal.ssid || "",
    bssid: signal.bssid || "",
    deviceId: device._id,
    live,
  };

  const out = core.applySignal(att, ctx, sig);

  if (out.ignored) {
    await touchDevice(device, signal, t, live, ip);
    return liveState(att, ctx, now, { present, ignored: "DUPLICATE" });
  }

  if (created && att.sessions.length === 0) {
    // presence outside the allowed check-in window - nothing to record
    await touchDevice(device, signal, t, live, ip);
    return liveState(null, ctx, now, { present, outsideWindow: true });
  }

  att.branchId = branch._id;
  att.deviceId = device._id;
  if (att.attendanceSource === "CRM_LOGIN" && att.sessions.length) att.attendanceSource = "OFFICE_WIFI";
  core.recompute(att, ctx);

  try {
    await att.save();
  } catch (err) {
    // two first-of-the-day readings raced each other: retry once against the winner
    if (err.code === 11000 && retry) {
      return processSignal({ user, branch, device, signal, live, ip, retry: false });
    }
    throw err;
  }

  await persistEvents(att, user, device._id, out.events);
  await dispatchNotes(att, user, branch, ctx, out.notes);
  await touchDevice(device, signal, t, live, ip);
  if (!present) await logRejected(user, branch, device, signal, connected, present, t);
  if (present && live && ip) await learnOfficeIp(branch._id, ip);

  if (out.events.length || out.notes.length) {
    notify.pushAttendanceUpdate(user._id, { date, state: att.wifi.state });
  }

  return liveState(att, ctx, now, { present });
}

async function touchDevice(device, signal, t, live, ip = "") {
  if (!live) return;
  try {
    const set = { lastSeenAt: new Date(), lastSsid: signal.ssid || "", lastBssid: signal.bssid || "" };
    if (normalizeIp(ip)) set.lastIp = normalizeIp(ip);
    await Device.updateOne({ _id: device._id }, { $set: set });
  } catch (_) {
    /* non-critical */
  }
}

/** Remember networks that were rejected, so the admin can spot an unregistered access point. */
async function logRejected(user, branch, device, signal, connected, present, t) {
  if (!connected || present || !signal.bssid) return;
  const key = `${user._id}|${String(signal.bssid).toUpperCase()}`;
  const last = rejectedLog.get(key) || 0;
  if (Date.now() - last < 30 * 60 * 1000) return;
  rejectedLog.set(key, Date.now());
  try {
    await AttendanceEvent.create({
      userId: user._id,
      userName: user.name,
      date: dateKey(t),
      deviceId: device._id,
      branchId: branch._id,
      type: "REJECTED_NETWORK",
      ssid: signal.ssid || "",
      bssid: String(signal.bssid || "").toUpperCase(),
      message: `Connected to a network that is not registered for ${branch.name}`,
      occurredAt: t,
    });
  } catch (err) {
    console.error("[Attendance] rejected-network log failed:", err.message);
  }
}

/** Replay an offline queue: strictly in time order, flagged live=false */
async function ingestBatch({ device, events, ip = "" }) {
  const list = (Array.isArray(events) ? events : [])
    .slice(0, 500)
    .map((e) => ({ ...e, _t: new Date(e.occurredAt || Date.now()).getTime() }))
    .filter((e) => !Number.isNaN(e._t))
    .sort((a, b) => a._t - b._t);

  let last = null;
  let processed = 0;
  for (const e of list) {
    last = await ingestSignal({ device, signal: e, live: false, ip });
    processed += 1;
  }
  return { processed, state: last };
}

// ----------------------------------------------------
// Monitor tick: notice silence, expire grace periods, apply shift-end cap
// ----------------------------------------------------
async function tickOne(attId, now, cache) {
  const att = await Attendance.findById(attId);
  if (!att) return null;

  // CRM_LOGIN mode has no Wi-Fi heartbeat at all - "still open" just means checked in,
  // not yet checked out. Everything else below (backfilling a session, deciding whether
  // they are still around) is specific to that mode; a WIFI-mode record is completely
  // unaffected by any of it.
  const isCrmOpen = att.attendanceSource === "CRM_LOGIN" && att.checkIn && !att.checkOut;
  if (!isCrmOpen && !["CONNECTED", "WARNING"].includes(att.wifi?.state)) return null;

  let user = cache.users.get(String(att.userId));
  if (!user) {
    user = await User.findById(att.userId);
    cache.users.set(String(att.userId), user);
  }
  if (!user) return null;

  let branch = att.branchId ? cache.branches.get(String(att.branchId)) : null;
  if (!branch && att.branchId) {
    branch = await Branch.findById(att.branchId);
    cache.branches.set(String(att.branchId), branch);
  }

  const ctx = buildCtx(user, branch, cache.settings);
  ctx.offDay = await offDayFor(cache.settings, att.branchId, att.date);

  if (isCrmOpen) {
    // Adopt the flat checkIn/checkOut into the same sessions[] shape a Wi-Fi day
    // already uses, the FIRST time the engine ever sees this day - from then on every
    // existing, already-tested piece (the cap, the overtime question, the day-off
    // question) runs completely unchanged, exactly as it does for Wi-Fi.
    if (!att.sessions?.length) att.sessions = [{ checkIn: att.checkIn, checkOut: null }];
    // No heartbeat ever touches lastPresentAt for this mode, so do it here on every
    // tick instead - otherwise the live running total reads as 0 the entire time the
    // session stays open (totalMinutesOf falls back to checkIn itself with nothing else
    // to go on), even though the person is clearly still working.
    att.sessions[0].lastPresentAt = now;
    // No heartbeat to check - "are they still around" is instead "did their tab ping
    // recently" (see pingActive in UserDashboard.jsx / updateLastActive on the backend).
    const lastActive = user.lastActivity ? new Date(user.lastActivity).getTime() : 0;
    ctx.crmAlive = Date.now() - lastActive < CRM_ALIVE_WINDOW_MS;
  }

  const out = core.applyMonitorTick(att, ctx, now);

  if (isCrmOpen && att.sessions?.[0]?.checkOut && !att.checkOut) {
    // Keep the flat field in step with the session it came from, so the ordinary CRM
    // logout handler (which still checks "is checkOut already set?") sees this day as
    // already closed and does not also try to close it a second time.
    att.checkOut = att.sessions[0].checkOut;
  }

  if (out.events.length || out.notes.length || out.repaired) {
    core.recompute(att, ctx);
    await att.save();
    await persistEvents(att, user, att.deviceId, out.events);
    await dispatchNotes(att, user, branch || { name: "the office" }, ctx, out.notes);
    notify.pushAttendanceUpdate(user._id, { date: att.date, state: att.wifi.state });
  } else if (isCrmOpen) {
    // Nothing asked/closed this tick, but lastPresentAt (and possibly the sessions[]
    // backfill) still changed above and needs to be saved either way, so the live
    // running total stays accurate between now and the next tick.
    core.recompute(att, ctx);
    await att.save();
  }

  return { att, user, ctx, branchId: att.branchId ? String(att.branchId) : null };
}

async function runMonitorTick(now = new Date()) {
  const settings = await getSettings();
  const cache = { users: new Map(), branches: new Map(), settings };
  const open = await Attendance.find({
    $or: [{ "wifi.state": { $in: ["CONNECTED", "WARNING"] } }, { attendanceSource: "CRM_LOGIN", checkIn: { $ne: null }, checkOut: null }],
  }).select("_id userId");

  const snapshots = [];
  for (const d of open) {
    try {
      const snap = await withUserLock(d.userId, () => tickOne(d._id, now, cache));
      if (snap) snapshots.push(snap);
    } catch (err) {
      console.error("[Monitor] tick failed:", err.message);
    }
  }

  await detectOutage(snapshots, now, cache);
  return { checked: open.length };
}

/**
 * Alert-only outage detection: if most people who SHOULD still be working at a
 * branch went silent at once, it is probably the router / internet, not people
 * leaving. Sessions are not held open (that would also hold them open when
 * everyone really goes home) - the admin gets an alert and can correct times.
 */
async function detectOutage(snapshots, now, cache) {
  const nowMin = minutesOfDay(now);
  const byBranch = new Map();
  for (const s of snapshots) {
    if (!s.branchId) continue;
    const shouldWork =
      nowMin >= timeToMinutes(s.ctx.shiftStart, 570) && nowMin < timeToMinutes(s.ctx.shiftEnd, 1110) - 15;
    if (!shouldWork) continue;
    const row = byBranch.get(s.branchId) || { total: 0, silent: 0 };
    row.total += 1;
    if (s.att.wifi.state === "WARNING" && s.att.wifi.warningReason === "DEVICE_OFFLINE") row.silent += 1;
    byBranch.set(s.branchId, row);
  }

  for (const [branchId, row] of byBranch) {
    if (row.silent >= 3 && row.silent / row.total >= 0.6) {
      const branch = cache.branches.get(branchId) || (await Branch.findById(branchId));
      await notify.notifyAdmins({
        category: "attendance",
        type: "POSSIBLE_OUTAGE",
        severity: "critical",
        title: `Possible Wi-Fi / internet outage at ${branch?.name || "a branch"}`,
        message: `${row.silent} of ${row.total} staff went silent at the same time. If the network was down, correct their times from Attendance > Corrections.`,
        link: "AdminAttendance",
        dedupeKey: `outage:${branchId}:${dateKey(now)}-${Math.floor(minutesOfDay(now) / 60)}`,
      });
    }
  }
}

// ----------------------------------------------------
// Manual times (admin edit / approved regularization)
// ----------------------------------------------------
async function applyManualTimes({ userId, date, checkIn, checkOut, by, note }) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("Staff member not found"), { status: 404 });

  const inAt = new Date(checkIn);
  const outAt = new Date(checkOut);
  if (Number.isNaN(inAt.getTime()) || Number.isNaN(outAt.getTime())) {
    throw Object.assign(new Error("Invalid check-in or check-out time"), { status: 400 });
  }
  if (outAt <= inAt) throw Object.assign(new Error("Check-out must be after check-in"), { status: 400 });
  if (dateKey(inAt) !== date || dateKey(outAt) !== date) {
    throw Object.assign(new Error("Both times must fall on the selected date (IST)"), { status: 400 });
  }

  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);

  return withUserLock(user._id, async () => {
    let att = await Attendance.findOne({ userId: user._id, date });
    const before = att
      ? { checkIn: att.checkIn, checkOut: att.checkOut, totalMinutes: att.totalMinutes, status: att.status, sessions: att.sessions.length }
      : null;

    if (!att) {
      att = new Attendance({ userId: user._id, userName: user.name, date });
    }

    att.sessions = [
      {
        checkIn: inAt,
        checkOut: outAt,
        lastPresentAt: outAt,
        endReason: "MANUAL",
        source: "MANUAL",
      },
    ];
    att.attendanceSource = "MANUAL";
    att.branchId = branch?._id || att.branchId || null;
    att.wifi.state = "ENDED";
    att.wifi.warningReason = null;
    att.wifi.warningStartedAt = null;
    att.wifi.graceDeadline = null;
    att.wifi.pendingEndReason = null;
    att.correctionReason = note || "";
    att.finalized = false;

    ctx.offDay = await offDayFor(settings, branch?._id, date);
    if (["PENDING_EXPLANATION", "EXPLAINED"].includes(att.review?.state)) {
      att.review.state = "APPROVED";
      att.review.decidedBy = by || "Admin";
      att.review.decidedAt = new Date();
      att.review.note = "Times set manually by an administrator";
    }
    core.recompute(att, ctx);
    att.status = core.effectiveStatus(att, settings);
    att.finalized = true;
    att.edits.push({
      by: by || "Admin",
      at: new Date(),
      note: note || "",
      before,
      after: { checkIn: att.checkIn, checkOut: att.checkOut, totalMinutes: att.totalMinutes, status: att.status },
    });
    await att.save();

    await persistEvents(att, user, null, [
      {
        type: "MANUAL_EDIT",
        message: `${by || "Admin"} set ${clock(inAt)} - ${clock(outAt)}${note ? ` (${note})` : ""}`,
        meta: { before },
        at: new Date(),
      },
    ]);
    notify.pushAttendanceUpdate(user._id, { date, state: "ENDED" });
    return att;
  });
}

/** Close whatever is open right now (staff deactivated / mode switched) */
async function closeOpenSessionFor(userId, reason = "MANUAL") {
  const user = await User.findById(userId);
  if (!user) return;
  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);
  await withUserLock(userId, async () => {
    const docs = await Attendance.find({ userId, "wifi.state": { $in: ["CONNECTED", "WARNING"] } });
    for (const att of docs) {
      const s = core.openSession(att);
      if (!s) continue;
      core.closeOpenSession(att, s.lastPresentAt || s.checkIn, reason, new Date());
      core.recompute(att, { ...ctx, offDay: await offDayFor(settings, user.branchId, att.date) });
      await att.save();
      notify.pushAttendanceUpdate(userId, { date: att.date, state: "ENDED" });
    }
  });
}

/** Nightly: close out days that are over */
async function finalizePastDays(todayKeyStr, limit = 300) {
  const docs = await Attendance.find({
    date: { $lt: todayKeyStr },
    finalized: { $ne: true },
    attendanceSource: { $in: ["OFFICE_WIFI", "MANUAL"] },
  }).limit(limit);

  if (!docs.length) return 0;
  const settings = await getSettings();
  const cache = { users: new Map(), branches: new Map() };

  for (const att of docs) {
    try {
      let user = cache.users.get(String(att.userId)) || (await User.findById(att.userId));
      cache.users.set(String(att.userId), user);
      const branch = att.branchId ? await Branch.findById(att.branchId) : null;
      const ctx = buildCtx(user || {}, branch, settings);
      await withUserLock(att.userId, async () => {
        const fresh = await Attendance.findById(att._id);
        if (!fresh) return;
        finalizeDoc(fresh, ctx, settings);
        await fresh.save();
      });
    } catch (err) {
      console.error("[Attendance] finalize failed:", err.message);
    }
  }
  return docs.length;
}


// ----------------------------------------------------
// CRM sign-in / sign-out (Wi-Fi staff)
//   Sign-in : clears an earlier logout; if the agent has just confirmed the office
//             Wi-Fi, the timer starts NOW instead of at the agent's next reading.
//   Sign-out: cross-checks the PC's live Wi-Fi state. Confirmed -> the session ends
//             at the logout moment. Not confirmed -> it ends at the last confirmed
//             office reading. Readings from the PC never restart it until the next
//             sign-in.
// ----------------------------------------------------
async function onCrmLogin(user) {
  if (user.attendanceMode !== "WIFI" || !user.branchId) return null;
  const branch = await Branch.findById(user.branchId);
  if (!branch || branch.active === false) return null;
  const settings = await getSettings();
  const today = dateKey();

  return withUserLock(user._id, async () => {
    const now = Date.now();
    const att = await Attendance.findOne({ userId: user._id, date: today });
    if (att) {
      const ctx = buildCtx(user, branch, settings);
      ctx.offDay = await offDayFor(settings, branch._id, today);
      const out = core.signIn(att, now);
      core.recompute(att, ctx);
      await att.save();
      await persistEvents(att, user, null, out.events);
    }
    const device = await Device.findOne({
      userId: user._id,
      status: "ACTIVE",
      lastSeenAt: { $gte: new Date(now - 2 * (branch.heartbeatInterval || 90) * 1000) },
    }).sort({ lastSeenAt: -1 });
    if (device && isAuthorizedNetwork(branch, device.lastSsid, device.lastBssid)) {
      return processSignal({
        user,
        branch,
        device,
        signal: { kind: "HEARTBEAT", connected: true, ssid: device.lastSsid, bssid: device.lastBssid, occurredAt: new Date(now).toISOString() },
        live: true,
        ip: "",
      });
    }
    return null;
  });
}

async function onCrmLogout(user, { network = "UNVERIFIED" } = {}) {
  if (user.attendanceMode !== "WIFI") return null;
  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);
  const today = dateKey();

  return withUserLock(user._id, async () => {
    const now = Date.now();
    ctx.offDay = await offDayFor(settings, branch?._id, today);
    let att = await Attendance.findOne({ userId: user._id, date: today });
    if (!att) {
      // logging out before the first check-in still stops an automatic check-in later today
      att = new Attendance({
        userId: user._id,
        userName: user.name,
        date: today,
        attendanceSource: "OFFICE_WIFI",
        branchId: branch?._id || null,
        status: "Absent",
      });
    }
    const fresh = att.wifi?.state === "CONNECTED" && now - new Date(att.wifi.lastHeartbeatAt || 0).getTime() <= 2 * ctx.hb * 1000;
    const verified = Boolean(fresh) && network !== "OUTSIDE";

    const out = core.signOut(att, ctx, now, verified);
    core.recompute(att, ctx);
    await att.save();
    await persistEvents(att, user, null, out.events);
    await dispatchNotes(att, user, branch || { name: "the office" }, ctx, out.notes);
    notify.pushAttendanceUpdate(user._id, { date: today, state: att.wifi.state });
    return { verified, closed: out.events.length > 0 };
  });
}

// ----------------------------------------------------
// "Are you still working?"  (answer from the Windows dialog or the web page)
// ----------------------------------------------------
async function answerOvertime(userId, answer, source = "WEB") {
  const a = String(answer || "").toUpperCase();
  if (!["YES", "NO"].includes(a)) throw Object.assign(new Error("Answer must be YES or NO"), { status: 400 });
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("Staff member not found"), { status: 404 });
  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);
  const today = dateKey();

  return withUserLock(user._id, async () => {
    ctx.offDay = await offDayFor(settings, branch?._id, today);
    const att = await Attendance.findOne({ userId: user._id, date: today });
    if (!att) return { ok: false, code: "NOT_ASKING" };
    const out = core.answerOvertime(att, ctx, a, Date.now());
    if (!out.ok) return { ok: false, code: out.code };
    core.recompute(att, ctx);
    await att.save();
    await persistEvents(att, user, att.deviceId, out.events.map((e) => ({ ...e, meta: { ...(e.meta || {}), source } })));
    await dispatchNotes(att, user, branch || { name: "the office" }, ctx, out.notes);
    notify.pushAttendanceUpdate(user._id, { date: today, state: att.wifi.state });
    return { ok: true, code: "OK", state: att.overtime.state };
  });
}

// ----------------------------------------------------
// "ARE YOU WORKING TODAY?"  (day off / Sunday)
// ----------------------------------------------------
async function answerOffDay(userId, answer, source = "WEB") {
  const a = String(answer || "").toUpperCase();
  if (!["YES", "NO"].includes(a)) throw Object.assign(new Error("Answer must be YES or NO"), { status: 400 });
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("Staff member not found"), { status: 404 });
  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);
  const today = dateKey();

  return withUserLock(user._id, async () => {
    ctx.offDay = await offDayFor(settings, branch?._id, today);
    const att = await Attendance.findOne({ userId: user._id, date: today });
    if (!att) return { ok: false, code: "NOT_ASKING" };
    const out = core.answerOffDay(att, ctx, a, Date.now());
    if (!out.ok) return { ok: false, code: out.code };
    core.recompute(att, ctx);
    await att.save();
    await persistEvents(att, user, att.deviceId, out.events.map((e) => ({ ...e, meta: { ...(e.meta || {}), source } })));
    await dispatchNotes(att, user, branch || { name: "the office" }, ctx, out.notes);
    notify.pushAttendanceUpdate(user._id, { date: today, state: att.wifi.state });
    return { ok: true, code: "OK", state: att.offDayAsk.state };
  });
}

// ----------------------------------------------------
// No reply at shift end -> the employee explains -> an administrator decides
// ----------------------------------------------------
async function explainReview(userId, date, text) {
  const explanation = String(text || "").trim();
  if (explanation.length < 10) throw Object.assign(new Error("Please explain in at least a sentence what happened"), { status: 400 });
  if (explanation.length > 1000) throw Object.assign(new Error("Please keep the explanation under 1000 characters"), { status: 400 });
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("Staff member not found"), { status: 404 });

  return withUserLock(user._id, async () => {
    const att = await Attendance.findOne({ userId: user._id, date });
    if (!att || att.review?.state !== "PENDING_EXPLANATION") {
      throw Object.assign(new Error("There is nothing to explain for this day"), { status: 409 });
    }
    att.review.state = "EXPLAINED";
    att.review.explanation = explanation;
    att.review.explainedAt = new Date();
    await att.save();
    await persistEvents(att, user, null, [{ type: "REVIEW_EXPLAINED", message: explanation.slice(0, 200), at: new Date() }]);
    await notify.notifyAdmins({
      category: "attendance",
      type: "REVIEW_EXPLAINED",
      severity: "warning",
      title: `${user.name} explained a missed shift-end reply`,
      message: `${att.date}: ${explanation.slice(0, 140)}${explanation.length > 140 ? "..." : ""}`,
      link: "AdminAttendance",
      data: { userId: String(user._id), date: att.date },
      dedupeKey: `review-explained:${user._id}:${att.date}`,
    });
    notify.pushAttendanceUpdate(user._id, { date: att.date, state: att.wifi.state });
    return att;
  });
}

async function decideReview({ userId, date, decision, note, by }) {
  const d = String(decision || "").toUpperCase();
  if (!["APPROVE", "REJECT"].includes(d)) throw Object.assign(new Error("decision must be APPROVE or REJECT"), { status: 400 });
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("Staff member not found"), { status: 404 });
  const branch = user.branchId ? await Branch.findById(user.branchId) : null;
  const settings = await getSettings();
  const ctx = buildCtx(user, branch, settings);

  return withUserLock(user._id, async () => {
    const att = await Attendance.findOne({ userId: user._id, date });
    if (!att || !["PENDING_EXPLANATION", "EXPLAINED"].includes(att.review?.state)) {
      throw Object.assign(new Error("This day is not waiting for a decision"), { status: 409 });
    }
    const before = { status: att.status, review: att.review.state };
    att.review.state = d === "APPROVE" ? "APPROVED" : "REJECTED";
    att.review.decidedBy = by || "Admin";
    att.review.decidedAt = new Date();
    att.review.note = String(note || "").trim().slice(0, 300);

    ctx.offDay = await offDayFor(settings, branch?._id, date);
    core.recompute(att, ctx);
    if (!core.openSession(att)) att.status = core.effectiveStatus(att, settings);
    att.edits.push({ by: by || "Admin", at: new Date(), note: `${d === "APPROVE" ? "Approved as Present" : "Kept as half day"}${att.review.note ? `: ${att.review.note}` : ""}`, before, after: { status: att.status } });
    await att.save();

    await persistEvents(att, user, null, [
      { type: "REVIEW_DECIDED", message: `${by || "Admin"}: ${d === "APPROVE" ? "approved (Present)" : "rejected (half day stays)"}${att.review.note ? ` - ${att.review.note}` : ""}`, at: new Date() },
    ]);
    await notify.notifyUser(user._id, {
      category: "attendance",
      type: "REVIEW_DECIDED",
      severity: d === "APPROVE" ? "success" : "warning",
      title: d === "APPROVE" ? `${att.date} was marked Present` : `${att.date} stays a half day`,
      message: att.review.note || (d === "APPROVE" ? "Your explanation was accepted." : "Your explanation was reviewed by an administrator."),
      link: "Attendance",
      dedupeKey: `review-decided:${user._id}:${att.date}:${d}`,
    });
    notify.pushAttendanceUpdate(user._id, { date: att.date, state: att.wifi.state });
    return att;
  });
}

module.exports = {
  withUserLock,
  buildCtx,
  liveState,
  ingestSignal,
  ingestBatch,
  runMonitorTick,
  applyManualTimes,
  closeOpenSessionFor,
  finalizePastDays,
  finalizeDoc,
  formatMinutes,
  offDayFor,
  onCrmLogin,
  onCrmLogout,
  answerOvertime,
  answerOffDay,
  explainReview,
  decideReview,
};
