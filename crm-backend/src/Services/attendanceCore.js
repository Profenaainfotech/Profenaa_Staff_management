// =====================================================
// ATTENDANCE CORE  (pure logic - no database, no network)
// =====================================================
// The agent on an employee's PC is only a *sensor*: it reports "I am on
// SSID/BSSID X" (or "I am not connected"). Everything about what that means -
// check-in, warning, grace period, check-out - is decided here, so the rules
// live in exactly one place and can be tested without a database.
//
// Key rules
//  * A session ends at the LAST CONFIRMED office presence, never at the moment
//    a timeout fired. Silent minutes and the grace period are not paid time.
//  * A short drop (inside the grace period) is forgiven: the session simply
//    continues.
//  * A day can hold several sessions (morning, back after lunch, evening).
//  * Events replayed from the agent's offline queue are evaluated at their REAL
//    time, not at the time they arrived.
//  * Presence long before shift start or after shift end (+ auto-close window)
//    cannot open a session, so a laptop left on overnight is not attendance.
//
// `att` is a Mongoose document OR a plain object with the same shape
// ({ date, sessions[], wifi{} }); the functions below only use property
// access, so both work.
// =====================================================

const {
  dateAtTime,
  startOfDay,
  minutesOfDay,
  timeToMinutes,
} = require("../Utils/time");

// Reasons the SERVER decided a session was over (as opposed to an explicit
// user/agent action). Only these may be undone when late offline events prove
// the person was actually there.
const SYSTEM_TIMEOUT_REASONS = ["DEVICE_OFFLINE", "WIFI_DISCONNECTED", "WIFI_CHANGED"];

const END_REASON_LABELS = {
  WIFI_DISCONNECTED: "Wi-Fi disconnected",
  WIFI_CHANGED: "Moved off the office network",
  DEVICE_OFFLINE: "Device went offline",
  SYSTEM_SHUTDOWN: "Computer shut down",
  AUTO_SHIFT_END: "Automatically closed after shift end",
  DAY_ROLLOVER: "End of day",
  MANUAL: "Manual entry",
  CRM_LOGOUT: "Logged out of CRM",
  CRM_LOGOUT_UNVERIFIED: "Logged out (office Wi-Fi not confirmed)",
  OVERTIME_DECLINED: "Finished at shift end",
  NO_RESPONSE: "No reply to the shift-end question",
};

const ms = (d) => (d ? new Date(d).getTime() : 0);

// ----------------------------------------------------
// Context helpers
// ----------------------------------------------------
// ctx = { hb (sec), grace (sec), shiftStart "HH:MM", shiftEnd "HH:MM", settings }
const limitMs = (ctx) => (2 * ctx.hb + ctx.grace) * 1000;
const twoHbMs = (ctx) => 2 * ctx.hb * 1000;

function isDayShift(ctx) {
  return timeToMinutes(ctx.shiftEnd, 1110) > timeToMinutes(ctx.shiftStart, 570);
}

/** Latest instant a session may run: shift end + auto-close window (ms) or null */
function capAt(date, ctx) {
  const after = Number(ctx.settings?.autoCheckoutAfterShiftMinutes) || 0;
  if (!after || !isDayShift(ctx)) return null;
  return ms(dateAtTime(date, ctx.shiftEnd)) + after * 60 * 1000;
}

/** Earliest instant presence may open a session (ms) */
function earliestAt(date, ctx) {
  if (!isDayShift(ctx)) return 0;
  const before = Number(ctx.settings?.earliestCheckInBeforeShiftMinutes ?? 120);
  const start = ms(dateAtTime(date, ctx.shiftStart));
  return Math.max(ms(startOfDay(date)), start - before * 60 * 1000);
}

const openSession = (att) => {
  const list = att.sessions || [];
  const last = list[list.length - 1];
  return last && !last.checkOut ? last : null;
};

// ----------------------------------------------------
// CRM sign-in state, shift-end question, review (all optional on old records)
// ----------------------------------------------------
function ensureExtras(att) {
  if (!att.overtime) att.overtime = { state: "NONE", askId: 0 };
  if (!att.crm) att.crm = {};
  if (!att.review) att.review = { state: "NONE" };
  return att;
}

