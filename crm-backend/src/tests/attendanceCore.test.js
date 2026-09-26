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

const keepAlive = (a, from, to, extra = {}) => { for (let t = T(from); t <= T(to); t += 90 * 1000) core.applySignal(a, ctx, { ...hb("09:31:30"), t: new Date(t), ...extra }); };
const keepAliveMs = (a, fromMs, toMs, extra = {}) => { for (let t = fromMs; t <= toMs; t += 90 * 1000) core.applySignal(a, ctx, { ...hb("09:31:30"), t: new Date(t), ...extra }); };

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

scenario("forgotten laptop, default settings: no reply repeats up to overtimeMaxAsks, THEN closes at shift end, day flagged half-day", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  assert.strictEqual(a.overtime.state, "ASKING"); // ask #1, asked at the first healthy reading after 18:30
  assert.strictEqual(a.overtime.askId, 1);
  assert.strictEqual(a.overtime.unansweredCount, 1);
  const deadline1 = new Date(a.overtime.deadline).getTime();
  assert.strictEqual(deadline1 - new Date(a.overtime.askedAt).getTime(), 10 * 60000); // +10 min (overtimePromptMinutes default)

  // window #1 over, still no reply, PC still online -> asked AGAIN instead of closing (default overtimeMaxAsks: 3)
  keepAliveMs(a, T("18:32:30"), deadline1 + 9 * 60000);
  const r2 = core.applyMonitorTick(a, ctx, new Date(deadline1 + 10 * 60000));
  assert.ok(types(r2).includes("OVERTIME_ASKED_AGAIN"));
  assert.strictEqual(a.overtime.state, "ASKING"); // not closed yet
  assert.strictEqual(a.overtime.askId, 2);
  assert.strictEqual(a.overtime.unansweredCount, 2);
  const deadline2 = new Date(a.overtime.deadline).getTime();
  assert.strictEqual(deadline2 - new Date(a.overtime.askedAt).getTime(), 5 * 60000); // +5 min (overtimeRepeatMinutes default)
  assert.strictEqual(a.sessions[0].checkOut, null); // still open - not penalised mid-cycle

  // window #2 over, still no reply -> asked a 3rd time
  keepAliveMs(a, deadline2 - 8 * 60000, deadline2 + 4 * 60000);
  const r3 = core.applyMonitorTick(a, ctx, new Date(deadline2 + 5 * 60000));
  assert.ok(types(r3).includes("OVERTIME_ASKED_AGAIN"));
  assert.strictEqual(a.overtime.askId, 3);
  assert.strictEqual(a.overtime.unansweredCount, 3);
  const deadline3 = new Date(a.overtime.deadline).getTime();

  // window #3 (the last one: unansweredCount has now reached overtimeMaxAsks) over, still no reply -> NOW it closes
  keepAliveMs(a, deadline3 - 8 * 60000, deadline3 + 4 * 60000);
  const r4 = core.applyMonitorTick(a, ctx, new Date(deadline3 + 5 * 60000));
  assert.ok(types(r4).includes("OVERTIME_NO_RESPONSE"));
  assert.strictEqual(a.sessions[0].endReason, "NO_RESPONSE");
  assert.strictEqual(fmt(a.sessions[0].checkOut), fmt(D("18:30:00"))); // no overtime credited
  assert.strictEqual(a.review.state, "PENDING_EXPLANATION");
  assert.deepStrictEqual(r4.notes.map((x) => x.type), ["SESSION_ENDED", "NO_RESPONSE"]); // no FORCE_LOGOUT (default noResponseAction)
  core.recompute(a, ctx);
  assert.strictEqual(a.overtimeMinutes, 0);
  assert.strictEqual(a.status, "Half Day"); // 9 h worked, but held as a half day until explained
  assert.strictEqual(core.effectiveStatus(a, ctx.settings), "Half Day");
  assert.strictEqual(core.effectiveStatus(a, { ...ctx.settings, noResponseAction: "FLAG_ONLY" }), "Completed");
});

