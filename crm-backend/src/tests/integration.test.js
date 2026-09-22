// =====================================================
// END-TO-END INTEGRATION TEST
//   node src/tests/integration.test.js
//
// Boots the real app (Express + Socket.IO) on a random port and drives it over
// HTTP exactly like the frontend and the desktop agent do.
//
// !! It WIPES the database it connects to. It refuses to run unless the
// !! database name contains "test".
// =====================================================
require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

const app = require("../../app");
const socket = require("../Services/socket");
const engine = require("../Services/attendanceEngine");
const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");
const { dateKey, addDays, minutesOfDay, formatMinutes } = require("../Utils/time");

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log("  ✓", name);
  } else {
    failures.push(name);
    console.log("  ✗", name, extra !== undefined ? `\n      got: ${JSON.stringify(extra)}` : "");
  }
}
const section = (t) => console.log(`\n${t}`);

let BASE = "";
async function api(method, path, { token, device, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers.Authorization = `Device ${device}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    /* empty */
  }
  return { status: res.status, body: json || {} };
}

const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60 * 1000).toISOString();
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const OFFICE5 = { ssid: "PROFENAA-5G", bssid: "8c:c7:c3:09:1d:70", connected: true }; // lower-case on purpose
const OFFICE2 = { ssid: "PROFENAA-2G", bssid: "8C:C7:C3:09:1D:74", connected: true };
const HOTSPOT = { ssid: "Praveen iPhone", bssid: "02:AA:BB:CC:DD:EE", connected: true };

async function run() {
  // ------------------------------------------------ setup
  await mongoose.connect(process.env.MONGO_URI);
  const dbName = mongoose.connection.name;
  if (!/test/i.test(dbName)) throw new Error(`Refusing to wipe database "${dbName}" (name must contain "test")`);
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  const server = http.createServer(app);
  socket.init(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;

  const today = dateKey();
  const nowMin = minutesOfDay(new Date());
  const shiftStart = hhmm(Math.max(0, nowMin - 60));
  const shiftEnd = "23:59";

  // ------------------------------------------------ admin bootstrap & security
  section("Admin bootstrap");
  let r = await api("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  check("first admin can register with no token (first-run setup)", r.status === 201 || r.status === 200, r);
  r = await api("POST", "/api/admin/register", { body: { name: "Intruder", password: "hack123", role: "admin" } });
  check("second admin registration WITHOUT a token is rejected", r.status === 401 || r.status === 403, r);
  r = await api("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" } });
  const admin = r.body.accessToken || r.body.token;
  check("admin can log in", Boolean(admin), r);

  r = await api("GET", "/api/staff");
  check("staff API needs a token", r.status === 401, r);
  r = await api("GET", "/api/health");
  check("health endpoint is public", r.status === 200 && r.body.status === "ok");
  r = await api("GET", "/api/nope");
  check("unknown API route returns JSON 404", r.status === 404 && r.body.success === false, r);

  // ------------------------------------------------ settings
  section("Settings");
  r = await api("PUT", "/api/settings", { token: admin, body: { weeklyOffDays: [], halfDayMinutes: 600 } });
  check("half-day >= full-day rejected", r.status === 400, r);
  r = await api("PUT", "/api/settings", { token: admin, body: { weeklyOffDays: [], lateGraceMinutes: 10, noShowReminderMinutes: 30 } });
  check("admin can update rules (weekly off cleared)", r.status === 200 && r.body.settings.weeklyOffDays.length === 0, r);

  // ------------------------------------------------ branches
  section("Branches & Wi-Fi networks");
  r = await api("POST", "/api/branches", { token: admin, body: { name: "Pollachi" } });
  const branch = r.body.branch;
  check("branch created", r.status === 201 && branch?._id, r);
  r = await api("POST", `/api/branches/${branch._id}/networks`, { token: admin, body: { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70", band: "5 GHz" } });
  check("network added", r.status === 201, r);
  r = await api("POST", `/api/branches/${branch._id}/networks`, { token: admin, body: { ssid: "PROFENAA-2G", bssid: "8C:C7:C3:09:1D:74", band: "2.4 GHz" } });
  check("second network added", r.status === 201);
  r = await api("POST", `/api/branches/${branch._id}/networks`, { token: admin, body: { ssid: "X", bssid: "not-a-bssid" } });
  check("invalid BSSID rejected", r.status === 400, r);
  r = await api("POST", `/api/branches/${branch._id}/networks`, { token: admin, body: { ssid: "X", bssid: "8C:*" } });
  check("dangerously broad wildcard rejected", r.status === 400, r);
  r = await api("POST", `/api/branches/${branch._id}/networks`, { token: admin, body: { ssid: "PROFENAA-5G", bssid: "8c:c7:c3:09:1d:70" } });
  check("duplicate access point rejected (case-insensitive)", r.status === 409, r);

  // ------------------------------------------------ staff
  section("Staff management");
  const mk = (name, mobile, extra = {}) =>
    api("POST", "/api/staff", {
      token: admin,
      body: { name, mobile, password: "secret123", role: "Developer", shiftStart, shiftEnd, branchId: branch._id, ...extra },
    });

  r = await mk("Yokesh", "9000000001");
  const A = r.body.user;
  check("staff created; branch given => Wi-Fi mode by default", r.status === 201 && A.attendanceMode === "WIFI", r);
  check("password is not returned", A.password === undefined);
  r = await mk("Yokesh", "9000000099");
  check("duplicate username rejected", r.status === 409, r);
  r = await mk("Someone", "9000000001");
  check("duplicate mobile rejected", r.status === 409, r);
  r = await mk("Nobranch", "9000000002", { branchId: undefined, attendanceMode: "WIFI" });
  check("Wi-Fi mode without a branch rejected", r.status === 400, r);
  const B = (await mk("Praveen", "9000000003")).body.user;
  const C = (await mk("Karthik", "9000000004", { attendanceMode: "CRM_LOGIN" })).body.user;
  const F = (await mk("Farlate", "9000000005", { shiftStart: hhmm(Math.min(1439, nowMin + 300)), shiftEnd: "23:59" })).body.user;
  const E = (await mk("Idle", "9000000006")).body.user;
  check("all test staff exist", [A, B, C, F, E].every((u) => u?._id));

  r = await api("POST", "/api/UserAccounts/create-Account", { body: { name: "NoAuth", mobile: "9111111111", password: "abc123", role: "x" } });
  check("legacy create-Account now requires admin", r.status === 401, r);

  // employee logins
  const login = async (name) => (await api("POST", "/api/UserAccounts/Log-in", { body: { name, password: "secret123" } })).body;
  const la = await login("Yokesh");
  const tokenA = la.accessToken || la.token;
  const tokenB = (await login("Praveen")).accessToken || (await login("Praveen")).token;
  check("employee can log in", Boolean(tokenA), la);
  check("Wi-Fi employee's CRM login does NOT create attendance", (await Attendance.countDocuments({ userId: A._id })) === 0);

  r = await api("GET", "/api/staff", { token: tokenA });
  check("employee token cannot use admin staff API", r.status === 403, r);

  // real-time channel
  const gotUser = [];
  const gotAdmin = [];
  const sockA = ioClient(BASE, { auth: { token: tokenA }, transports: ["websocket"] });
  const sockAdmin = ioClient(BASE, { auth: { token: admin }, transports: ["websocket"] });
  sockA.on("notification", (n) => gotUser.push(n));
  sockAdmin.on("notification", (n) => gotAdmin.push(n));
  await new Promise((res) => setTimeout(res, 400));
  const bad = ioClient(BASE, { auth: { token: "garbage" }, transports: ["websocket"], reconnection: false });
  const badRejected = await new Promise((res) => {
    bad.on("connect_error", () => res(true));
    setTimeout(() => res(false), 1500);
  });
  check("socket with a bad token is refused", badRejected);
  bad.close();

  // ------------------------------------------------ devices
  section("Device registration");
  r = await api("POST", "/api/devices/register", { token: tokenA, body: { deviceId: "short" } });
  check("bad deviceId rejected", r.status === 400, r);
  r = await api("POST", "/api/devices/register", { token: tokenA, body: { deviceId: "DEV-A-LAPTOP-0001", hostname: "YOKESH-PC", platform: "win32", agentVersion: "2.0.0" } });
  const devTokA = r.body.deviceToken;
  check("first device auto-approved with a token", r.status === 201 && r.body.status === "ACTIVE" && devTokA?.length === 64, r);
  r = await api("POST", "/api/devices/register", { token: tokenB, body: { deviceId: "DEV-A-LAPTOP-0001" } });
  check("a device cannot be claimed by a second employee", r.status === 409, r);
  r = await api("POST", "/api/devices/register", { token: tokenA, body: { deviceId: "DEV-A-DESKTOP-0002", hostname: "SECOND-PC" } });
  const pendingId = r.body.device?._id;
  const devTokPending = r.body.deviceToken;
  check("an additional device is PENDING", r.body.status === "PENDING", r);
  r = await api("POST", "/api/agent/heartbeat", { device: devTokPending, body: { ...OFFICE5 } });
  check("pending device cannot record attendance", r.status === 403 && r.body.code === "DEVICE_PENDING", r);
  r = await api("POST", "/api/agent/heartbeat", { device: "0".repeat(64), body: { ...OFFICE5 } });
  check("unknown device token rejected", r.status === 401, r);
  await new Promise((res) => setTimeout(res, 300));
  check("admin was notified about the pending device", gotAdmin.some((n) => n.type === "DEVICE_PENDING"));
  r = await api("PATCH", `/api/devices/${pendingId}/revoke`, { token: admin });
  check("admin can revoke a device", r.status === 200 && r.body.device.status === "REVOKED");
  r = await api("POST", "/api/agent/heartbeat", { device: devTokPending, body: { ...OFFICE5 } });
  check("revoked device is refused", r.status === 401 && r.body.code === "DEVICE_REVOKED", r);
  r = await api("GET", "/api/devices/mine", { token: tokenA });
  check("device list never exposes token hashes", r.body.devices.every((d) => d.tokenHash === undefined));

  r = await api("GET", "/api/agent/config?hostname=YOKESH-PC&agentVersion=2.0.1", { device: devTokA });
  check("agent config", r.status === 200 && r.body.tracking === true && r.body.heartbeatInterval === 90 && r.body.branch === "Pollachi", r);

  // ------------------------------------------------ attendance flow (employee A)
  section("Agent flow: check-in, warning, reconnect, timeout, return");
  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...OFFICE5, occurredAt: ago(40) } });
  check("first office heartbeat => CONNECTED (BSSID matched case-insensitively)", r.body.state === "CONNECTED" && r.body.sessions === 1, r);
  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...OFFICE2, occurredAt: ago(38.5) } });
  check("2.4GHz access point of the same branch also counts", r.body.state === "CONNECTED" && r.body.sessions === 1, r);
  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...OFFICE2, occurredAt: ago(38.5) } });
  check("duplicate heartbeat ignored", r.body.ignored === "DUPLICATE", r);
  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...HOTSPOT, occurredAt: ago(37) } });
  check("hotspot => WARNING (WIFI_CHANGED) with a grace deadline", r.body.state === "WARNING" && r.body.warningReason === "WIFI_CHANGED" && Boolean(r.body.graceDeadline), r);
  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...OFFICE5, occurredAt: ago(36) } });
  check("reconnect inside grace => back to CONNECTED, still 1 session", r.body.state === "CONNECTED" && r.body.sessions === 1, r);

  r = await api("GET", "/api/attendance/my/live", { token: tokenA });
  check("employee live view: Present, Wi-Fi mode, device online", r.body.display === "PRESENT" && r.body.mode === "WIFI" && r.body.device?.status === "ACTIVE", r.body);
  check("live view carries session list & branch", r.body.attendance?.sessions?.length === 1 && r.body.branch?.name === "Pollachi");
  check("late minutes recorded against shift start", r.body.attendance.lateMinutes > 10, r.body.attendance);

  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...HOTSPOT, occurredAt: ago(35) } });
  check("second warning", r.body.state === "WARNING");
  const tickAt = new Date(NOW - 20 * 60 * 1000);
  await engine.runMonitorTick(tickAt);
  r = await api("GET", "/api/attendance/my/live", { token: tokenA });
  check("monitor closed the session after grace expired", r.body.attendance.sessions[0].endReason === "WIFI_CHANGED" && r.body.live.state === "ENDED", r.body.attendance?.sessions);
  const closedAt = new Date(r.body.attendance.sessions[0].checkOut).getTime();
  const lastPresent = NOW - 36 * 60 * 1000;
  check("session ended at LAST PRESENCE (not when grace expired)", Math.abs(closedAt - lastPresent) < 2000, [closedAt - lastPresent]);
  check("total minutes exclude the grace period", r.body.attendance.totalMinutes >= 3 && r.body.attendance.totalMinutes <= 5, r.body.attendance.totalMinutes);

  r = await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ...OFFICE5, occurredAt: ago(5) } });
  check("coming back opens a SECOND session the same day", r.body.state === "CONNECTED" && r.body.sessions === 2, r);

  await new Promise((res) => setTimeout(res, 400));
  const types = gotUser.map((n) => n.type);
  check("employee got real-time: attendance started", types.includes("CHECK_IN"), types);
  check("employee got real-time: Wi-Fi warning", types.includes("WIFI_WARNING"), types);
  check("employee got real-time: back on Wi-Fi", types.includes("WIFI_RECONNECTED"), types);
  check("employee got real-time: session ended", types.includes("SESSION_ENDED"), types);
  check("admin got a late check-in alert", gotAdmin.some((n) => n.type === "LATE_CHECK_IN"), gotAdmin.map((n) => n.type));

  r = await api("POST", "/api/attendance/check-in", { token: tokenA });
  check("manual check-in is blocked for Wi-Fi staff", r.status === 403, r);

  // ------------------------------------------------ offline queue (employee B)
  section("Offline queue replay");
  const devB = (await api("POST", "/api/devices/register", { token: tokenB, body: { deviceId: "DEV-B-LAPTOP-0001", hostname: "PRAVEEN-PC" } })).body.deviceToken;
  await api("POST", "/api/agent/heartbeat", { device: devB, body: { ...OFFICE5, occurredAt: ago(50) } });
  await api("POST", "/api/agent/heartbeat", { device: devB, body: { ...OFFICE5, occurredAt: ago(48.5) } });
  await engine.runMonitorTick(new Date(NOW)); // server was blind for 48 min and closes the session
  let bdoc = await Attendance.findOne({ userId: B._id, date: today });
  check("(setup) server closed B's session while offline", Boolean(bdoc.sessions[0].checkOut));
  const events = [];
  for (let m = 47; m >= 2; m -= 1.5) events.push({ kind: "HEARTBEAT", ...OFFICE5, occurredAt: ago(m) });
  events.reverse(); // arrive out of order: server must sort them
  r = await api("POST", "/api/agent/batch", { device: devB, body: { events } });
  check("batch accepted", r.status === 200 && r.body.processed === events.length, r);
  bdoc = await Attendance.findOne({ userId: B._id, date: today });
  check("replay restored ONE continuous session (no false gap)", bdoc.sessions.length === 1 && !bdoc.sessions[0].checkOut, bdoc.sessions.length);
  check("worked minutes cover the outage", bdoc.totalMinutes >= 44, bdoc.totalMinutes);
  r = await api("POST", "/api/agent/heartbeat", { device: devB, body: { ...OFFICE5 } });
  check("next live heartbeat continues the same session", r.body.sessions === 1 && r.body.state === "CONNECTED", r);

  section("Guards");
  r = await api("POST", "/api/agent/heartbeat", { device: devB, body: { ...OFFICE5, occurredAt: new Date(NOW - 72 * 3600 * 1000).toISOString() } });
  check("events older than 48h are ignored", r.body.ignored === "STALE" || r.body.ignored === "DUPLICATE", r.body);
  const devF = (await api("POST", "/api/devices/register", { token: (await login("Farlate")).accessToken || (await login("Farlate")).token, body: { deviceId: "DEV-F-LAPTOP-0001" } })).body.deviceToken;
  if (nowMin + 300 < 1439 && nowMin < 1000) {
    r = await api("POST", "/api/agent/heartbeat", { device: devF, body: { ...OFFICE5 } });
    check("presence far before shift start does not check in", r.body.outsideWindow === true, r.body);
    check("...and creates no record", (await Attendance.countDocuments({ userId: F._id })) === 0);
  }
  r = await api("POST", "/api/agent/heartbeat", { device: devB, body: { connected: false, ssid: "", bssid: "" } });
  check("Wi-Fi disconnected => WARNING (WIFI_DISCONNECTED) with live ~5 min countdown", r.body.warningReason === "WIFI_DISCONNECTED" && r.body.graceRemainingSeconds > 240 && r.body.graceRemainingSeconds <= 300, r.body);
  r = await api("POST", "/api/agent/shutdown", { device: devB, body: { ...OFFICE5 } });
  check("clean shutdown ends the session", r.status === 200 && r.body.state === "ENDED", r.body);

  // rejected-network audit (unregistered access point)
  await api("POST", "/api/agent/heartbeat", { device: devTokA, body: { ssid: "PROFENAA-5G", bssid: "AA:BB:CC:00:11:22", connected: true } });
  r = await api("GET", "/api/branches/rejected-networks", { token: admin });
  check("unregistered access point shows up for the admin", r.body.items?.some((i) => i.bssid === "AA:BB:CC:00:11:22"), r.body);

  // ------------------------------------------------ board & reports
  section("Admin live board & reports");
  r = await api("GET", "/api/attendance/admin/board", { token: admin });
  const rows = r.body.rows || [];
  const rowA = rows.find((x) => x.name === "Yokesh");
  const rowB = rows.find((x) => x.name === "Praveen");
  const rowE = rows.find((x) => x.name === "Idle");
  check("board lists all active staff", rows.length === 5, rows.length);
  check("Yokesh shows as in office with 2 sessions", ["PRESENT", "WARNING"].includes(rowA?.display) && rowA?.sessions === 2, rowA);
  check("Praveen shows as left (session closed, day not over)", rowB?.display === "LEFT", rowB?.display);
  check("Idle staff not yet in (overdue)", rowE?.display === "NOT_YET_IN" && rowE.overdue === true, rowE);
  check("summary counts add up", r.body.summary.total === 5 && r.body.summary.late >= 1 && r.body.summary.wifiWithoutDevice === 1, r.body.summary);
  r = await api("GET", `/api/attendance/admin/board?branchId=${branch._id}&q=prav`, { token: admin });
  check("board filters by branch and search text", r.body.rows.length === 1 && r.body.rows[0].name === "Praveen", r.body.rows?.length);
  r = await api("GET", "/api/attendance/admin/board?date=2026-13-45", { token: admin });
  check("bad date rejected", r.status === 400);
  r = await api("GET", `/api/attendance/admin/detail?userId=${A._id}&date=${today}`, { token: admin });
  check("admin can inspect a day: sessions + audit trail", r.body.attendance?.sessions?.length === 2 && r.body.events?.length >= 5, [r.body.attendance?.sessions?.length, r.body.events?.length]);

  // ------------------------------------------------ leave, holiday, regularization
  section("Leave, holidays, corrections");
  const tomorrow = addDays(today, 1);
  r = await api("POST", "/api/leaves", { token: tokenA, body: { type: "Casual Leave", fromDate: tomorrow, toDate: tomorrow, reason: "Family function" } });
  const leave = r.body.leave;
  check("leave request created (1 working day)", r.status === 201 && leave.days === 1, r);
  r = await api("POST", "/api/leaves", { token: tokenA, body: { type: "Casual Leave", fromDate: tomorrow, toDate: tomorrow, reason: "again" } });
  check("overlapping leave rejected", r.status === 409, r);
  r = await api("POST", "/api/leaves", { token: tokenA, body: { type: "Nope", fromDate: tomorrow, toDate: tomorrow, reason: "x" } });
  check("invalid leave type rejected", r.status === 400);
  r = await api("PATCH", `/api/leaves/${leave._id}/decide`, { token: tokenA, body: { decision: "Approved" } });
  check("employee cannot approve leave", r.status === 403);
  r = await api("PATCH", `/api/leaves/${leave._id}/decide`, { token: admin, body: { decision: "Approved", note: "Enjoy" } });
  check("admin approves leave", r.status === 200 && r.body.leave.status === "Approved", r);
  r = await api("PATCH", `/api/leaves/${leave._id}/decide`, { token: admin, body: { decision: "Rejected" } });
  check("a decided request cannot be decided twice", r.status === 409);
  r = await api("GET", "/api/leaves/balance", { token: tokenA });
  const cas = r.body.balance.find((x) => x.type === "Casual Leave");
  check("leave balance reflects the approval", cas.used === 1 && cas.remaining === cas.quota - 1, cas);
  r = await api("GET", `/api/attendance/admin/board?date=${tomorrow}`, { token: admin });
  check("board shows the approved leave for that day", r.body.rows.find((x) => x.name === "Yokesh")?.display === "ON_LEAVE", r.body.rows.map((x) => [x.name, x.display]));

  const hDay = addDays(today, 2);
  r = await api("POST", "/api/holidays", { token: admin, body: { date: hDay, name: "Founders Day" } });
  check("holiday created", r.status === 201, r);
  r = await api("GET", `/api/attendance/admin/board?date=${hDay}`, { token: admin });
  check("board shows the holiday", r.body.summary.holiday === 5, r.body.summary);
  r = await api("POST", "/api/leaves", { token: tokenA, body: { type: "Casual Leave", fromDate: hDay, toDate: hDay, reason: "on a holiday" } });
  check("leave on a holiday is refused (no days consumed)", r.status === 400, r);

  const yesterday = addDays(today, -1);
  r = await api("POST", "/api/regularizations", { token: tokenA, body: { date: yesterday, checkIn: "09:30", checkOut: "18:00", reason: "Router was down, I was in office" } });
  const reg = r.body.regularization;
  check("correction request created", r.status === 201 && reg?._id, r);
  r = await api("POST", "/api/regularizations", { token: tokenA, body: { date: yesterday, checkIn: "09:30", checkOut: "18:00", reason: "dup" } });
  check("duplicate pending correction refused", r.status === 409);
  r = await api("POST", "/api/regularizations", { token: tokenA, body: { date: addDays(today, 3), checkIn: "09:30", checkOut: "18:00", reason: "future" } });
  check("future correction refused", r.status === 400);
  r = await api("PATCH", `/api/regularizations/${reg._id}/decide`, { token: admin, body: { decision: "Approved" } });
  check("admin approves the correction", r.status === 200, r);
  const fixed = await Attendance.findOne({ userId: A._id, date: yesterday });
  check("correction written to the record (510 min, Completed, MANUAL, audited)",
    fixed && fixed.totalMinutes === 510 && fixed.status === "Completed" && fixed.attendanceSource === "MANUAL" && fixed.edits.length === 1, fixed && [fixed.totalMinutes, fixed.status, fixed.attendanceSource, fixed.edits.length]);
  r = await api("PUT", "/api/attendance/admin/manual", { token: admin, body: { userId: E._id, date: yesterday, checkIn: "10:00", checkOut: "14:30", note: "Half day - verified by manager" } });
  check("admin manual entry works (270 min => Half Day)", r.status === 200 && r.body.attendance.status === "Half Day", r.body);
  r = await api("PUT", "/api/attendance/admin/manual", { token: admin, body: { userId: E._id, date: yesterday, checkIn: "10:00", checkOut: "14:30", note: "" } });
  check("manual entry requires a reason", r.status === 400);

  r = await api("GET", `/api/attendance/admin/report?month=${today.slice(0, 7)}`, { token: admin });
  const repA = r.body.rows.find((x) => x.name === "Yokesh");
  check("monthly report aggregates per employee", repA && repA.present >= 2 && repA.totalMinutes >= 510, repA);
  r = await api("GET", `/api/attendance/my/month?month=${today.slice(0, 7)}`, { token: tokenA });
  check("employee monthly calendar has day entries", r.body.days?.length >= 2 && r.body.days.some((d) => d.date === yesterday && d.display === "COMPLETED"), r.body.days?.slice(-3));

  // ------------------------------------------------ notifications
  section("Notification centre");
  r = await api("GET", "/api/notifications?limit=50", { token: tokenA });
  const unread = r.body.unreadCount;
  check("employee has unread notifications", unread > 5, unread);
  r = await api("PATCH", `/api/notifications/${r.body.notifications[0]._id}/read`, { token: tokenA });
  r = await api("GET", "/api/notifications/unread-count", { token: tokenA });
  check("marking one read lowers the count", r.body.unreadCount === unread - 1, r.body);
  r = await api("GET", "/api/notifications", { token: tokenB });
  check("employees only see their own notifications", r.body.notifications.every((n) => String(n.recipientId) !== String(A._id)));
  r = await api("POST", "/api/notifications/read-all", { token: tokenA });
  r = await api("GET", "/api/notifications/unread-count", { token: tokenA });
  check("mark-all-read", r.body.unreadCount === 0);
  const before = gotUser.length;
  r = await api("POST", "/api/notifications/broadcast", { token: admin, body: { title: "Office closed Friday", message: "Diwali", severity: "warning" } });
  await new Promise((res) => setTimeout(res, 300));
  check("admin broadcast reaches staff live over the socket", r.body.sent >= 5 && gotUser.length > before && gotUser.at(-1).title === "Office closed Friday", [r.body, gotUser.at(-1)?.title]);
  r = await api("POST", "/api/notifications/broadcast", { token: tokenA, body: { title: "spam" } });
  check("employees cannot broadcast", r.status === 403);
  await engine.runMonitorTick(new Date());
  const monitor = require("../Services/attendanceMonitor");
  await monitor.noShowReminders(new Date());
  r = await api("GET", "/api/notifications", { token: (await login("Idle")).accessToken || (await login("Idle")).token });
  check("no-show reminder sent to staff who never appeared (with device hint)", r.body.notifications.some((n) => n.type === "NO_SHOW_REMINDER" && /register/i.test(n.message)), r.body.notifications.map((n) => n.type));
  await monitor.noShowReminders(new Date());
  r = await api("GET", "/api/notifications", { token: (await login("Idle")).accessToken || (await login("Idle")).token });
  check("...and only once per day", r.body.notifications.filter((n) => n.type === "NO_SHOW_REMINDER").length === 1);

  // ------------------------------------------------ existing CRM-login behaviour (regression)
  section("Existing CRM-login attendance still works (regression)");
  const loginC1 = await login("Karthik");
  const firstIn = (await Attendance.findOne({ userId: C._id, date: today }))?.checkIn;
  check("CRM-mode login still auto-creates attendance", Boolean(firstIn));
  await new Promise((res) => setTimeout(res, 1100));
  await login("Karthik");
  const secondIn = (await Attendance.findOne({ userId: C._id, date: today }))?.checkIn;
  check("logging in again no longer overwrites the original check-in", secondIn && firstIn.getTime() === secondIn.getTime(), [firstIn, secondIn]);
  const c1doc = await Attendance.findOne({ userId: C._id, date: today });
  check("late minutes now persist (previously silently dropped)", typeof c1doc.lateMinutes === "number" && c1doc.attendanceSource === "CRM_LOGIN", c1doc.toObject());
  r = await api("POST", "/api/UserAccounts/logout", { token: loginC1.accessToken || loginC1.token });
  const c2doc = await Attendance.findOne({ userId: C._id, date: today });
  check("CRM logout still checks the employee out", r.status === 200 && c2doc.checkOut && c2doc.status === "Completed", [r.status, c2doc.status]);
  r = await api("POST", "/api/attendance/check-in", { token: (await login("Karthik")).accessToken || (await login("Karthik")).token });
  check("manual check-in endpoint still exists for CRM-mode staff", r.status !== 403, r);

  // ------------------------------------------------ admin fixes: edit / delete / deactivate
  section("Fixed admin actions (edit + delete were broken)");
  r = await api("PUT", `/api/UserAccounts/update-PasswordById/${E._id}`, { body: { name: "Hacker", mobile: "9999999999", password: "x12345" } });
  check("update-PasswordById is no longer open to anyone", r.status === 401, r);
  r = await api("PUT", `/api/UserAccounts/update-PasswordById/${E._id}`, { token: admin, body: { name: "Idle Renamed", mobile: "9000000066", password: "" } });
  const editedE = await User.findById(E._id);
  check("edit user saves name + mobile (blank password leaves it unchanged)", r.status === 200 && editedE.name === "Idle Renamed" && editedE.mobile === "9000000066", [r.status, r.body, editedE?.name]);
  r = await api("POST", "/api/UserAccounts/Log-in", { body: { name: "Idle Renamed", password: "secret123" } });
  check("...and the old password still works", r.status === 200, r);
  r = await api("PUT", `/api/staff/${E._id}/`, { token: admin, body: { name: "Yokesh" } });
  check("renaming onto an existing username is refused", r.status === 409, r);

  r = await api("POST", "/api/staff/bulk", { token: admin, body: { userIds: [C._id], attendanceMode: "WIFI", branchId: branch._id } });
  check("bulk switch to Wi-Fi mode", r.status === 200 && r.body.modified === 1, r);
  r = await api("POST", "/api/staff/bulk", { token: admin, body: { userIds: [E._id], attendanceMode: "CRM_LOGIN" } });
  check("bulk switch back to CRM login", r.status === 200 && r.body.modified === 1, r);

  r = await api("PUT", `/api/staff/${B._id}`, { token: admin, body: { isActive: false } });
  check("staff can be deactivated", r.status === 200 && r.body.user.isActive === false, r);
  r = await api("POST", "/api/UserAccounts/Log-in", { body: { name: "Praveen", password: "secret123" } });
  check("deactivated staff cannot log in", r.status === 403, r);
  r = await api("GET", "/api/attendance/my/live", { token: tokenB });
  check("...and their existing token stops working", r.status === 403, r);
  r = await api("POST", "/api/agent/heartbeat", { device: devB, body: { ...OFFICE5 } });
  check("...and their agent stops recording", r.body.tracking === false && r.body.reason === "USER_INACTIVE", r.body);
  r = await api("GET", "/api/attendance/admin/board", { token: admin });
  check("deactivated staff drop off the live board", !r.body.rows.some((x) => x.name === "Praveen"));

  r = await api("DELETE", `/api/UserAccounts/delete-Account/${F._id}`, { token: admin });
  check("delete user works (route was missing before)", r.status === 200 && !(await User.findById(F._id)), r);
  r = await api("DELETE", `/api/UserAccounts/delete-Account/${F._id}`, { token: admin });
  check("deleting again => 404", r.status === 404);
  r = await api("DELETE", `/api/branches/${branch._id}`, { token: admin });
  check("branch with staff cannot be deleted", r.status === 409, r);

  sockA.close();
  sockAdmin.close();
  server.close();
  await mongoose.disconnect();

  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("FAILED:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("\nTEST CRASHED:", err);
  process.exit(2);
});