/** Logged out of the CRM and not signed in again since: readings must not restart the timer. */
function isSignedOut(att) {
  const c = att.crm;
  return Boolean(c && c.logoutAt && (!c.loginAt || ms(c.logoutAt) >= ms(c.loginAt)));
}

function shiftEndAt(att, ctx) {
  return ms(dateAtTime(att.date, ctx.shiftEnd));
}

/** The shift-end auto-close does not apply while overtime is being asked about / confirmed */
function capFor(att, ctx) {
  const st = att.overtime?.state;
  if (st === "CONFIRMED" || st === "ASKING") return null;
  return capAt(att.date, ctx);
}

const DONE_STATES = ["DECLINED", "NO_RESPONSE"];
function resetOvertime(att) {
  ensureExtras(att);
  att.overtime.state = "NONE";
  att.overtime.deadline = null;
  att.overtime.nextAskAt = null;
}

// ----------------------------------------------------
// State transitions
// ----------------------------------------------------
function clearWarning(att) {
  att.wifi.warningReason = null;
  att.wifi.warningStartedAt = null;
  att.wifi.graceDeadline = null;
  att.wifi.pendingEndReason = null;
}

function closeOpenSession(att, endAt, reason, serverClosedAt = null) {
  const s = openSession(att);
  if (!s) return null;
  const end = Math.max(ms(endAt), ms(s.checkIn));
  s.checkOut = new Date(end);
  s.endReason = reason;
  s.serverClosedAt = serverClosedAt ? new Date(serverClosedAt) : null;
  att.wifi.state = "ENDED";
  clearWarning(att);
  if (!DONE_STATES.includes(reason) && reason !== "OVERTIME_DECLINED") resetOvertime(att);
  return s;
}

function openNewSession(att, t, sig) {
  att.sessions.push({
    checkIn: new Date(t),
    checkOut: null,
    lastPresentAt: new Date(t),
    endReason: null,
    serverClosedAt: null,
    ssid: sig.ssid || "",
    bssid: sig.bssid || "",
    deviceId: sig.deviceId || null,
    source: "OFFICE_WIFI",
  });
  att.wifi.state = "CONNECTED";
  att.wifi.ssid = sig.ssid || "";
  att.wifi.bssid = sig.bssid || "";
  att.wifi.lastPresentAt = new Date(t);
  clearWarning(att);
}

function startWarning(att, ctx, at, reason, deadline) {
  att.wifi.state = "WARNING";
  att.wifi.warningReason = reason;
  att.wifi.warningStartedAt = new Date(at);
  att.wifi.graceDeadline = new Date(deadline ?? ms(at) + ctx.grace * 1000);
  att.wifi.pendingEndReason = reason;
}

const ev = (type, sig, message = "", meta = {}) => ({
  type,
  ssid: sig?.ssid || "",
  bssid: sig?.bssid || "",
  message,
  meta,
  at: sig?.t ? new Date(sig.t) : new Date(),
});