scenario("noResponseAction: AUTO_LOGOUT also raises a FORCE_LOGOUT note once every repeat ask is exhausted", () => {
  const withAutoLogout = { ...ctx, settings: { ...ctx.settings, noResponseAction: "AUTO_LOGOUT", overtimeMaxAsks: 1, overtimePromptMinutes: 10 } };
  const a = newDay();
  core.applySignal(a, withAutoLogout, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  const askedAt = new Date(a.overtime.deadline).getTime() - 10 * 60000;
  keepAliveMs(a, askedAt, askedAt + 8 * 60000); // keep the heartbeat fresh right up to just before the deadline
  // with overtimeMaxAsks: 1, the very first missed window is already the last one
  const deadline = new Date(a.overtime.deadline).getTime();
  const r = core.applyMonitorTick(a, withAutoLogout, new Date(deadline + 10000));
  assert.ok(types(r).includes("OVERTIME_NO_RESPONSE"));
  assert.deepStrictEqual(r.notes.map((x) => x.type), ["SESSION_ENDED", "NO_RESPONSE", "FORCE_LOGOUT"]);
});

scenario("overtimeMaxAsks: 1 preserves the original single-ask-then-close behaviour for anyone who configures it that way", () => {
  const single = { ...ctx, settings: { ...ctx.settings, overtimeMaxAsks: 1 } };
  const a = newDay();
  core.applySignal(a, single, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  const askedAt = new Date(a.overtime.deadline).getTime() - 10 * 60000;
  keepAliveMs(a, askedAt, askedAt + 8 * 60000);
  const deadline = new Date(a.overtime.deadline).getTime();
  const r = core.applyMonitorTick(a, single, new Date(deadline + 10000));
  assert.ok(types(r).includes("OVERTIME_NO_RESPONSE")); // closes on the very first missed window
  assert.strictEqual(a.sessions[0].endReason, "NO_RESPONSE");
});

scenario("YES can be answered during a REPEAT ask too, not just the first one", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  const deadline1 = new Date(a.overtime.deadline).getTime();
  keepAliveMs(a, T("18:32:30"), deadline1 + 9 * 60000);
  core.applyMonitorTick(a, ctx, new Date(deadline1 + 10 * 60000)); // repeat ask #2 fires
  assert.strictEqual(a.overtime.askId, 2);
  const ans = core.answerOvertime(a, ctx, "YES", new Date(a.overtime.deadline).getTime() - 2 * 60000); // answered during the SECOND ask's window
  assert.ok(ans.ok);
  assert.strictEqual(a.overtime.state, "CONFIRMED");
});

scenario("absolute safety cap: a session stuck ASKING (for any reason - a stuck sweep, a bug) is still force-closed eventually, never unbounded", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00"); // ask #1 fires
  assert.strictEqual(a.overtime.state, "ASKING");
  // simulate the monitor sweep itself not running for a long stretch (the exact bug
  // report: heartbeats kept flowing fine, but nothing ever resolved the deadline) -
  // heartbeats stay fresh throughout, but the tick that would process them is never
  // called until long after. Once it finally runs, past the absolute cap, it must close
  // the session outright - not just re-ask once more and leave it open again.
  keepAliveMs(a, T("18:32:30"), T("09:30:00") + 16 * 3600 * 1000 + 5000);
  const r = core.applyMonitorTick(a, ctx, new Date(T("09:30:00") + 16 * 3600 * 1000 + 5000)); // 16h+ since check-in
  assert.deepStrictEqual(types(r), ["AUTO_CHECK_OUT"]);
  assert.strictEqual(a.sessions[0].endReason, "AUTO_SHIFT_END");
  assert.notStrictEqual(a.sessions[0].checkOut, null); // closed - no longer an unbounded timer
});

scenario("absolute safety cap also protects CONFIRMED (genuine) overtime - it just allows a much longer run first", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  core.answerOvertime(a, ctx, "YES", T("18:33:00"));
  assert.strictEqual(a.overtime.state, "CONFIRMED");
  keepAliveMs(a, T("18:34:00"), T("09:30:00") + 15.5 * 3600 * 1000);
  const stillOpen = core.applyMonitorTick(a, ctx, new Date(T("09:30:00") + 15.5 * 3600 * 1000));
  assert.strictEqual(a.sessions[0].checkOut, null); // confirmed overtime is allowed to keep running...
  keepAliveMs(a, T("09:30:00") + 15.5 * 3600 * 1000 + 90000, T("09:30:00") + 16 * 3600 * 1000 + 5000);
  const r = core.applyMonitorTick(a, ctx, new Date(T("09:30:00") + 16 * 3600 * 1000 + 5000));
  assert.deepStrictEqual(types(r), ["AUTO_CHECK_OUT"]); // ...but not literally forever
});

