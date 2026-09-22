// Run:  node src/tests/attendanceCore.test.js
const assert = require("assert");
const core = require("../Services/attendanceCore");
const { dateAtTime } = require("../Utils/time");

const DATE = "2026-09-21"; // Monday
const T = (hms) => dateAtTime(DATE, hms.slice(0, 5).padEnd(5, "0")).getTime() + (Number(hms.split(":")[2] || 0) * 1000);
const D = (hms) => new Date(T(hms));

const ctx = {
  hb: 90,
  grace: 300, // limit = 2*90 + 300 = 480s
  shiftStart: "09:30",
  shiftEnd: "18:30",
  settings: { autoCheckoutAfterShiftMinutes: 240, earliestCheckInBeforeShiftMinutes: 120, fullDayMinutes: 480, halfDayMinutes: 240 },
};

const newDay = () => ({
  date: DATE,
  sessions: [],
  finalized: false,
  wifi: { state: "ENDED", lastHeartbeatAt: null, lastPresentAt: null, warningReason: null, warningStartedAt: null, graceDeadline: null, pendingEndReason: null },
});

const OFFICE = { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70" };
const hb = (hms, o = {}) => ({ kind: "HEARTBEAT", t: D(hms), present: true, connected: true, live: true, ...OFFICE, ...o });
const away = (hms, o = {}) => hb(hms, { present: false, ssid: "Mobile Hotspot", bssid: "02:AA:BB:CC:DD:EE", ...o });
const dropped = (hms) => hb(hms, { present: false, connected: false, ssid: "", bssid: "" });
const types = (r) => r.events.map((e) => e.type);
const fmt = (d) => d && new Date(d).toISOString().slice(11, 19);

let n = 0;
const scenario = (name, fn) => { fn(); n += 1; console.log("  ✓", name); };

console.log("attendanceCore");

scenario("first present heartbeat checks in; later ones only extend the session", () => {
  const a = newDay();
  const r1 = core.applySignal(a, ctx, hb("09:47:00"));
  assert.deepStrictEqual(types(r1), ["CHECK_IN"]);
  assert.strictEqual(a.sessions.length, 1);
  const r2 = core.applySignal(a, ctx, hb("09:48:30"));
  assert.deepStrictEqual(types(r2), []);
  assert.strictEqual(a.sessions.length, 1);
  assert.strictEqual(fmt(a.sessions[0].lastPresentAt), fmt(D("09:48:30")));
  core.recompute(a, ctx);
  assert.strictEqual(a.lateMinutes, 17); // 09:47 vs 09:30 shift
  assert.strictEqual(a.status, "Present");
  assert.strictEqual(a.totalMinutes, 1);
});

scenario("duplicate / out-of-order heartbeat is ignored", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applySignal(a, ctx, hb("10:01:30"));
  const r = core.applySignal(a, ctx, hb("10:00:30"));
  assert.ok(r.ignored);
  assert.strictEqual(fmt(a.sessions[0].lastPresentAt), fmt(D("10:01:30"))); // unchanged
});

scenario("PDF case 4/5: switching to a hotspot warns; reconnecting inside grace keeps ONE session", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  const w = core.applySignal(a, ctx, away("10:01:30"));
  assert.deepStrictEqual(types(w), ["WIFI_CHANGED", "WARNING"]);
  assert.strictEqual(a.wifi.state, "WARNING");
  assert.strictEqual(fmt(a.wifi.graceDeadline), fmt(D("10:06:30")));
  assert.strictEqual(w.notes[0].type, "WARNING");
  const back = core.applySignal(a, ctx, hb("10:04:00"));
  assert.deepStrictEqual(types(back), ["WIFI_RECONNECTED"]);
  assert.strictEqual(a.wifi.state, "CONNECTED");
  assert.strictEqual(a.sessions.length, 1);
  assert.strictEqual(a.sessions[0].checkOut, null);
  assert.strictEqual(a.wifi.graceDeadline, null);
});