// ----------------------------------------------------
// applySignal  -  one reading from the agent
// sig = { kind: 'HEARTBEAT'|'SHUTDOWN', t: Date, present: bool, connected: bool,
//         ssid, bssid, deviceId, live: bool }
//   present   = connected AND on an authorised network of the employee's branch
//   live      = true for real-time delivery, false for replayed offline queue
// ----------------------------------------------------
function applySignal(att, ctx, sig) {
  const out = { events: [], notes: [], ignored: false, outsideWindow: false };
  const t = ms(sig.t);
  const wifi = att.wifi;
  const prevHb = ms(wifi.lastHeartbeatAt);

  // duplicates / out-of-order readings carry no new information
  if (sig.kind === "HEARTBEAT" && prevHb && t <= prevHb) {
    out.ignored = true;
    return out;
  }

  const s = openSession(att);

  // ---------------- clean shutdown ----------------
  if (sig.kind === "SHUTDOWN") {
    if (s) {
      const end = sig.present ? Math.max(t, ms(s.lastPresentAt)) : ms(s.lastPresentAt) || ms(s.checkIn);
      closeOpenSession(att, end, "SYSTEM_SHUTDOWN", null);
      out.events.push(ev("CHECK_OUT", sig, "Computer shut down", { reason: "SYSTEM_SHUTDOWN" }));
      out.notes.push({ type: "SESSION_ENDED", reason: "SYSTEM_SHUTDOWN" });
    }
    wifi.lastHeartbeatAt = new Date(Math.max(t, prevHb));
    return out;
  }

  // ---------------- heartbeat while a session is open ----------------
  if (s) {
    const cap = capFor(att, ctx);
    if (cap && t > cap) {
      const end = Math.min(ms(s.lastPresentAt) || ms(s.checkIn), cap);
      closeOpenSession(att, end, "AUTO_SHIFT_END", null);
      out.events.push(ev("AUTO_CHECK_OUT", sig, "Closed automatically after shift end", { reason: "AUTO_SHIFT_END" }));
      out.notes.push({ type: "SESSION_ENDED", reason: "AUTO_SHIFT_END" });
      wifi.lastHeartbeatAt = new Date(t);
      return out;
    }

    const silence = prevHb ? t - prevHb : 0;
    let expired = false;
    let expiryReason = "DEVICE_OFFLINE";

    if (wifi.state === "WARNING") {
      expired = Boolean(wifi.graceDeadline) && t > ms(wifi.graceDeadline);
      expiryReason = wifi.pendingEndReason || "DEVICE_OFFLINE";
    } else if (wifi.state === "CONNECTED") {
      expired = silence > limitMs(ctx);
    }

    if (expired) {
      // the session should already have been closed - do it now, at event time
      closeOpenSession(att, ms(s.lastPresentAt) || ms(s.checkIn), expiryReason, null);
      out.events.push(ev("CHECK_OUT", { ...sig, t: s.lastPresentAt }, "Session expired", { reason: expiryReason }));
      out.notes.push({ type: "SESSION_ENDED", reason: expiryReason });
      // fall through: a present reading may start a fresh session below
    } else if (sig.present) {
      s.lastPresentAt = new Date(t);
      s.ssid = sig.ssid || s.ssid;
      s.bssid = sig.bssid || s.bssid;
      wifi.lastPresentAt = new Date(t);
      wifi.lastHeartbeatAt = new Date(t);
      wifi.ssid = sig.ssid || "";
      wifi.bssid = sig.bssid || "";
      if (wifi.state === "WARNING") {
        wifi.state = "CONNECTED";
        clearWarning(att);
        out.events.push(ev("WIFI_RECONNECTED", sig, "Back on the office network"));
        out.notes.push({ type: "RECONNECTED" });
      }
      if (sig.live) maybeAskOvertime(att, ctx, t, out);
      return out;
    } else {
      // not on an authorised network
      wifi.lastHeartbeatAt = new Date(t);
      wifi.ssid = sig.ssid || "";
      wifi.bssid = sig.bssid || "";
      if (wifi.state === "CONNECTED") {
        const reason = sig.connected ? "WIFI_CHANGED" : "WIFI_DISCONNECTED";
        startWarning(att, ctx, t, reason);
        out.events.push(
          ev(sig.connected ? "WIFI_CHANGED" : "DISCONNECTED", sig, sig.connected ? `Moved to "${sig.ssid}"` : "Wi-Fi disconnected")
        );
        out.events.push(ev("WARNING", sig, "Grace period started", { reason }));
        out.notes.push({ type: "WARNING", reason, graceDeadline: wifi.graceDeadline });
      }
      return out;
    }
  }

  // ---------------- no open session ----------------
  wifi.lastHeartbeatAt = new Date(Math.max(t, prevHb));
  if (!sig.present) return out;

  // Logged out of the CRM: the PC may still be on the office Wi-Fi, but the timer stays stopped
  if (isSignedOut(att)) {
    out.blocked = "SIGNED_OUT";
    return out;
  }

  const earliest = earliestAt(att.date, ctx);
  const cap = capFor(att, ctx);
  if (t < earliest || (cap && t > cap)) {
    out.outsideWindow = true;
    return out;
  }

  // Said "No" (or did not answer) at shift end: no automatic restart afterwards.
  // Signing in to the CRM again clears this.
  if (isDayShift(ctx) && t >= shiftEndAt(att, ctx) && DONE_STATES.includes(att.overtime?.state)) {
    out.blocked = "AFTER_SHIFT_DECLINED";
    return out;
  }

  const list = att.sessions;
  const last = list[list.length - 1];

  // Late offline events prove the server was wrong to close the session.
  if (
    !sig.live &&
    last &&
    last.checkOut &&
    last.serverClosedAt &&
    SYSTEM_TIMEOUT_REASONS.includes(last.endReason) &&
    t <= ms(last.serverClosedAt) &&
    t - ms(last.lastPresentAt) <= limitMs(ctx)
  ) {
    last.checkOut = null;
    last.endReason = null;
    last.serverClosedAt = null;
    last.lastPresentAt = new Date(t);
    wifi.state = "CONNECTED";
    wifi.lastPresentAt = new Date(t);
    wifi.ssid = sig.ssid || "";
    wifi.bssid = sig.bssid || "";
    clearWarning(att);
    out.events.push(ev("SESSION_RESTORED", sig, "Session restored from offline queue"));
    return out;
  }

  const first = list.length === 0;
  openNewSession(att, t, sig);
  out.events.push(
    ev(first ? "CHECK_IN" : "RETURN", sig, first ? "Checked in on office Wi-Fi" : "Back on office Wi-Fi")
  );
  out.notes.push({ type: first ? "FIRST_CHECK_IN" : "RETURNED" });
  if (sig.live) maybeAskOvertime(att, ctx, t, out);
  return out;
}

