// =====================================================
// SHIFT-END QUESTION - AGENT END-TO-END TEST      node test/prompt.test.js
//
// Runs the REAL agent (separate process) against the REAL backend (in-process).
// The Windows dialog is replaced by ATTENDANCE_FAKE_PROMPT so it can run anywhere.
//   - the question reaches the agent and is shown ONCE (not on every heartbeat)
//   - no answer  -> nothing is sent, the server keeps waiting
//   - YES        -> the server records overtime
//   - NO         -> the server ends the session at shift end
//   - after an agent restart a question that is still open is asked again
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
const Attendance = require(path.join(BACKEND, "src/Models/Attendance.Model"));
const { dateKey, minutesOfDay } = require(path.join(BACKEND, "src/Utils/time"));

const PORT = 8124;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0;
const failures = [];
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log("  ✓", name); }
  else { failures.push(name); console.log("  ✗", name, extra !== undefined ? `\n      got: ${JSON.stringify(extra)}` : ""); }
};
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch (_) { /* keep waiting */ }
    await sleep(300);
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

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "agent-prompt-e2e-"));
const FAKE = path.join(DATA, "fake-wifi.json");
fs.writeFileSync(FAKE, JSON.stringify({ connected: true, ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70" }));
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
function runCli(args, extra = {}, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["index.js", ...args], { cwd: AGENT_DIR, env: env(extra) });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("exit", (status) => { clearTimeout(t); resolve({ status, out }); });
  });
}
let agent = null;
let agentOut = "";
const startAgent = (fakeAnswer) => {
  agentOut = "";
  agent = spawn(process.execPath, ["index.js"], { cwd: AGENT_DIR, env: env({ ATTENDANCE_FAKE_PROMPT: fakeAnswer }) });
  agent.stdout.on("data", (d) => (agentOut += d));
  agent.stderr.on("data", (d) => (agentOut += d));
};
const stopAgent = () =>
  new Promise((res) => {
    if (!agent || agent.exitCode !== null) return res();
    agent.on("exit", () => res());
    agent.kill("SIGTERM");
    setTimeout(res, 8000);
  });
const count = (re) => (agentOut.match(re) || []).length;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  if (!/test/i.test(mongoose.connection.name)) throw new Error("Refusing to wipe a non-test database");
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  const nowMin = minutesOfDay(new Date());
  if (nowMin < 65 || nowMin > 1436) {
    console.log("Skipping: this test needs the clock to be after 01:05 IST (the shift must already be over).");
    process.exit(0);
  }
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  const server = http.createServer(app);
  socket.init(server);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  await api("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  const adminTok = (await api("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" } })).body.token;
  await api("PUT", "/api/settings", { token: adminTok, body: { weeklyOffDays: [] } });
  const branch = (await api("POST", "/api/branches", { token: adminTok, body: { name: "Pollachi", heartbeatInterval: 15, gracePeriod: 30 } })).body.branch;
  await api("POST", `/api/branches/${branch._id}/networks`, { token: adminTok, body: { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70", band: "5 GHz" } });
  const user = (
    await api("POST", "/api/staff", {
      token: adminTok,
      body: { name: "Yokesh", mobile: "9000000001", password: "secret123", role: "Dev", shiftStart: hhmm(nowMin - 62), shiftEnd: hhmm(nowMin - 2), branchId: branch._id },
    })
  ).body.user;
  const doc = () => Attendance.findOne({ userId: user._id, date: dateKey() });

  section("Setup");
  const setup = await runCli(["--setup"]);
  check("agent paired with the server", setup.status === 0 && /ACTIVE/.test(setup.out), setup.out);

  section("No answer (dialog closed / nobody there)");
  startAgent("timeout");
  let d = await waitFor(async () => { const x = await doc(); return x && x.overtime?.state === "ASKING" && x; }, 20000);
  check("the shift is over, so the server asks the question", Boolean(d), agentOut.slice(-300));
  check("the agent showed it", Boolean(await waitFor(async () => count(/Shift-end question #1/g) >= 1, 8000)), agentOut.slice(-300));
  await sleep(4000); // several more heartbeats
  check("...only ONCE, not on every heartbeat", count(/Shift-end question #1/g) === 1, count(/Shift-end question #1/g));
  d = await doc();
  check("nothing was sent, the server still waits for the answer", d.overtime.state === "ASKING" && d.wifi.state === "CONNECTED", d.overtime.state);
  check("the deadline is about 10 minutes away", new Date(d.overtime.deadline).getTime() - Date.now() > 8 * 60 * 1000, d.overtime.deadline);
  await stopAgent();

  section("YES: still working");
  startAgent("yes");
  d = await waitFor(async () => { const x = await doc(); return x.overtime?.state === "CONFIRMED" && x; }, 20000);
  check("restart: the open question is asked again and YES is recorded as overtime", Boolean(d), agentOut.slice(-400));
  check("agent confirms it sent the answer", /Shift-end answer sent: YES/.test(agentOut), agentOut.slice(-300));
  check("the session keeps running", d?.wifi.state === "CONNECTED" && !d.sessions[d.sessions.length - 1].checkOut);
  await sleep(3000);
  check("and it is not asked again straight away", count(/Shift-end question #/g) === 1, count(/Shift-end question #/g));
  await stopAgent();

  section("NO: finished for the day");
  // the next hourly question, made due right now
  await Attendance.updateOne(
    { userId: user._id, date: dateKey() },
    { $set: { "overtime.state": "ASKING", "overtime.askId": 7, "overtime.askedAt": new Date(), "overtime.deadline": new Date(Date.now() + 10 * 60 * 1000), "overtime.coveredUntil": new Date(Date.now() - 60 * 1000) } }
  );
  startAgent("no");
  d = await waitFor(async () => { const x = await doc(); return x.overtime?.state === "DECLINED" && x; }, 20000);
  check("NO ends the session", Boolean(d) && d.sessions[d.sessions.length - 1].endReason === "OVERTIME_DECLINED", agentOut.slice(-400));
  check("agent confirms it sent the answer", /Shift-end answer sent: NO/.test(agentOut), agentOut.slice(-300));
  const sessionsAtNo = d.sessions.length; // every agent restart earlier in this test opened its own session
  await sleep(4000);
  d = await doc();
  check("the PC still on Wi-Fi does NOT restart it", d.wifi.state === "ENDED" && d.sessions.length === sessionsAtNo, { state: d.wifi.state, before: sessionsAtNo, after: d.sessions.length });
  check("no second question is raised", count(/Shift-end question #/g) === 1, count(/Shift-end question #/g));
  await stopAgent();

  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) { /* temp dir */ }

  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
  process.exit(0);
}

run().catch(async (err) => {
  console.error("\nTEST CRASHED:", err);
  await stopAgent();
  process.exit(2);
});