scenario("PDF case 3: off-network past grace closes at LAST PRESENCE (grace not paid)", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applySignal(a, ctx, hb("10:01:30"));
  core.applySignal(a, ctx, away("10:03:00"));
  const early = core.applyMonitorTick(a, ctx, D("10:07:00"));
  assert.deepStrictEqual(types(early), []); // still inside grace (deadline 10:08)
  const late = core.applyMonitorTick(a, ctx, D("10:08:10"));
  assert.deepStrictEqual(types(late), ["CHECK_OUT"]);
  assert.strictEqual(a.sessions[0].endReason, "WIFI_CHANGED");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("10:01:30")));
  core.recompute(a, ctx);
  assert.strictEqual(a.totalMinutes, 1); // 10:00 -> 10:01:30, not 10:08
  assert.strictEqual(a.status, "Completed");
  assert.ok(a.sessions[0].serverClosedAt);
});

scenario("Wi-Fi fully disconnected uses the WIFI_DISCONNECTED reason", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("11:00:00"));
  const w = core.applySignal(a, ctx, dropped("11:01:30"));
  assert.deepStrictEqual(types(w), ["DISCONNECTED", "WARNING"]);
  core.applyMonitorTick(a, ctx, D("11:08:00"));
  core.applyMonitorTick(a, ctx, D("11:07:00")); // earlier tick must not undo
  assert.strictEqual(a.sessions[0].endReason, "WIFI_DISCONNECTED");
});

scenario("silent device (sleep/crash): WARNING at lastHB+2hb, closes at lastHB+limit, ends at last presence", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("12:00:00"));
  core.applySignal(a, ctx, hb("12:01:30"));
  assert.deepStrictEqual(types(core.applyMonitorTick(a, ctx, D("12:03:00"))), []); // 90s silence
  const w = core.applyMonitorTick(a, ctx, D("12:04:40"));
  assert.deepStrictEqual(types(w), ["WARNING"]);
  assert.strictEqual(fmt(a.wifi.warningStartedAt), fmt(D("12:04:30"))); // exactly lastHB + 2hb
  assert.strictEqual(fmt(a.wifi.graceDeadline), fmt(D("12:09:30"))); // lastHB + limit
  assert.ok(w.notes[0].silent);
  const c = core.applyMonitorTick(a, ctx, D("12:09:40"));
  assert.deepStrictEqual(types(c), ["CHECK_OUT"]);
  assert.strictEqual(a.sessions[0].endReason, "DEVICE_OFFLINE");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("12:01:30")));
});

scenario("server was down for hours: one sweep warns AND closes, still ends at last presence", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  const r = core.applyMonitorTick(a, ctx, D("14:00:00"));
  assert.deepStrictEqual(types(r), ["WARNING", "CHECK_OUT"]);
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("10:00:00")));
});

scenario("MVP gap fixed: coming back after lunch opens a SECOND session the same day", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  core.applySignal(a, ctx, hb("13:00:00")); // silence>limit => expired at event time, then RETURN
  assert.strictEqual(a.sessions.length, 2);
  assert.strictEqual(a.sessions[0].endReason, "DEVICE_OFFLINE");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("09:30:00")));
  assert.strictEqual(a.wifi.state, "CONNECTED");
});

scenario("morning + after-lunch sessions add up; late is measured from FIRST check-in", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:20:00"));
  for (const t of ["09:21:30", "12:58:30"]) core.applySignal(a, ctx, hb(t)); // gap makes 2nd sample a new session
  const b = newDay();
  core.applySignal(b, ctx, hb("09:20:00"));
  core.applySignal(b, ctx, hb("09:21:30"));
  core.applyMonitorTick(b, ctx, D("09:31:00")); // silent: warns then closes
  core.applySignal(b, ctx, hb("13:00:00")); // returns
  core.applySignal(b, ctx, hb("13:01:30"));
  core.recompute(b, ctx);
  assert.strictEqual(b.sessions.length, 2);
  assert.strictEqual(b.lateMinutes, 0); // 09:20 is before 09:30
  assert.strictEqual(b.totalMinutes, 1 + 1); // 09:20->09:21:30 (1m) + 13:00->13:01:30 (1m)
  assert.strictEqual(fmt(b.checkIn), fmt(D("09:20:00")));
});