// ----------------------------------------------------
// applyMonitorTick  -  the server noticing silence (no signal at all)
// ----------------------------------------------------
function applyMonitorTick(att, ctx, now) {
  const out = { events: [], notes: [] };
  const n = ms(now);
  const s = openSession(att);

  if (!s) {
    if (att.wifi.state !== "ENDED") {
      att.wifi.state = "ENDED";
      clearWarning(att);
      out.repaired = true;
    }
    return out;
  }

  const cap = capFor(att, ctx);
  if (cap && n > cap) {
    const end = Math.min(ms(s.lastPresentAt) || ms(s.checkIn), cap);
    closeOpenSession(att, end, "AUTO_SHIFT_END", n);
    out.events.push(ev("AUTO_CHECK_OUT", { t: n }, "Closed automatically after shift end", { reason: "AUTO_SHIFT_END" }));
    out.notes.push({ type: "SESSION_ENDED", reason: "AUTO_SHIFT_END" });
    return out;
  }

  const lastHb = ms(att.wifi.lastHeartbeatAt) || ms(s.lastPresentAt) || ms(s.checkIn);

  if (att.wifi.state === "CONNECTED" && n - lastHb > twoHbMs(ctx)) {
    const warnAt = lastHb + twoHbMs(ctx);
    startWarning(att, ctx, warnAt, "DEVICE_OFFLINE", lastHb + limitMs(ctx));
    out.events.push(ev("WARNING", { t: warnAt }, "No signal from the device", { reason: "DEVICE_OFFLINE" }));
    out.notes.push({ type: "WARNING", reason: "DEVICE_OFFLINE", silent: true, graceDeadline: att.wifi.graceDeadline });
  }

  if (att.wifi.state === "WARNING" && att.wifi.graceDeadline && n > ms(att.wifi.graceDeadline)) {
    const reason = att.wifi.pendingEndReason || "DEVICE_OFFLINE";
    closeOpenSession(att, ms(s.lastPresentAt) || ms(s.checkIn), reason, n);
    out.events.push(ev("CHECK_OUT", { t: n }, "Grace period ended", { reason }));
    out.notes.push({ type: "SESSION_ENDED", reason });
  }

  resolveOvertimeDeadline(att, ctx, n, out);
  if (openSession(att)) maybeAskOvertime(att, ctx, n, out);
  return out;
}

