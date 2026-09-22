// =====================================================
// AGENT END-TO-END TEST      node test/agent.test.js
//
// Runs the REAL agent (separate process, fake Wi-Fi file) against the REAL
// backend (in-process) and the test database. Takes ~2 minutes because it
// includes a genuine 65-second server outage.
//
// WIPES the database it connects to; refuses unless the name contains "test".
// Needs ../crm-backend next to this folder.
// =====================================================
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");

const BACKEND = path.join(__dirname, "..", "..", "crm-backend");
const AGENT_DIR = path.join(__dirname, "..");
require(path.join(BACKEND, "node_modules", "dotenv")).config({ path: path.join(BACKEND, ".env"), quiet: true });
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const app = require(path.join(BACKEND, "app"));
const socket = require(path.join(BACKEND, "src/Services/socket"));
const engine = require(path.join(BACKEND, "src/Services/attendanceEngine"));
const Attendance = require(path.join(BACKEND, "src/Models/Attendance.Model"));
const AttendanceEvent = require(path.join(BACKEND, "src/Models/AttendanceEvent.Model"));
const { dateKey, minutesOfDay } = require(path.join(BACKEND, "src/Utils/time"));

const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0;
const failures = [];
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log("  ✓", name); }
  else { failures.push(name); console.log("  ✗", name, extra !== undefined ? `\n      got: ${JSON.stringify(extra)}` : ""); }
};
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch (_) { /* keep waiting */ }
    await sleep(400);
  }
  return null;
}
async function api(method, p, { token, body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "agent-e2e-"));
const FAKE = path.join(DATA, "fake-wifi.json");
const setWifi = (o) => fs.writeFileSync(FAKE, JSON.stringify(o));
const OFFICE = { connected: true, ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70" };
const HOTSPOT = { connected: true, ssid: "Phone Hotspot", bssid: "02:AA:BB:CC:DD:EE" };
const env = (extra = {}) => ({
  ...process.env,
  ATTENDANCE_SERVER_URL: BASE,
  ATTENDANCE_DATA_DIR: DATA,
  ATTENDANCE_FAKE_WIFI_FILE: FAKE,
  ATTENDANCE_NO_TOAST: "1",
  AGENT_INTERVAL_SECONDS: "1",
  AGENT_CRM_USER: "Yokesh",
  AGENT_CRM_PASSWORD: "secret123",
  ...extra,
});
// Runs `node index.js <args>` without blocking this process (the backend runs in it).
function runCli(args, envExtra = {}, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["index.js", ...args], { cwd: AGENT_DIR, env: env(envExtra) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("exit", (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
  });
}
let agent = null;
let agentOut = "";
const startAgent = () => {
  agentOut = "";
  agent = spawn(process.execPath, ["index.js"], { cwd: AGENT_DIR, env: env() });
  agent.stdout.on("data", (d) => (agentOut += d));
  agent.stderr.on("data", (d) => (agentOut += d));
  return agent;
};
const stopAgent = (sig = "SIGTERM") =>
  new Promise((res) => {
    if (!agent || agent.exitCode !== null) return res();
    agent.on("exit", () => res());
    agent.kill(sig);
    setTimeout(res, 8000);
  });
const queueLines = () => {
  try { return fs.readFileSync(path.join(DATA, "queue.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
  catch (_) { return []; }
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  if (!/test/i.test(mongoose.connection.name)) throw new Error("Refusing to wipe a non-test database");
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  const server = http.createServer(app);
  socket.init(server);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  // ---------- arrange
  await api("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  const admin = (await api("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" } })).body;
  const adminTok = admin.accessToken || admin.token;
  const branch = (await api("POST", "/api/branches", { token: adminTok, body: { name: "Pollachi", heartbeatInterval: 15, gracePeriod: 30 } })).body.branch;
  await api("POST", `/api/branches/${branch._id}/networks`, { token: adminTok, body: { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70", band: "5 GHz" } });
  const nowMin = minutesOfDay(new Date());
  const sh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const user = (await api("POST", "/api/staff", { token: adminTok, body: { name: "Yokesh", mobile: "9000000001", password: "secret123", role: "Dev", shiftStart: sh(Math.max(0, nowMin - 60)), shiftEnd: "23:59", branchId: branch._id } })).body.user;
  setWifi(OFFICE);
  const doc = () => Attendance.findOne({ userId: user._id, date: dateKey() });

  // ---------- setup
  section("Setup / pairing");
  let r = await runCli(["--setup"], { AGENT_CRM_PASSWORD: "wrong-password" });
  check("setup with a wrong password fails cleanly (exit 1, clear message)", r.status === 1 && /invalid|incorrect|password/i.test(r.stderr + r.stdout), [r.status, r.stderr, r.stdout]);
  check("...and stores nothing", !fs.existsSync(path.join(DATA, "device.json")));
  r = await runCli(["--setup"]);
  check("setup succeeds and reports ACTIVE", r.status === 0 && /ACTIVE/.test(r.stdout), [r.status, r.stdout, r.stderr]);
  const dev = JSON.parse(fs.readFileSync(path.join(DATA, "device.json"), "utf8"));
  check("device token stored (64 hex), deviceId generated", /^[0-9a-f]{64}$/.test(dev.deviceToken) && /^DEV-/.test(dev.deviceId), dev);
  const leaked = fs.readdirSync(DATA).some((f) => fs.statSync(path.join(DATA, f)).isFile() && fs.readFileSync(path.join(DATA, f), "utf8").includes("secret123"));
  check("the CRM password is NOT written anywhere on disk", !leaked);
  r = await runCli(["--wifi"]);
  check("--wifi shows the SSID + BSSID for admins", /PROFENAA-5G/.test(r.stdout) && /8C:C7:C3:09:1D:70/.test(r.stdout), r.stdout);

  // ---------- normal operation
  section("Running agent");
  startAgent();
  let d = await waitFor(async () => { const x = await doc(); return x && x.wifi.state === "CONNECTED" && x; }, 15000);
  check("agent checks the employee in on office Wi-Fi", Boolean(d), agentOut.slice(-400));
  check("exactly one session", d?.sessions.length === 1);
  const hb1 = d && d.wifi.lastHeartbeatAt;
  await sleep(3500);
  d = await doc();
  check("heartbeats keep flowing", new Date(d.wifi.lastHeartbeatAt) > new Date(hb1));
  check("no leftovers in the queue while online", queueLines().length <= 1, queueLines().length);

  section("Hotspot => warning => back");
  setWifi(HOTSPOT);
  d = await waitFor(async () => { const x = await doc(); return x.wifi.state === "WARNING" && x; }, 10000);
  check("switching to a hotspot puts the record in WARNING", Boolean(d) && d.wifi.warningReason === "WIFI_CHANGED", d?.wifi);
  setWifi(OFFICE);
  d = await waitFor(async () => { const x = await doc(); return x.wifi.state === "CONNECTED" && x; }, 10000);
  check("returning to office Wi-Fi restores CONNECTED in the same session", Boolean(d) && d.sessions.length === 1, d?.sessions?.length);

  // ---------- the big one: server down for 65 s, server closes the session, agent replays
  section("Server outage (65 s) - the case the MVP could not handle");
  const outageStart = Date.now();
  server.closeAllConnections();
  await new Promise((rr) => server.close(rr));
  await sleep(20000);
  const q1 = queueLines();
  check("agent keeps sensing while the server is down and saves readings to disk", q1.length >= 12, q1.length);
  check("saved readings carry their ORIGINAL timestamps (spread out, not 'now')",
    q1.length > 2 && Date.parse(q1[q1.length - 1].occurredAt) - Date.parse(q1[0].occurredAt) > 10000, [q1[0]?.occurredAt, q1.at(-1)?.occurredAt]);
  check("the agent process survived", agent.exitCode === null);
  await sleep(Math.max(0, 65000 - (Date.now() - outageStart)));
  await engine.runMonitorTick(new Date()); // the server was blind for >60 s: it closes the session
  d = await doc();
  check("(setup) the server, blind for 65 s, closed the session itself", Boolean(d.sessions[0].checkOut) && d.sessions[0].serverClosedAt, d.sessions[0]);
  await new Promise((rr) => server.listen(PORT, "127.0.0.1", rr));
  d = await waitFor(async () => { const x = await doc(); return x.sessions.length === 1 && !x.sessions[0].checkOut && queueLines().length <= 1 && x; }, 30000);
  check("agent delivered the queue and the session was RESTORED (still 1 session, still open)", Boolean(d), agentOut.slice(-500));
  const restored = await AttendanceEvent.countDocuments({ userId: user._id, type: "SESSION_RESTORED" });
  check("audit trail records SESSION_RESTORED", restored >= 1, restored);
  check("worked minutes cover the outage (no false gap)", d && d.totalMinutes >= 1, d?.totalMinutes);

  // ---------- shutdown & return
  section("Shutdown and return");
  await stopAgent("SIGTERM");
  d = await waitFor(async () => { const x = await doc(); return x.sessions[0].endReason === "SYSTEM_SHUTDOWN" && x; }, 8000);
  check("stopping the agent sends a clean SHUTDOWN and ends the session", Boolean(d), (await doc())?.sessions);
  check("lock file released", !fs.existsSync(path.join(DATA, "agent.lock")));
  startAgent();
  d = await waitFor(async () => { const x = await doc(); return x.sessions.length === 2 && x.wifi.state === "CONNECTED" && x; }, 15000);
  check("starting again the same day opens a second session", Boolean(d), agentOut.slice(-300));
  const second = await runCli([], {}, 8000);
  check("a second agent on the same PC refuses to start", second.status === 1 && /already running/i.test(second.stderr + second.stdout), [second.status, second.stderr]);
  await stopAgent();

  // ---------- server decisions surface to the agent
  section("Server rules reach the agent");
  await api("PUT", `/api/staff/${user._id}`, { token: adminTok, body: { attendanceMode: "CRM_LOGIN" } });
  startAgent();
  await sleep(5000);
  check("when the admin switches the employee to CRM-login, the agent explains it is idle", /set to CRM login/i.test(agentOut), agentOut.slice(-400));
  await stopAgent();

  section("Bad registration");
  const good = JSON.parse(fs.readFileSync(path.join(DATA, "device.json"), "utf8"));
  fs.writeFileSync(path.join(DATA, "device.json"), JSON.stringify({ ...good, deviceToken: "0".repeat(64) }));
  startAgent();
  await sleep(5000);
  check("an invalid device token makes the agent ask for setup instead of looping silently", /Run setup again|no longer valid/i.test(agentOut), agentOut.slice(-300));
  await stopAgent();
  fs.rmSync(path.join(DATA, "device.json"));
  const nosetup = await runCli([], {}, 8000);
  check("running before setup gives a clear instruction", nosetup.status === 1 && /--setup/.test(nosetup.stderr + nosetup.stdout), nosetup.stderr);

  server.close();
  await mongoose.disconnect();
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) console.log("FAILED:\n - " + failures.join("\n - "));
  process.exit(failures.length ? 1 : 0);
}

run().catch(async (e) => {
  console.error("\nTEST CRASHED:", e);
  await stopAgent().catch(() => {});
  process.exit(2);
});