scenario("offline queue: server closed the session, replayed presence RESTORES it (no false gap)", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applySignal(a, ctx, hb("10:01:30"));
  // internet dead 10:03-10:20; server closes at 10:12 without knowing the person was there
  core.applyMonitorTick(a, ctx, D("10:04:00"));
  core.applyMonitorTick(a, ctx, D("10:12:00"));
  assert.ok(a.sessions[0].checkOut);
  // agent flushes its queue in timestamp order with live=false: one reading every 90s
  const q = [];
  for (let t = T("10:03:00"); t <= T("10:19:30"); t += 90 * 1000) q.push(new Date(t));
  const first = core.applySignal(a, ctx, { ...hb("10:03:00"), t: q[0], live: false });
  assert.deepStrictEqual(types(first), ["SESSION_RESTORED"]);
  for (const t of q.slice(1)) core.applySignal(a, ctx, { ...hb("10:03:00"), t, live: false });
  core.applySignal(a, ctx, hb("10:21:00")); // first live heartbeat after the replay
  assert.strictEqual(a.sessions.length, 1);
  assert.strictEqual(a.sessions[0].checkOut, null);
  core.recompute(a, ctx);
  assert.strictEqual(a.totalMinutes, 21); // 10:00 -> 10:21 continuous
});

scenario("offline queue proving the person was AWAY does not restore anything", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applyMonitorTick(a, ctx, D("10:04:00"));
  core.applyMonitorTick(a, ctx, D("10:09:00"));
  // queued readings show a hotspot, then a present reading AFTER the server closed
  core.applySignal(a, ctx, away("10:03:00", { live: false }));
  assert.strictEqual(a.sessions.length, 1);
  assert.ok(a.sessions[0].checkOut);
  const r = core.applySignal(a, ctx, hb("10:30:00", { live: false }));
  assert.deepStrictEqual(types(r), ["RETURN"]);
  assert.strictEqual(a.sessions.length, 2);
});

scenario("clean shutdown ends the session at shutdown time", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("17:00:00"));
  const r = core.applySignal(a, ctx, { kind: "SHUTDOWN", t: D("17:45:00"), present: true, connected: true, live: true, ...OFFICE });
  assert.deepStrictEqual(types(r), ["CHECK_OUT"]);
  assert.strictEqual(a.sessions[0].endReason, "SYSTEM_SHUTDOWN");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("17:45:00")));
  assert.strictEqual(a.wifi.state, "ENDED");
});

scenario("overnight laptop: presence at 02:00 cannot check in; 07:31 can; after cap cannot", () => {
  const a = newDay();
  assert.ok(core.applySignal(a, ctx, hb("02:00:00")).outsideWindow);
  assert.ok(core.applySignal(a, ctx, hb("07:29:00")).outsideWindow); // earliest = 09:30 - 120m = 07:30
  assert.strictEqual(a.sessions.length, 0);
  assert.deepStrictEqual(types(core.applySignal(a, ctx, hb("07:31:00"))), ["CHECK_IN"]);
});

scenario("forgotten laptop: nobody answers \"still working?\" -> session ends at shift END, day flagged half-day", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  let t = T("09:31:30");
  while (t < T("18:45:00")) { core.applySignal(a, ctx, { ...hb("09:31:30"), t: new Date(t) }); t += 90 * 1000; }
  assert.strictEqual(a.overtime.state, "ASKING"); // asked at the first healthy reading after 18:30
  const r = core.applyMonitorTick(a, ctx, D("18:45:10")); // 10-minute window over, PC still online
  assert.ok(types(r).includes("OVERTIME_NO_RESPONSE"));
  assert.strictEqual(a.sessions[0].endReason, "NO_RESPONSE");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("18:30:00"))); // no overtime credited
  assert.strictEqual(a.review.state, "PENDING_EXPLANATION");
  core.recompute(a, ctx);
  assert.strictEqual(a.overtimeMinutes, 0);
  assert.strictEqual(a.status, "Half Day"); // 9 h worked, but held as a half day until explained
  assert.strictEqual(core.effectiveStatus(a, ctx.settings), "Half Day");
  assert.strictEqual(core.effectiveStatus(a, { ...ctx.settings, noResponseAction: "FLAG_ONLY" }), "Completed");
});

scenario("safety net: readings replayed without the question still auto-close at shift end + 4h", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  let t = T("09:31:30");
  while (t < T("22:29:00")) { core.applySignal(a, ctx, { ...hb("09:31:30"), t: new Date(t), live: false }); t += 90 * 1000; }
  const r = core.applyMonitorTick(a, ctx, D("22:30:20"));
  assert.deepStrictEqual(types(r), ["AUTO_CHECK_OUT"]);
  assert.strictEqual(a.sessions[0].endReason, "AUTO_SHIFT_END");
  assert.ok(core.applySignal(a, ctx, hb("22:45:00")).outsideWindow);
  assert.strictEqual(a.sessions.length, 1);
});