// ----------------------------------------------------
// SHIFT-END QUESTION  "Are you still working?"
//
//  * Asked once the shift is over and a healthy session is still open.
//  * YES  -> overtime, tracked separately, asked again every recheck interval.
//  * NO   -> the session ends at shift end (no overtime credited).
//  * No reply within the window AND the PC is still online -> the session ends at
//    shift end and the day is flagged (half day until the employee explains and an
//    administrator approves). If the PC went offline instead, the ordinary
//    offline rules end the session and nobody is penalised.
// ----------------------------------------------------
function askOvertime(att, ctx, nowMs, coveredUntil, out) {
  const o = att.overtime;
  const windowMs = (Number(ctx.settings?.overtimePromptMinutes) || 10) * 60000;
  o.state = "ASKING";
  o.askId = (Number(o.askId) || 0) + 1;
  o.askedAt = new Date(nowMs);
  o.deadline = new Date(nowMs + windowMs);
  o.coveredUntil = new Date(coveredUntil);
  o.nextAskAt = null;
  out.events.push(ev("OVERTIME_ASKED", { t: nowMs }, "Asked whether the employee is still working", { askId: o.askId }));
  out.notes.push({ type: "OVERTIME_ASK", askId: o.askId, deadline: o.deadline });
}

function maybeAskOvertime(att, ctx, nowMs, out) {
  const s = openSession(att);
  if (!s || att.wifi.state !== "CONNECTED" || !isDayShift(ctx)) return;
  ensureExtras(att);
  const o = att.overtime;
  const endMs = shiftEndAt(att, ctx);
  if (o.state === "NONE" && nowMs >= endMs) {
    askOvertime(att, ctx, nowMs, Math.max(endMs, ms(s.checkIn)), out);
  } else if (o.state === "CONFIRMED" && o.nextAskAt && nowMs >= ms(o.nextAskAt)) {
    askOvertime(att, ctx, nowMs, ms(o.nextAskAt), out);
  }
}

function resolveOvertimeDeadline(att, ctx, nowMs, out) {
  const o = att.overtime;
  if (!o || o.state !== "ASKING" || nowMs <= ms(o.deadline)) return;
  const s = openSession(att);
  if (!s) {
    o.state = "NONE";
    return;
  }
  const alive = att.wifi.state === "CONNECTED" && nowMs - ms(att.wifi.lastHeartbeatAt) <= twoHbMs(ctx);
  if (!alive) return; // silent device: the normal offline handling ends the session, no penalty

  const end = Math.min(ms(o.coveredUntil), ms(s.lastPresentAt) || ms(s.checkIn));
  closeOpenSession(att, end, "NO_RESPONSE", nowMs);
  o.state = "NO_RESPONSE";
  o.deadline = null;

  const penalise = !ctx.offDay; // work on a day off is never penalised
  ensureExtras(att);
  att.review = {
    state: penalise ? "PENDING_EXPLANATION" : "NONE",
    reason: penalise ? "NO_RESPONSE" : "",
    requestedAt: penalise ? new Date(nowMs) : null,
    explanation: "",
    explainedAt: null,
    decidedBy: "",
    decidedAt: null,
    note: "",
  };
  out.events.push(ev("OVERTIME_NO_RESPONSE", { t: nowMs }, "No reply to \"Are you still working?\" - session ended at shift end"));
  out.notes.push({ type: "SESSION_ENDED", reason: "NO_RESPONSE" });
  if (penalise) out.notes.push({ type: "NO_RESPONSE" });
}

