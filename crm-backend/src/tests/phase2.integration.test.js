// =====================================================
// PHASE 2 END-TO-END TEST
//   node src/tests/phase2.integration.test.js
//
//  - office-Wi-Fi login gate + login activity log (device / browser / network)
//  - CRM logout stops the timer (verified vs unverified), logged-out PC cannot restart it
//  - shift-end "Are you still working?" (YES / NO / no reply / expired)
//  - no reply -> half day -> explanation -> admin approve / reject
//  - Sunday (day off) work in its own bucket, never penalised
//  - overtime + Sunday report, monthly report columns
//  - Daily Report (DHR): draft, submit, admin filters, missing list, reopen, reminders
//
// !! WIPES the database it connects to; refuses unless the name contains "test".
// =====================================================
require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");

const app = require("../../app");
const socket = require("../Services/socket");
const engine = require("../Services/attendanceEngine");
const monitor = require("../Services/attendanceMonitor");
const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");
const Leave = require("../Models/Leave.Model");
const OfficeIp = require("../Models/OfficeIp.Model");
const LoginLog = require("../Models/LoginLog.Model");
const Notification = require("../Models/Notification.Model");
const AdminAccount = require("../Models/Admin.Model");
const jwt = require("jsonwebtoken");
const { ADMIN_SECRET } = require("../Utils/secrets");
const { dateKey, minutesOfDay, timeToMinutes, weekday, addDays } = require("../Utils/time");

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
async function call(method, path, { token, device, ip, ua, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers.Authorization = `Device ${device}`;
  if (ip) headers["X-Forwarded-For"] = ip;
  if (ua) headers["User-Agent"] = ua;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    /* empty */
  }
  return { status: res.status, body: json || {} };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const OFFICE5 = { ssid: "PROFENAA-5G", bssid: "8c:c7:c3:09:1d:70", connected: true };

const OFFICE_IP = "49.204.10.5"; // what the office router looks like from the internet
const MOBILE_IP = "106.51.3.3";
const HOME_IP = "117.200.4.77";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const dbName = mongoose.connection.name;
  if (!/test/i.test(dbName)) throw new Error(`Refusing to wipe database "${dbName}" (name must contain "test")`);
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  app.set("trust proxy", true); // lets the test pretend to come from different networks
  const server = http.createServer(app);
  socket.init(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;

  const today = dateKey();
  const NOW = Date.now();
  const nowMin = minutesOfDay(new Date());
  const canDoShiftEnd = nowMin >= 65 && nowMin <= 1436;
  const shiftStart = hhmm(Math.max(0, nowMin - 60));
  const wkStart = hhmm(Math.max(0, nowMin - 62)); // shifts that ended two minutes ago
  const wkEnd = hhmm(Math.max(1, nowMin - 2));

  // ------------------------------------------------ setup
  await call("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  let r = await call("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" }, ip: OFFICE_IP, ua: CHROME_WIN });
  const admin = r.body.accessToken || r.body.token;
  check("admin logs in", Boolean(admin), r);
  r = await call("PUT", "/api/settings", { token: admin, body: { weeklyOffDays: [], fullDayMinutes: 60, halfDayMinutes: 30, dailyReportReminderMinutes: 1 } });
  check("test rules set (no weekly off, 60-minute full day so a ~1.5 hour session is a full day)", r.status === 200, r);

  r = await call("POST", "/api/branches", { token: admin, body: { name: "Pollachi" } });
  const branch = r.body.branch;
  await call("POST", `/api/branches/${branch._id}/networks`, { token: admin, body: { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70", band: "5 GHz" } });

  const mk = async (name, mobile, extra = {}) =>
    (
      await call("POST", "/api/staff", {
        token: admin,
        body: { name, mobile, password: "secret123", role: "Developer", shiftStart, shiftEnd: "23:59", branchId: branch._id, ...extra },
      })
    ).body.user;
  const login = async (name, ip = OFFICE_IP, ua = CHROME_WIN) => call("POST", "/api/UserAccounts/Log-in", { body: { name, password: "secret123" }, ip, ua });
  const tokenOf = (res) => res.body.accessToken || res.body.token;
  const register = async (token, id, hostname) =>
    (await call("POST", "/api/devices/register", { token, body: { deviceId: id, hostname } })).body.deviceToken;
  const beat = (dev, extra = {}, ip = OFFICE_IP) => call("POST", "/api/agent/heartbeat", { device: dev, ip, body: { ...OFFICE5, ...extra } });
  const docOf = (u) => Attendance.findOne({ userId: u._id, date: today });

  const A = await mk("Yokesh", "9100000001");
  const B = await mk("Praveen", "9100000002");
  const K = await mk("Karthik", "9100000003", { attendanceMode: "CRM_LOGIN" });
  check("staff created", [A, B, K].every((u) => u?._id));

  // ================================================== LOGIN GATE + ACTIVITY LOG
  section("Office-Wi-Fi login gate & login activity");
  r = await login("Yokesh", HOME_IP);
  const tokA = tokenOf(r);
  check("before any agent has reported, the office network is unknown => login allowed", r.status === 200 && Boolean(tokA), r);
  let log = await LoginLog.findOne({ userName: "Yokesh" }).sort({ at: -1 });
  check("...and the attempt is logged as UNVERIFIED", log?.network === "UNVERIFIED" && log.result === "ALLOWED", log);

  const devA = await register(tokA, "DEV-A-LAPTOP-0001", "YOKESH-PC");
  await call("GET", "/api/agent/config?hostname=YOKESH-PC", { device: devA });
  r = await beat(devA);
  check("agent on the office Wi-Fi checks in", r.status === 200 && r.body.state === "CONNECTED", r.body);
  check("the office address was learned from the agent", (await OfficeIp.countDocuments({ branchId: branch._id, ip: OFFICE_IP })) === 1);

  r = await login("Yokesh", OFFICE_IP, CHROME_WIN);
  check("login from the office network is allowed", r.status === 200, r.body);
  log = await LoginLog.findOne({ userName: "Yokesh", kind: "LOGIN" }).sort({ at: -1 });
  check("login log: network OFFICE, browser and OS parsed", log.network === "OFFICE" && log.browser === "Chrome 141" && log.os === "Windows 10/11" && log.deviceType === "Desktop", log);
  check("login log: matched to the employee's registered PC by name", log.deviceName === "YOKESH-PC" && log.ip === OFFICE_IP, log);
  check("a CRM login does not create a second session", (await docOf(A)).sessions.length === 1);

  const tokB0 = tokenOf(await login("Praveen", OFFICE_IP));
  const devB = await register(tokB0, "DEV-B-LAPTOP-0002", "PRAVEEN-PC");
  await User.updateOne({ _id: B._id }, { $set: { isOnline: false } });

  r = await login("Praveen", MOBILE_IP, CHROME_ANDROID);
  check("login from MOBILE DATA is blocked (403, OFFICE_WIFI_REQUIRED)", r.status === 403 && r.body.code === "OFFICE_WIFI_REQUIRED", r);
  check("...with the clear office-Wi-Fi message", /office Wi-Fi/i.test(r.body.message || "") && /mobile data/i.test(r.body.message || ""), r.body.message);
  check("...and the person is NOT marked online", (await User.findById(B._id)).isOnline === false);
  log = await LoginLog.findOne({ userName: "Praveen", result: "BLOCKED" }).sort({ at: -1 });
  check("blocked attempt is logged with the phone's browser / device type", log?.network === "OUTSIDE" && log.deviceType === "Mobile" && log.os === "Android", log);
  r = await login("Praveen", HOME_IP);
  check("login from another Wi-Fi (home) is blocked too", r.status === 403, r.body);
  r = await call("POST", "/api/UserAccounts/Log-in", { body: { name: "Praveen", password: "wrong-pass" }, ip: MOBILE_IP });
  check("wrong password still answers 401 (network is not revealed first)", r.status === 401, r.body);
  r = await login("Karthik", MOBILE_IP);
  check("CRM-login staff are not restricted by the rule", r.status === 200, r.body);

  await OfficeIp.create({ branchId: branch._id, ip: "192.168.1.10" });
  r = await login("Praveen", "192.168.1.77");
  check("office LAN: another device on the same /24 is accepted", r.status === 200, r.body);
  r = await login("Praveen", "192.168.2.9");
  check("...a different subnet is not", r.status === 403, r.body);
  await OfficeIp.deleteOne({ ip: "192.168.1.10" });

  const wfh = await Leave.create({ userId: B._id, userName: "Praveen", type: "Work From Home", fromDate: today, toDate: today, status: "Approved", days: 1 });
  r = await login("Praveen", MOBILE_IP);
  check("approved work-from-home today: login allowed from anywhere", r.status === 200, r.body);
  await Leave.deleteOne({ _id: wfh._id });
  r = await login("Praveen", MOBILE_IP);
  check("...and blocked again once the WFH is gone", r.status === 403);

  await call("PUT", "/api/settings", { token: admin, body: { requireOfficeWifiLogin: false } });
  r = await login("Praveen", MOBILE_IP);
  check("admin can switch the rule off", r.status === 200, r.body);
  await call("PUT", "/api/settings", { token: admin, body: { requireOfficeWifiLogin: true } });
  r = await call("PUT", "/api/settings", { token: admin, body: { extraOfficeIps: ["not an ip!"] } });
  check("invalid extra office address rejected", r.status === 400, r.body);
  r = await call("PUT", "/api/settings", { token: admin, body: { extraOfficeIps: [MOBILE_IP] } });
  r = await login("Praveen", MOBILE_IP);
  check("an admin-listed office address is accepted", r.status === 200, r.body);
  await call("PUT", "/api/settings", { token: admin, body: { extraOfficeIps: [] } });

  r = await call("GET", "/api/attendance/admin/logins?result=BLOCKED", { token: admin });
  check("admin can list blocked logins", r.status === 200 && r.body.logins.length >= 3 && r.body.logins.every((l) => l.result === "BLOCKED"), r.body.logins?.length);
  r = await call("GET", "/api/attendance/admin/logins?q=prav", { token: admin });
  check("admin can search logins by name", r.body.logins.length > 0 && r.body.logins.every((l) => /praveen/i.test(l.userName)));
  r = await call("GET", `/api/attendance/admin/logins?userId=${A._id}&date=${today}`, { token: admin });
  check("admin can filter by employee and date", r.body.logins.length >= 2 && r.body.logins.every((l) => String(l.userId) === String(A._id)));
  r = await call("GET", "/api/attendance/admin/logins?role=admin", { token: admin });
  check("admin logins are recorded too", r.body.logins.length >= 1 && r.body.logins[0].role === "admin");
  r = await call("GET", "/api/attendance/admin/logins?q=%28%5B", { token: admin });
  check("special characters in the name search do not break it", r.status === 200, r.body);
  r = await call("GET", "/api/attendance/my/logins", { token: tokA });
  check("employee sees only their own sign-ins", r.status === 200 && r.body.logins.length >= 2 && r.body.logins.every((l) => l.userName === "Yokesh"));
  r = await call("GET", "/api/attendance/admin/logins", { token: tokA });
  check("employee cannot use the admin login list", r.status === 403, r.status);
  r = await call("GET", `/api/attendance/admin/detail?userId=${A._id}&date=${today}`, { token: admin });
  check("day detail shows that day's sign-ins with the device", Array.isArray(r.body.logins) && r.body.logins.some((l) => l.deviceName === "YOKESH-PC"), r.body.logins);

  // ================================================== LOGOUT
  section("CRM logout stops the timer");
  await beat(devA);
  r = await call("POST", "/api/UserAccounts/logout", { token: tokA, ip: OFFICE_IP, ua: CHROME_WIN });
  check("logout succeeds", r.status === 200, r.body);
  let d = await docOf(A);
  let s = d.sessions[d.sessions.length - 1];
  check("session closed with reason CRM_LOGOUT (PC confirmed on office Wi-Fi)", s.checkOut && s.endReason === "CRM_LOGOUT", s);
  check("Wi-Fi state is ENDED and the day is marked signed out", d.wifi.state === "ENDED" && d.crm.logoutAt && d.crm.logoutVerified === true);
  log = await LoginLog.findOne({ userName: "Yokesh", kind: "LOGOUT" }).sort({ at: -1 });
  check("logout is logged as verified", log?.verified === true && log.deviceName === "YOKESH-PC", log);

  r = await call("GET", `/api/attendance/admin/board?date=${today}`, { token: admin });
  let row = r.body.rows.find((x) => x.name === "Yokesh");
  check("live board says LOGGED_OUT, not In office", row?.display === "LOGGED_OUT" && row.signedOut === true, row?.display);
  check("board counts him as logged out and NOT in office", r.body.summary.loggedOut === 1 && !r.body.rows.some((x) => x.name === "Yokesh" && ["PRESENT", "WARNING"].includes(x.display)), r.body.summary);

  const before = (await docOf(A)).sessions.length;
  r = await beat(devA);
  check("the PC is STILL on the office Wi-Fi, but the timer stays stopped", r.body.signedOut === true && r.body.state === "ENDED", r.body);
  await beat(devA);
  d = await docOf(A);
  check("...no session was reopened by the agent", d.sessions.length === before && d.wifi.state === "ENDED");
  r = await call("GET", "/api/attendance/my/live", { token: tokA });
  check("employee's own page also shows signed out", r.body.live.signedOut === true && r.body.display === "LOGGED_OUT", { display: r.body.display });

  const total0 = (await docOf(A)).totalMinutes;
  r = await login("Yokesh", OFFICE_IP, CHROME_WIN);
  d = await docOf(A);
  check("signing in again restarts the timer straight away (agent is fresh)", d.sessions.length === before + 1 && d.wifi.state === "CONNECTED" && !core_isSignedOut(d), { sessions: d.sessions.length, state: d.wifi.state });
  check("earlier worked time was kept", d.totalMinutes >= total0);

  // logout when the PC is NOT confirmed
  const tokB = tokenOf(await login("Praveen", OFFICE_IP));
  await beat(devB);
  const staleAt = new Date(Date.now() - 10 * 60 * 1000);
  await Attendance.updateOne({ userId: B._id, date: today }, { $set: { "wifi.lastHeartbeatAt": staleAt } });
  const lastPresent = (await docOf(B)).sessions[0].lastPresentAt;
  r = await call("POST", "/api/UserAccounts/logout", { token: tokB, ip: OFFICE_IP });
  d = await docOf(B);
  s = d.sessions[0];
  check("PC not confirmed (silent agent): timer stops at the LAST CONFIRMED office time", s.endReason === "CRM_LOGOUT_UNVERIFIED" && new Date(s.checkOut).getTime() === new Date(lastPresent).getTime(), { reason: s.endReason, out: s.checkOut, lastPresent });
  log = await LoginLog.findOne({ userName: "Praveen", kind: "LOGOUT" }).sort({ at: -1 });
  check("...logged as NOT verified", log?.verified === false, log);

  const Dv = await mk("Divya", "9100000004");
  const tokD = tokenOf(await login("Divya", OFFICE_IP));
  const devD = await register(tokD, "DEV-D-LAPTOP-0004", "DIVYA-PC");
  await beat(devD);
  r = await call("POST", "/api/UserAccounts/logout", { token: tokD, ip: MOBILE_IP, ua: CHROME_ANDROID });
  d = await docOf(Dv);
  check("logging out from mobile data (even with a fresh PC) is not treated as verified", d.sessions[0].endReason === "CRM_LOGOUT_UNVERIFIED", d.sessions[0].endReason);
  log = await LoginLog.findOne({ userName: "Divya", kind: "LOGOUT" }).sort({ at: -1 });
  check("...and the logout log shows it came from OUTSIDE on a mobile", log.network === "OUTSIDE" && log.deviceType === "Mobile", log);

  const Rv = await mk("Ravi", "9100000005");
  const tokR = tokenOf(await login("Ravi", OFFICE_IP));
  const devR = await register(tokR, "DEV-R-LAPTOP-0005", "RAVI-PC");
  r = await call("POST", "/api/UserAccounts/logout", { token: tokR, ip: OFFICE_IP });
  check("logout before any check-in works", r.status === 200, r.body);
  r = await beat(devR);
  d = await docOf(Rv);
  check("...and the agent then cannot check him in automatically", r.body.signedOut === true && d.sessions.length === 0, r.body);
  await login("Ravi", OFFICE_IP);
  d = await docOf(Rv);
  check("...until he signs in again", d.sessions.length === 1 && d.wifi.state === "CONNECTED");

  r = await call("POST", "/api/UserAccounts/logout", { token: tokenOf(await login("Karthik", OFFICE_IP)) });
  check("CRM-login staff can still log out normally", r.status === 200, r.body);

  // ================================================== SHIFT-END QUESTION
  if (!canDoShiftEnd) {
    console.log("\n(skipping shift-end section: needs the clock to be after 01:05 IST)");
  } else {
    section("Shift-end question: Are you still working?");
    const workUntilShiftEnd = async (dev) => {
      const events = [];
      for (let m = 100 * 60; m >= 3 * 60; m -= 90) events.push({ kind: "HEARTBEAT", ...OFFICE5, occurredAt: new Date(Date.now() - m * 1000).toISOString() });
      const b = await call("POST", "/api/agent/batch", { device: dev, ip: OFFICE_IP, body: { events } });
      return b;
    };
    const staffEnded = async (name, mobile) => {
      const u = await mk(name, mobile, { shiftStart: wkStart, shiftEnd: wkEnd });
      const tok = tokenOf(await login(name, OFFICE_IP));
      const dev = await register(tok, `DEV-${name.toUpperCase()}-0001`, `${name.toUpperCase()}-PC`);
      const b = await workUntilShiftEnd(dev);
      const live = await beat(dev);
      return { u, tok, dev, b, live };
    };

    // ---- YES (answered on the Windows pop-up through the agent)
    const M = await staffEnded("Meena", "9100000010");
    check("history replayed", M.b.status === 200 && M.b.body.processed > 30, M.b.body);
    check("first live reading after shift end raises the question", M.live.body.overtimeState === "ASKING" && M.live.body.prompt?.askId === 1, M.live.body);
    check("...with a ~10 minute window", M.live.body.prompt.secondsLeft > 540 && M.live.body.prompt.secondsLeft <= 600, M.live.body.prompt);
    r = await call("GET", "/api/attendance/my/live", { token: M.tok });
    check("the web page sees the same question", r.body.live.prompt?.askId === 1 && r.body.live.overtimeState === "ASKING", r.body.live.prompt);
    check("employee was notified", Boolean(await Notification.findOne({ recipientId: M.u._id, type: "OVERTIME_ASK" })));
    r = await call("POST", "/api/agent/overtime", { device: M.dev, body: { answer: "maybe" } });
    check("a bad answer is rejected", r.status === 400, r.body);
    r = await call("POST", "/api/agent/overtime", { device: M.dev, body: { answer: "YES" } });
    check("YES from the Windows pop-up is accepted", r.status === 200 && r.body.ok === true && r.body.state === "CONFIRMED", r.body);
    r = await beat(M.dev);
    d = await docOf(M.u);
    check("session continues as overtime, no question pending", r.body.state === "CONNECTED" && r.body.prompt === null && d.overtime.state === "CONFIRMED" && d.sessions.length === 1, r.body);
    check("overtime minutes are recorded separately", d.overtimeMinutes >= 1 && d.offDayMinutes === 0, { ot: d.overtimeMinutes });
    r = await call("POST", "/api/agent/overtime", { device: M.dev, body: { answer: "YES" } });
    check("answering twice does nothing (not asking any more)", r.body.ok === false, r.body);

    // ---- NO (answered on the web page)
    const Ro = await staffEnded("Rohit", "9100000011");
    r = await call("POST", "/api/attendance/my/overtime", { token: Ro.tok, body: { answer: "NO" } });
    d = await docOf(Ro.u);
    s = d.sessions[0];
    check("NO on the web page finishes the day", r.status === 200 && s.endReason === "OVERTIME_DECLINED" && d.overtime.state === "DECLINED", r.body);
    check("...the session ends at the shift END, no overtime credited", minutesOfDay(s.checkOut) === timeToMinutes(wkEnd, 0) && d.overtimeMinutes === 0, { out: minutesOfDay(s.checkOut) });
    r = await beat(Ro.dev);
    d = await docOf(Ro.u);
    check("the PC still on Wi-Fi does NOT restart it", d.sessions.length === 1 && d.wifi.state === "ENDED", r.body);
    r = await call("POST", "/api/attendance/my/overtime", { token: Ro.tok, body: { answer: "YES" } });
    check("a second answer is refused (409)", r.status === 409, r.body);
    await login("Rohit", OFFICE_IP);
    d = await docOf(Ro.u);
    check("signing in again after shift end is asked again straight away", d.sessions.length === 2 && d.overtime.state === "ASKING", { s: d.sessions.length, o: d.overtime.state });

    // ---- no reply, PC still on -> half day pending explanation
    const noReply = async (name, mobile) => {
      const x = await staffEnded(name, mobile);
      await Attendance.updateOne({ userId: x.u._id, date: today }, { $set: { "overtime.deadline": new Date(Date.now() - 60 * 1000) } });
      await beat(x.dev); // the PC is still online and present
      await engine.runMonitorTick(new Date());
      return x;
    };
    const S = await noReply("Suresh", "9100000012");
    d = await docOf(S.u);
    s = d.sessions[0];
    check("no reply: session ends at shift end (reason NO_RESPONSE)", s.endReason === "NO_RESPONSE" && d.overtime.state === "NO_RESPONSE" && minutesOfDay(s.checkOut) === timeToMinutes(wkEnd, 0), { r: s.endReason });
    check("...the day is held as a HALF DAY pending explanation", d.review.state === "PENDING_EXPLANATION" && d.status === "Half Day", { r: d.review.state, st: d.status });
    check("employee and admin were both notified", Boolean(await Notification.findOne({ recipientId: S.u._id, type: "NO_RESPONSE" })) && Boolean(await Notification.findOne({ recipientType: "admin", type: "NO_RESPONSE" })));
    r = await beat(S.dev);
    check("a late reading does not reopen it", (await docOf(S.u)).sessions.length === 1, r.body);
    r = await call("POST", "/api/attendance/my/overtime", { token: S.tok, body: { answer: "YES" } });
    check("answering after the window is refused", r.status === 409, r.body);

    r = await call("GET", `/api/attendance/admin/board?date=${today}`, { token: admin });
    row = r.body.rows.find((x) => x.name === "Suresh");
    check("live board: half day + needs review", row.reviewState === "PENDING_EXPLANATION" && r.body.summary.needsReview >= 1, { row: row.reviewState, s: r.body.summary.needsReview });
    r = await call("GET", "/api/attendance/admin/reviews", { token: admin });
    check("admin sees the day waiting for an explanation", r.body.reviews.some((x) => x.userName === "Suresh" && x.review.state === "PENDING_EXPLANATION"));

    r = await call("POST", "/api/attendance/my/explain", { token: S.tok, body: { date: today, text: "no" } });
    check("a one-word explanation is rejected", r.status === 400, r.body);
    r = await call("POST", "/api/attendance/my/explain", { token: S.tok, body: { date: today, text: "I was in a client call at the desk and missed the pop-up." } });
    check("a proper explanation is accepted", r.status === 200 && r.body.review.state === "EXPLAINED", r.body);
    check("admin was told", Boolean(await Notification.findOne({ recipientType: "admin", type: "REVIEW_EXPLAINED" })));
    r = await call("POST", "/api/attendance/my/explain", { token: S.tok, body: { date: today, text: "Trying to explain the same day twice." } });
    check("...only once", r.status === 409, r.body);
    r = await call("GET", "/api/attendance/my/reviews", { token: S.tok });
    check("employee sees the day that needs an explanation / its state", r.status === 200 && r.body.reviews.some((x) => x.date === today && x.review.state === "EXPLAINED" && /client call/.test(x.review.explanation)), r.body);
    r = await call("GET", "/api/attendance/my/reviews", { token: M.tok });
    check("...and an employee with none sees an empty list", r.status === 200 && r.body.reviews.length === 0, r.body);
    r = await call("PATCH", "/api/attendance/admin/review", { token: S.tok, body: { userId: S.u._id, date: today, decision: "APPROVE" } });
    check("an employee cannot approve their own day", r.status === 403, r.status);
    r = await call("PATCH", "/api/attendance/admin/review", { token: admin, body: { userId: S.u._id, date: today, decision: "MAYBE" } });
    check("bad decision rejected", r.status === 400, r.body);
    r = await call("PATCH", "/api/attendance/admin/review", { token: admin, body: { userId: S.u._id, date: today, decision: "APPROVE", note: "Client call confirmed" } });
    d = await docOf(S.u);
    check("admin approves: the half day becomes a full day (Present)", r.status === 200 && d.review.state === "APPROVED" && d.status === "Completed", { st: d.status, rv: d.review.state });
    check("...with an audit entry and a notice to the employee", d.edits.some((e) => /Approved/.test(e.note)) && Boolean(await Notification.findOne({ recipientId: S.u._id, type: "REVIEW_DECIDED" })));
    r = await call("PATCH", "/api/attendance/admin/review", { token: admin, body: { userId: S.u._id, date: today, decision: "REJECT" } });
    check("deciding twice is refused", r.status === 409, r.body);
    r = await call("GET", "/api/attendance/admin/reviews", { token: admin });
    check("decided days leave the open list", !r.body.reviews.some((x) => x.userName === "Suresh"));

    const Ku = await noReply("Kumar", "9100000013");
    r = await call("PATCH", "/api/attendance/admin/review", { token: admin, body: { userId: Ku.u._id, date: today, decision: "REJECT", note: "No valid reason" } });
    d = await docOf(Ku.u);
    check("admin rejects: it stays a half day", r.status === 200 && d.review.state === "REJECTED" && d.status === "Half Day", { st: d.status });

    // ---- the silent PC is not punished
    const Sl = await staffEnded("Sunil", "9100000014");
    await Attendance.updateOne({ userId: Sl.u._id, date: today }, { $set: { "overtime.deadline": new Date(Date.now() - 60 * 1000), "wifi.lastHeartbeatAt": new Date(Date.now() - 20 * 60 * 1000) } });
    await engine.runMonitorTick(new Date());
    d = await docOf(Sl.u);
    check("laptop went silent at shift end: ordinary offline rules, NO penalty", d.review.state === "NONE" && d.overtime.state !== "NO_RESPONSE", { rv: d.review.state, ot: d.overtime.state });

    // ================================================== SUNDAY / DAY OFF
    section("Sunday / day off");
    await call("PUT", "/api/settings", { token: admin, body: { weeklyOffDays: [weekday(today)] } });
    const V = await staffEnded("Vimal", "9100000015");
    d = await docOf(V.u);
    check("work on the day off goes to its own bucket", d.dayType === "WEEKLY_OFF" && d.offDayMinutes >= 50 && d.overtimeMinutes === 0, { t: d.dayType, m: d.offDayMinutes });
    check("...never counted as late", d.lateMinutes === 0);
    check("...and still asked at shift end", V.live.body.overtimeState === "ASKING");
    await Attendance.updateOne({ userId: V.u._id, date: today }, { $set: { "overtime.deadline": new Date(Date.now() - 60 * 1000) } });
    await beat(V.dev);
    await engine.runMonitorTick(new Date());
    d = await docOf(V.u);
    check("no reply on a day off is NOT penalised", d.overtime.state === "NO_RESPONSE" && d.review.state === "NONE" && d.status === "Completed", { rv: d.review.state, st: d.status });
    check("no half-day notice to the admin for a day-off", !(await Notification.findOne({ recipientType: "admin", type: "NO_RESPONSE", message: /Vimal/ })));
    check("no half-day notice title either", !(await Notification.findOne({ title: /Vimal did not answer/ })));

    r = await call("GET", `/api/attendance/admin/board?date=${today}`, { token: admin });
    row = r.body.rows.find((x) => x.name === "Vimal");
    check("board row shows day-off work", row.dayType === "WEEKLY_OFF" && row.offDayMinutes >= 50, row);
    check("board summary counts day-off work", r.body.summary.offDayWork >= 1, r.body.summary);

    r = await call("GET", `/api/attendance/admin/extra?from=${today}&to=${today}`, { token: admin });
    const vim = r.body.rows?.find((x) => x.name === "Vimal");
    const mee = r.body.rows?.find((x) => x.name === "Meena");
    check("overtime & Sunday report: day-off work in its own column", vim && vim.offDayDays === 1 && vim.offDayMinutes >= 50 && vim.overtimeMinutes === 0, vim);
    check("...day kind is labelled", ["SUNDAY", "WEEKLY_OFF"].includes(vim?.days?.[0]?.kind), vim?.days);
    check("...overtime kept apart from it", mee && mee.overtimeDays === 1 && mee.overtimeMinutes >= 1 && mee.offDayMinutes === 0, mee);
    check("...summary totals", r.body.summary.people >= 2 && r.body.summary.offDayMinutes >= 50 && r.body.summary.overtimeMinutes >= 1, r.body.summary);
    r = await call("GET", "/api/attendance/admin/extra?from=bad", { token: admin });
    check("bad date rejected", r.status === 400);
    r = await call("GET", `/api/attendance/admin/extra?from=${today}&to=${today}`, { token: tokA });
    check("employees cannot open the overtime report", r.status === 403);

    r = await call("GET", `/api/attendance/admin/report?month=${today.slice(0, 7)}`, { token: admin });
    const mv = r.body.rows.find((x) => x.name === "Vimal");
    const mm = r.body.rows.find((x) => x.name === "Meena");
    check("monthly report: day-off work is NOT a present working day", mv.present === 0 && mv.workingDays === mv.absent && mv.offDayDays === 1 && mv.offDayMinutes >= 50, mv);
    check("monthly report: overtime days counted separately", mm.overtimeDays === 1 && mm.overtimeMinutes >= 1, mm);
    await call("PUT", "/api/settings", { token: admin, body: { weeklyOffDays: [] } });

    // ---- daily report reminder (their shift is over and nothing submitted)
    section("Daily Report reminders");
    await monitor.reportReminders(new Date());
    check("someone who worked but has not reported is reminded", Boolean(await Notification.findOne({ recipientId: M.u._id, type: "DAILY_REPORT_REMINDER" })));
    const n1 = await Notification.countDocuments({ recipientId: M.u._id, type: "DAILY_REPORT_REMINDER" });
    await monitor.reportReminders(new Date());
    check("...only once a day", (await Notification.countDocuments({ recipientId: M.u._id, type: "DAILY_REPORT_REMINDER" })) === n1);
    check("nobody is reminded before their shift is over", !(await Notification.findOne({ recipientId: A._id, type: "DAILY_REPORT_REMINDER" })));
  }

  // ================================================== LOGIN CHECK MESSAGES
  section("Each login problem reports its own reason");
  r = await call("GET", "/api/reports?status=SUBMITTED", { token: admin });
  check("a valid admin login works", r.status === 200, r);
  r = await call("GET", "/api/reports");
  check("no login at all: 401 'Please log in.'", r.status === 401 && r.body.message === "Please log in.", r.body);
  r = await call("GET", "/api/reports", { token: "null" });
  check("the browser sent 'null' (nothing saved): 401 'not logged in on this browser'", r.status === 401 && /not logged in on this browser/.test(r.body.message), r.body);
  r = await call("GET", "/api/reports", { token: "abc.def.ghi" });
  check("a wrong / old token: 401 'Session expired'", r.status === 401 && /Session expired/.test(r.body.message), r.body);
  r = await call("GET", "/api/reports", { token: jwt.sign({ id: "not-an-id", role: "admin" }, ADMIN_SECRET) });
  check("a token with a broken id: 401 'Invalid token'", r.status === 401 && /Invalid token/.test(r.body.message), r.body);
  const realFind = AdminAccount.findById;
  AdminAccount.findById = () => { throw new Error("connection to MongoDB lost"); };
  r = await call("GET", "/api/reports", { token: admin });
  AdminAccount.findById = realFind;
  check("database not answering: 503, and NOT 'Session expired'", r.status === 503 && /not responding/.test(r.body.message) && !/Session expired/.test(r.body.message), r.body);
  r = await call("GET", "/api/reports", { token: admin });
  check("...and it works again as soon as the database is back", r.status === 200, r);

  // ================================================== DAILY REPORT
  section("Daily Report (DHR)");
  const good = [
    { from: "09:30", to: "11:00", project: "CRM", category: "Development", task: "Built the login activity screen", status: "Completed" },
    { from: "11:15", to: "13:00", project: "CRM", category: "Testing", task: "Tested the office Wi-Fi login rule", status: "In Progress" },
    { from: "", to: "", task: "" }, // blank draft row is ignored
  ];
  const tokA2 = tokenOf(await login("Yokesh", OFFICE_IP));
  const tokB2 = tokenOf(await login("Praveen", OFFICE_IP));

  r = await call("GET", `/api/reports/my?date=${today}`, { token: tokA2 });
  check("no report yet: editable blank", r.status === 200 && r.body.report === null && r.body.editable === true, r.body);
  r = await call("PUT", "/api/reports/my", { token: tokA2, body: { date: today, entries: [{ from: "10:00", to: "09:00", task: "backwards" }] } });
  check("an entry whose end is before its start is rejected", r.status === 400, r.body);
  r = await call("PUT", "/api/reports/my", { token: tokA2, body: { date: today, entries: [{ from: "9am", to: "10", task: "x" }] } });
  check("times must be HH:MM", r.status === 400, r.body);
  r = await call("PUT", "/api/reports/my", { token: tokA2, body: { date: addDays(today, 1), entries: [] } });
  check("future date rejected", r.status === 400, r.body);
  r = await call("PUT", "/api/reports/my", { token: tokA2, body: { date: addDays(today, -40), entries: [] } });
  check("very old date rejected", r.status === 400, r.body);
  r = await call("PUT", "/api/reports/my", { token: tokA2, body: { date: today, entries: good, summary: { achievements: "Finished the login activity screen", blockers: "", tomorrowPlan: "Start the reports screen" } } });
  check("draft saved; blank row ignored; minutes computed", r.status === 200 && r.body.report.status === "DRAFT" && r.body.report.entries.length === 2 && r.body.report.reportedMinutes === 90 + 105, r.body.report);
  r = await call("POST", "/api/reports/my/submit", { token: tokB2, body: { date: today, entries: [] } });
  check("cannot submit an empty report", r.status === 400, r.body);
  r = await call("POST", "/api/reports/my/submit", { token: tokB2, body: { date: today, entries: [{ from: "09:00", to: "10:00", task: "Fixed bugs" }], summary: { achievements: "" } } });
  check("a summary of the day is required", r.status === 400, r.body);
  r = await call("POST", "/api/reports/my/submit", { token: tokA2, body: { date: today } });
  check("draft can be submitted as saved", r.status === 200 && r.body.report.status === "SUBMITTED" && r.body.report.submittedAt, r.body);
  check("attendance minutes were attached", r.body.report.attendanceMinutes >= 0);
  check("admin was notified (report category)", Boolean(await Notification.findOne({ recipientType: "admin", type: "DAILY_REPORT_SUBMITTED" })));
  r = await call("PUT", "/api/reports/my", { token: tokA2, body: { date: today, entries: good } });
  check("a submitted report is locked (409)", r.status === 409, r.body);
  r = await call("POST", "/api/reports/my/submit", { token: tokB2, body: { date: today, entries: [{ from: "09:00", to: "12:30", project: "Website", category: "Support", task: "Fixed bugs reported by the office", status: "Completed" }], summary: { achievements: "Closed all reported bugs today" } } });
  check("second employee submits", r.status === 200, r.body);

  r = await call("GET", `/api/reports?from=${today}&to=${today}`, { token: admin });
  check("admin sees every employee's report", r.status === 200 && r.body.reports.length === 2, r.body.reports?.length);
  r = await call("GET", `/api/reports?q=prav&from=${today}&to=${today}`, { token: admin });
  check("admin can filter by name", r.body.reports.length === 1 && r.body.reports[0].userName === "Praveen");
  r = await call("GET", `/api/reports?userId=${A._id}`, { token: admin });
  check("admin can filter by employee", r.body.reports.length === 1 && String(r.body.reports[0].userId) === String(A._id));
  r = await call("GET", `/api/reports?from=${addDays(today, -5)}&to=${addDays(today, -1)}`, { token: admin });
  check("admin can filter by date range (nothing on other days)", r.body.reports.length === 0);
  r = await call("GET", "/api/reports?status=DRAFT", { token: admin });
  check("admin can filter by status", r.body.reports.length === 0);
  r = await call("GET", "/api/reports?q=%28%5B", { token: admin });
  check("special characters in name search are safe", r.status === 200);
  const rid = (await call("GET", `/api/reports?userId=${A._id}`, { token: admin })).body.reports[0]._id;
  r = await call("GET", `/api/reports/${rid}`, { token: admin });
  check("admin can open one report in full", r.status === 200 && r.body.report.entries.length === 2 && r.body.report.summary.tomorrowPlan === "Start the reports screen", r.body);
  r = await call("GET", "/api/reports", { token: tokA2 });
  check("an employee cannot list everyone's reports", r.status === 403, r.status);
  r = await call("GET", "/api/reports/my/list", { token: tokB2 });
  check("employee's own history shows only theirs", r.body.reports.length === 1 && r.body.reports[0].userName === "Praveen");

  r = await call("GET", `/api/reports/summary?date=${today}`, { token: admin });
  check("who has NOT submitted (of those who worked)", r.status === 200 && r.body.submitted === 2 && Array.isArray(r.body.missing) && !r.body.missing.some((x) => ["Yokesh", "Praveen"].includes(x.name)) && r.body.missing.length >= 1, r.body);

  r = await call("PATCH", `/api/reports/${rid}/reopen`, { token: admin, body: { note: "Add the hours for the meeting" } });
  check("admin can reopen a submitted report", r.status === 200 && r.body.report.status === "DRAFT" && r.body.report.reopenedBy === "Boss", r.body);
  check("...employee is told", Boolean(await Notification.findOne({ recipientId: A._id, type: "DAILY_REPORT_REOPENED" })));
  r = await call("PATCH", `/api/reports/${rid}/reopen`, { token: admin });
  check("only a submitted report can be reopened", r.status === 409, r.body);
  r = await call("POST", "/api/reports/my/submit", { token: tokA2, body: { date: today, entries: [...good.slice(0, 2), { from: "14:00", to: "15:00", project: "CRM", category: "Meeting", task: "Weekly review meeting", status: "Completed" }] } });
  check("employee corrects and submits again", r.status === 200 && r.body.report.entries.length === 3 && r.body.report.reportedMinutes === 90 + 105 + 60, r.body.report);

  sockClose();
  server.close();
  await mongoose.disconnect();

  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("FAILED:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
}

// tiny local copies so this file has no extra imports
function core_isSignedOut(att) {
  const c = att.crm;
  return Boolean(c && c.logoutAt && (!c.loginAt || new Date(c.logoutAt) >= new Date(c.loginAt)));
}
function sockClose() {
  /* no sockets used in this suite */
}

run().catch((err) => {
  console.error("\nTEST CRASHED:", err);
  process.exit(2);
});