scenario("overtime counts only minutes actually worked after shift end; early logout is derived from the last session", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  core.applySignal(a, ctx, hb("19:30:00")); // long gap => first session expires at event time, a NEW session starts
  core.applySignal(a, ctx, hb("19:31:30"));
  core.recompute(a, ctx);
  assert.strictEqual(a.overtimeMinutes, 1); // present 19:30-19:31:30 only; 18:30-19:30 was nobody at the desk
  assert.strictEqual(a.earlyLogoutMinutes, 0);

  const b = newDay();
  core.applySignal(b, ctx, hb("09:30:00"));
  core.applySignal(b, ctx, { kind: "SHUTDOWN", t: D("16:30:00"), present: true, connected: true, live: true, ...OFFICE });
  core.recompute(b, ctx);
  assert.strictEqual(b.earlyLogoutMinutes, 120);
});

scenario("workedMinutesLive counts to 'now' only while heartbeats are fresh", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applySignal(a, ctx, hb("10:01:30"));
  assert.strictEqual(core.workedMinutesLive(a, ctx, D("10:02:30")), 2); // fresh (<=180s)
  assert.strictEqual(core.workedMinutesLive(a, ctx, D("10:30:00")), 1); // stale => frozen at last presence
});

scenario("finalStatus thresholds", () => {
  assert.strictEqual(core.finalStatus(500, ctx.settings), "Completed");
  assert.strictEqual(core.finalStatus(300, ctx.settings), "Half Day");
  assert.strictEqual(core.finalStatus(120, ctx.settings), "Absent");
});


// =====================================================
// SHIFT-END QUESTION, OVERTIME, SUNDAY, CRM LOGOUT
// =====================================================
const keepAlive = (a, from, to, extra = {}) => { for (let t = T(from); t <= T(to); t += 90 * 1000) core.applySignal(a, ctx, { ...hb("09:31:30"), t: new Date(t), ...extra }); };

scenario("shift end: a healthy session is asked once; YES = overtime, tracked and re-asked hourly", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:29:30");
  assert.strictEqual(a.overtime.state, "NONE");
  const r = core.applySignal(a, ctx, hb("18:31:00"));
  assert.ok(types(r).includes("OVERTIME_ASKED"));
  assert.strictEqual(a.overtime.state, "ASKING");
  assert.strictEqual(fmt(a.overtime.deadline), fmt(D("18:41:00")));
  // asked only once per question
  assert.ok(!types(core.applySignal(a, ctx, hb("18:32:30"))).includes("OVERTIME_ASKED"));

  const ans = core.answerOvertime(a, ctx, "YES", T("18:33:00"));
  assert.ok(ans.ok);
  assert.strictEqual(a.overtime.state, "CONFIRMED");
  keepAlive(a, "18:34:00", "19:32:00");
  core.recompute(a, ctx);
  assert.ok(a.overtimeMinutes >= 60);
  // an hour after the answer it asks again, and the auto-close cap does not cut confirmed overtime
  const again = core.applySignal(a, ctx, hb("19:34:00"));
  assert.ok(types(again).includes("OVERTIME_ASKED"));
  assert.strictEqual(a.overtime.askId, 2);
});

scenario("answering NO ends the session at shift end; no automatic restart until they sign in again", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  const ans = core.answerOvertime(a, ctx, "NO", T("18:33:00"));
  assert.ok(ans.ok);
  assert.strictEqual(a.sessions[0].endReason, "OVERTIME_DECLINED");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("18:30:00")));
  const later = core.applySignal(a, ctx, hb("18:40:00")); // PC still on the office Wi-Fi
  assert.strictEqual(later.blocked, "AFTER_SHIFT_DECLINED");
  assert.strictEqual(a.sessions.length, 1);
  core.signIn(a, T("18:45:00")); // signs in to the CRM again = wants to work
  const back = core.applySignal(a, ctx, hb("18:46:00"));
  assert.ok(types(back).includes("RETURN"));
  assert.ok(types(back).includes("OVERTIME_ASKED")); // and is asked again straight away
});