/** The employee's answer ("YES" | "NO"), from the Windows dialog or the web page. */
function answerOvertime(att, ctx, answer, nowMs) {
  const out = { events: [], notes: [], ok: false, code: "" };
  ensureExtras(att);
  const o = att.overtime;
  if (o.state !== "ASKING") {
    out.code = o.state === "NO_RESPONSE" ? "EXPIRED" : "NOT_ASKING";
    return out;
  }
  if (nowMs > ms(o.deadline)) {
    out.code = "EXPIRED";
    return out;
  }
  const recheck = (Number(ctx.settings?.overtimeRecheckMinutes) || 60) * 60000;
  if (answer === "YES") {
    o.state = "CONFIRMED";
    o.answeredAt = new Date(nowMs);
    o.deadline = null;
    o.nextAskAt = new Date(nowMs + recheck);
    out.events.push(ev("OVERTIME_CONFIRMED", { t: nowMs }, "Confirmed still working (overtime)"));
    out.notes.push({ type: "OVERTIME_CONFIRMED" });
  } else {
    const s = openSession(att);
    if (s) {
      const end = Math.min(ms(o.coveredUntil), ms(s.lastPresentAt) || ms(s.checkIn));
      closeOpenSession(att, end, "OVERTIME_DECLINED", nowMs);
      out.notes.push({ type: "SESSION_ENDED", reason: "OVERTIME_DECLINED" });
    }
    o.state = "DECLINED";
    o.answeredAt = new Date(nowMs);
    o.deadline = null;
    out.events.push(ev("OVERTIME_DECLINED", { t: nowMs }, "Finished for the day at shift end"));
  }
  out.ok = true;
  out.code = "OK";
  return out;
}

// ----------------------------------------------------
// CRM LOGOUT / LOGIN  (Wi-Fi staff)
//   verified   = the PC was confirmed on the office Wi-Fi right now -> the session
//                ends at the logout moment.
//   unverified = it was not -> the timer stops at the LAST CONFIRMED office time.
// ----------------------------------------------------
function signOut(att, ctx, nowMs, verified) {
  const out = { events: [], notes: [] };
  ensureExtras(att);
  att.crm.logoutAt = new Date(nowMs);
  att.crm.logoutVerified = Boolean(verified);
  const s = openSession(att);
  if (s) {
    const end = verified ? nowMs : ms(s.lastPresentAt) || ms(s.checkIn);
    closeOpenSession(att, end, verified ? "CRM_LOGOUT" : "CRM_LOGOUT_UNVERIFIED", nowMs);
    out.events.push(
      ev(
        "CRM_LOGOUT",
        { t: nowMs, ssid: att.wifi?.ssid, bssid: att.wifi?.bssid },
        verified ? "Logged out of the CRM (office Wi-Fi confirmed)" : "Logged out of the CRM (office Wi-Fi not confirmed: time stopped at the last confirmed moment)",
        { verified: Boolean(verified) }
      )
    );
    out.notes.push({ type: "SESSION_ENDED", reason: verified ? "CRM_LOGOUT" : "CRM_LOGOUT_UNVERIFIED" });
  }
  return out;
}

function signIn(att, nowMs) {
  ensureExtras(att);
  att.crm.loginAt = new Date(nowMs);
  // signing in again is a fresh intention to work: forget an earlier "No" / no reply
  if (DONE_STATES.includes(att.overtime.state)) resetOvertime(att);
  return {
    events: [{ type: "CRM_LOGIN", ssid: "", bssid: "", message: "Signed in to the CRM", meta: {}, at: new Date(nowMs) }],
    notes: [],
  };
}

// ----------------------------------------------------
// Derived numbers
// ----------------------------------------------------
const minutesBetween = (a, b) => Math.max(0, Math.floor((ms(b) - ms(a)) / 60000));

/** Sum of session minutes. An open session counts up to its last confirmed presence. */
function totalMinutesOf(att) {
  return (att.sessions || []).reduce((sum, s) => {
    const end = s.checkOut || s.lastPresentAt || s.checkIn;
    return sum + minutesBetween(s.checkIn, end);
  }, 0);
}

/** Live worked minutes for display: an open, healthy session counts up to "now". */
function workedMinutesLive(att, ctx, now = new Date()) {
  return (att.sessions || []).reduce((sum, s) => {
    let end = s.checkOut || s.lastPresentAt || s.checkIn;
    if (!s.checkOut && att.wifi?.state === "CONNECTED") {
      const fresh = ms(now) - ms(att.wifi.lastHeartbeatAt) <= twoHbMs(ctx);
      if (fresh) end = now;
    }
    return sum + minutesBetween(s.checkIn, end);
  }, 0);
}