scenario("absolute safety cap is configurable, and does not fire early on an ordinary day", () => {
  const shortCap = { ...ctx, settings: { ...ctx.settings, absoluteMaxSessionHours: 4 } };
  const a = newDay();
  core.applySignal(a, shortCap, hb("09:30:00"));
  keepAlive(a, "09:31:30", "13:00:00"); // 3.5h in, well under the 4h absolute cap
  const r = core.applyMonitorTick(a, shortCap, D("13:00:10"));
  assert.strictEqual(a.sessions[0].checkOut, null);
  assert.strictEqual(r.notes.length, 0);
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

scenario("day off, check-in: asked 'are you working today?' once, right away - not at shift end", () => {
  const off = { ...ctx, offDay: { type: "WEEKLY_OFF" } };
  const a = newDay();
  const r = core.applySignal(a, off, hb("11:00:00"));
  assert.ok(types(r).includes("OFFDAY_ASKED"));
  assert.strictEqual(a.offDayAsk.state, "ASKING");
  assert.strictEqual(a.offDayAsk.askId, 1);
  assert.strictEqual(new Date(a.offDayAsk.deadline).getTime() - new Date(a.offDayAsk.askedAt).getTime(), 10 * 60000); // default offDayAskMinutes
  // asked only once per day, not again on the next heartbeat
  const r2 = core.applySignal(a, off, hb("11:01:30"));
  assert.ok(!types(r2).includes("OFFDAY_ASKED"));
});

scenario("day off, answers YES: counted normally as offDayMinutes, exactly like today", () => {
  const off = { ...ctx, offDay: { type: "WEEKLY_OFF" } };
  const a = newDay();
  core.applySignal(a, off, hb("11:00:00"));
  const ans = core.answerOffDay(a, off, "YES", T("11:02:00"));
  assert.ok(ans.ok);
  assert.strictEqual(a.offDayAsk.state, "YES");
  core.applySignal(a, off, hb("11:03:30"));
  core.applySignal(a, off, { kind: "SHUTDOWN", t: D("13:00:00"), present: true, connected: true, live: true, ...OFFICE });
  core.recompute(a, off);
  assert.strictEqual(a.offDayMinutes, 120);
  assert.strictEqual(a.status, "Completed");
});

scenario("day off, answers NO: nothing counted, and the session ends right there", () => {
  const off = { ...ctx, offDay: { type: "WEEKLY_OFF" } };
  const a = newDay();
  core.applySignal(a, off, hb("11:00:00"));
  core.applySignal(a, off, hb("11:03:00"));
  const ans = core.answerOffDay(a, off, "NO", T("11:04:00")); // within the 10-minute window
  assert.ok(ans.ok);
  assert.strictEqual(a.offDayAsk.state, "NO");
  assert.strictEqual(a.sessions[0].endReason, "OFFDAY_DECLINED");
  assert.notStrictEqual(a.sessions[0].checkOut, null);
  core.recompute(a, off);
  assert.strictEqual(a.offDayMinutes, 0);
  // does not restart even if they keep showing up on the network afterwards
  core.applySignal(a, off, hb("12:00:00"));
  assert.strictEqual(a.sessions.length, 1);
});

scenario("day off, no reply within the window: defaults to NOT working - nothing counted, session ends, not asked again", () => {
  const off = { ...ctx, offDay: { type: "WEEKLY_OFF" } };
  const a = newDay();
  core.applySignal(a, off, hb("11:00:00"));
  keepAliveMs(a, T("11:01:30"), T("11:09:30")); // keep the heartbeat fresh right up to just before the 10-minute deadline
  const r = core.applyMonitorTick(a, off, new Date(T("11:00:00") + 10 * 60000 + 5000));
  assert.ok(types(r).includes("OFFDAY_NO_RESPONSE"));
  assert.strictEqual(a.offDayAsk.state, "NO");
  assert.notStrictEqual(a.sessions[0].checkOut, null);
  core.recompute(a, off);
  assert.strictEqual(a.offDayMinutes, 0);
  assert.strictEqual(a.review.state, "NONE"); // never penalised like a missed shift-end reply - it is simply not counted
  // a late answer after the window is rejected, same as the overtime question
  const late = core.answerOffDay(a, off, "YES", T("11:00:00") + 11 * 60000);
  assert.ok(!late.ok);
  assert.strictEqual(late.code, "EXPIRED");
});

scenario("an ordinary working day never asks 'are you working today?' - that question is for a day off only", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  assert.strictEqual(a.offDayAsk.state, "NONE");
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
  const offSingle = { ...off, settings: { ...off.settings, overtimeMaxAsks: 1 } };
  core.applySignal(b, offSingle, hb("09:30:00"));
  for (let t = T("09:31:30"); t < T("18:45:00"); t += 90000) core.applySignal(b, offSingle, { ...hb("09:31:30"), t: new Date(t) });
  core.applyMonitorTick(b, offSingle, D("18:45:10"));
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

// =====================================================================
// CRM_LOGIN MODE - no Wi-Fi heartbeat at all. Once the engine has adopted the flat
// checkIn/checkOut into sessions[] (attendanceEngine.tickOne does this once, the first
// time it sees the day), every one of these should work exactly like Wi-Fi mode -
// "still around" is decided by ctx.crmAlive (a fresh activity ping) instead of a
// heartbeat, and nothing here is reachable through applySignal at all, only through
// applyMonitorTick.
// =====================================================================

/** A day already adopted into sessions[] (as tickOne would leave it), with no Wi-Fi at all. */
const crmDay = (checkInHms) => ({ ...newDay(), sessions: [{ checkIn: D(checkInHms), checkOut: null }] });

scenario("CRM_LOGIN: asked 'still working?' at shift end, same as Wi-Fi, using crmAlive instead of a heartbeat", () => {
  const crm = { ...ctx, crmAlive: true };
  const a = crmDay("09:30:00");
  const r = core.applyMonitorTick(a, crm, D("18:30:05"));
  assert.ok(types(r).includes("OVERTIME_ASKED"));
  assert.strictEqual(a.overtime.state, "ASKING");
});

scenario("CRM_LOGIN: not asked while their tab has gone quiet (crmAlive false) - same restraint as a silent Wi-Fi device", () => {
  const crm = { ...ctx, crmAlive: false };
  const a = crmDay("09:30:00");
  const r = core.applyMonitorTick(a, crm, D("18:30:05"));
  assert.ok(!types(r).includes("OVERTIME_ASKED"));
  assert.strictEqual(a.overtime?.state ?? "NONE", "NONE");
});

scenario("CRM_LOGIN: repeat-asks and the absolute cap both work exactly like Wi-Fi mode", () => {
  const crm = { ...ctx, crmAlive: true };
  const a = crmDay("09:30:00");
  core.applyMonitorTick(a, crm, D("18:30:05")); // ask #1
  const deadline1 = new Date(a.overtime.deadline).getTime();
  const r2 = core.applyMonitorTick(a, crm, new Date(deadline1 + 10 * 60000)); // no reply -> repeat ask #2
  assert.ok(types(r2).includes("OVERTIME_ASKED_AGAIN"));
  // never responds at all, all the way out to the absolute cap - it still closes, same as Wi-Fi
  const r3 = core.applyMonitorTick(a, crm, new Date(T("09:30:00") + 16 * 3600 * 1000 + 5000));
  assert.deepStrictEqual(types(r3), ["AUTO_CHECK_OUT"]);
  assert.notStrictEqual(a.sessions[0].checkOut, null);
});

scenario("CRM_LOGIN: 'are you working today?' fires from the monitor tick (there is no check-in signal to hook for this mode)", () => {
  const off = { ...ctx, offDay: { type: "WEEKLY_OFF" }, crmAlive: true };
  const a = crmDay("11:00:00");
  assert.strictEqual(a.offDayAsk?.state ?? "NONE", "NONE"); // nothing has asked yet - unlike Wi-Fi, no applySignal ever ran
  const r = core.applyMonitorTick(a, off, D("11:00:05"));
  assert.ok(types(r).includes("OFFDAY_ASKED"));
  assert.strictEqual(a.offDayAsk.state, "ASKING");
  const ans = core.answerOffDay(a, off, "YES", T("11:02:00"));
  assert.ok(ans.ok);
  // the engine (attendanceEngine.tickOne) refreshes lastPresentAt on every tick for this
  // mode, since no heartbeat ever does it the way Wi-Fi mode's does - simulated here
  a.sessions[0].lastPresentAt = D("13:00:00");
  core.applyMonitorTick(a, off, D("13:00:00"));
  core.recompute(a, off);
  assert.ok(a.offDayMinutes > 0); // counted separately, exactly like a Wi-Fi day-off confirmation
});

scenario("CRM_LOGIN: an ordinary Wi-Fi day is completely unaffected - crmAlive is simply absent from ctx", () => {
  const a = newDay();
  core.applySignal(a, ctx, hb("09:30:00"));
  keepAlive(a, "09:31:30", "18:31:00");
  assert.strictEqual(a.overtime.state, "ASKING"); // driven by the real Wi-Fi heartbeat, same as every test above this one
});

console.log(`\n${n} scenarios passed`);