scenario("answers after the window expire are rejected; a silent device is NOT penalised", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  const late = core.answerOvertime(a, ctx, "YES", T("18:50:00"));
  assert.ok(!late.ok);
  assert.strictEqual(late.code, "EXPIRED");

  // laptop lid closed right after the question: readings stop -> ordinary offline rules, no review
  const b = newDay();
  core.applySignal(b, ctx, hb("09:30:00"));
  keepAlive(b, "09:31:30", "18:31:00");
  core.applyMonitorTick(b, ctx, D("18:50:00")); // silence > 2 heartbeats: warning, not a no-response penalty
  core.applyMonitorTick(b, ctx, D("18:58:00"));
  assert.strictEqual(b.sessions[0].endReason, "DEVICE_OFFLINE");
  assert.strictEqual(b.review.state, "NONE");
  core.recompute(b, ctx);
  assert.strictEqual(b.status, "Completed");
});

scenario("Sunday / day off: all worked time goes to its own bucket, never late, never overtime, never absent", () => {
  const off = { ...ctx, offDay: { type: "WEEKLY_OFF" } };
  const a = newDay();
  core.applySignal(a, off, hb("14:00:00"));
  core.applySignal(a, off, hb("14:01:30"));
  core.applySignal(a, off, { kind: "SHUTDOWN", t: D("16:00:00"), present: true, connected: true, live: true, ...OFFICE });
  core.recompute(a, off);
  assert.strictEqual(a.dayType, "WEEKLY_OFF");
  assert.strictEqual(a.offDayMinutes, 120);
  assert.strictEqual(a.lateMinutes, 0);
  assert.strictEqual(a.overtimeMinutes, 0);
  assert.strictEqual(core.effectiveStatus(a, ctx.settings), "Completed"); // 2 h on a Sunday is not "Absent"

  // no reply on a day off is not penalised
  const b = newDay();
  core.applySignal(b, off, hb("09:30:00"));
  for (let t = T("09:31:30"); t < T("18:45:00"); t += 90000) core.applySignal(b, off, { ...hb("09:31:30"), t: new Date(t) });
  core.applyMonitorTick(b, off, D("18:45:10"));
  assert.strictEqual(b.overtime.state, "NO_RESPONSE");
  assert.strictEqual(b.review.state, "NONE");
});

scenario("CRM logout, verified: timer stops AT logout; the PC still on Wi-Fi does not restart it; signing in resumes", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applySignal(a, ctx, hb("10:01:30"));
  const out = core.signOut(a, ctx, T("10:02:10"), true);
  assert.strictEqual(a.sessions[0].endReason, "CRM_LOGOUT");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("10:02:10")));
  assert.strictEqual(a.wifi.state, "ENDED");
  assert.ok(out.events.length === 1 && out.events[0].type === "CRM_LOGOUT");
  const r = core.applySignal(a, ctx, hb("10:03:00")); // agent keeps reporting the office Wi-Fi
  assert.strictEqual(r.blocked, "SIGNED_OUT");
  assert.strictEqual(a.sessions.length, 1);
  assert.strictEqual(core.isSignedOut(a), true);
  core.signIn(a, T("10:30:00"));
  assert.strictEqual(core.isSignedOut(a), false);
  assert.ok(types(core.applySignal(a, ctx, hb("10:30:30"))).includes("RETURN"));
  assert.strictEqual(a.sessions.length, 2);
});

scenario("CRM logout, NOT verified (Wi-Fi not confirmed): time stops at the LAST CONFIRMED office reading", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("10:00:00"));
  core.applySignal(a, ctx, hb("10:01:30"));
  core.applySignal(a, ctx, away("10:03:00")); // moved to a hotspot: warning
  assert.strictEqual(a.wifi.state, "WARNING");
  core.signOut(a, ctx, T("10:05:00"), false);
  assert.strictEqual(a.sessions[0].endReason, "CRM_LOGOUT_UNVERIFIED");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("10:01:30"))); // not 10:05, not 10:03
  core.recompute(a, ctx);
  assert.strictEqual(a.totalMinutes, 1);
});

scenario("logging out before any check-in still blocks a later automatic check-in", () => {
  const a = newDay();
  core.signOut(a, ctx, T("09:00:00"), true);
  assert.strictEqual(core.applySignal(a, ctx, hb("09:35:00")).blocked, "SIGNED_OUT");
  assert.strictEqual(a.sessions.length, 0);
});

console.log(`\n${n} scenarios passed`);