function finalStatus(totalMinutes, settings = {}) {
  const full = Number(settings.fullDayMinutes) || 480;
  const half = Number(settings.halfDayMinutes) || 240;
  if (totalMinutes >= full) return "Completed";
  if (totalMinutes >= half) return "Half Day";
  return "Absent";
}

/** No reply at shift end and not yet cleared by an administrator: the day counts as a half day. */
function holdsHalfDay(att, settings = {}) {
  if (att.dayType && att.dayType !== "WORKING") return false;
  if (settings.noResponseAction === "FLAG_ONLY") return false;
  return ["PENDING_EXPLANATION", "EXPLAINED", "REJECTED"].includes(att.review?.state);
}

/** The status a closed day ends up with (minutes, day off, and any pending review) */
function effectiveStatus(att, settings = {}) {
  // work on a day off is extra work, never an absence
  if (att.dayType && att.dayType !== "WORKING") return "Completed";
  const base = finalStatus(att.totalMinutes || 0, settings);
  if (base === "Completed" && holdsHalfDay(att, settings)) return "Half Day";
  return base;
}

/** Minutes worked after the shift end (only possible once the person confirmed they are still working) */
function overtimeMinutesOf(att, ctx) {
  const endInstant = shiftEndAt(att, ctx);
  return (att.sessions || []).reduce((sum, s) => {
    const end = ms(s.checkOut || s.lastPresentAt || s.checkIn);
    const start = Math.max(ms(s.checkIn), endInstant);
    return sum + (end > start ? Math.floor((end - start) / 60000) : 0);
  }, 0);
}

/** Refresh every derived field on the daily record from its sessions. */
function recompute(att, ctx) {
  const list = att.sessions || [];
  if (!list.length) return att;

  const first = list[0];
  const last = list[list.length - 1];
  const open = !last.checkOut;

  att.checkIn = first.checkIn;
  att.checkOut = open ? null : last.checkOut;

  const total = totalMinutesOf(att);
  att.totalMinutes = total;
  att.totalHours = `${Math.floor(total / 60)}h ${total % 60}m`;

  if (!att.finalized) att.status = open ? "Present" : holdsHalfDay(att, ctx.settings) ? "Half Day" : "Completed";

  const shiftStart = timeToMinutes(ctx.shiftStart, 570);
  const shiftEnd = timeToMinutes(ctx.shiftEnd, 1110);
  const off = ctx.offDay || null;
  att.dayType = off ? off.type : "WORKING";

  if (off) {
    // Work on a day off (Sunday / holiday) is extra work: kept in its own bucket,
    // never counted as late, early or overtime.
    att.offDayMinutes = total;
    att.overtimeMinutes = 0;
    att.lateMinutes = 0;
    att.earlyLogoutMinutes = 0;
    return att;
  }

  att.offDayMinutes = 0;
  att.lateMinutes = Math.max(0, minutesOfDay(att.checkIn) - shiftStart);

  if (isDayShift(ctx)) {
    att.overtimeMinutes = overtimeMinutesOf(att, ctx);
    const endRef = open ? last.lastPresentAt || last.checkIn : last.checkOut;
    att.earlyLogoutMinutes = open ? 0 : Math.max(0, shiftEnd - minutesOfDay(endRef));
  }
  return att;
}

module.exports = {
  SYSTEM_TIMEOUT_REASONS,
  END_REASON_LABELS,
  limitMs,
  capAt,
  earliestAt,
  openSession,
  closeOpenSession,
  applySignal,
  applyMonitorTick,
  totalMinutesOf,
  workedMinutesLive,
  finalStatus,
  effectiveStatus,
  holdsHalfDay,
  recompute,
  minutesBetween,
  ensureExtras,
  isSignedOut,
  shiftEndAt,
  answerOvertime,
  signOut,
  signIn,
};
