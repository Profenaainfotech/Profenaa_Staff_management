// Endpoints called by the desktop agent (authenticated with the device token).
const User = require("../Models/User.Model");
const Branch = require("../Models/Branch.Model");
const Device = require("../Models/Device.Model");
const engine = require("../Services/attendanceEngine");
const { getSettings } = require("../Services/settings.service");
const { ok, handle } = require("../Utils/http");

const str = (v, max) => String(v ?? "").slice(0, max);

function toSignal(body, kind) {
  return {
    kind,
    connected: body.connected === true || body.connected === "true",
    ssid: str(body.ssid, 64),
    bssid: str(body.bssid, 32),
    occurredAt: body.occurredAt,
  };
}

// GET /api/agent/config?hostname=&agentVersion=
const getConfig = handle(async (req, res) => {
  const device = req.device;
  const user = await User.findById(device.userId).select("name attendanceMode branchId isActive shiftStart shiftEnd");
  const branch = user?.branchId ? await Branch.findById(user.branchId).select("name heartbeatInterval gracePeriod active") : null;
  const settings = await getSettings();

  let reason = null;
  if (!user || user.isActive === false) reason = "USER_INACTIVE";
  else if (user.attendanceMode !== "WIFI") reason = "MODE_NOT_WIFI";
  else if (!branch || branch.active === false) reason = "NO_BRANCH";

  const patch = {};
  if (req.query.agentVersion) patch.agentVersion = str(req.query.agentVersion, 20);
  if (req.query.hostname) patch.hostname = str(req.query.hostname, 80);
  if (Object.keys(patch).length) await Device.updateOne({ _id: device._id }, { $set: patch });

  ok(res, {
    tracking: !reason,
    reason,
    userName: user?.name || "",
    branch: branch ? branch.name : null,
    shift: user ? { start: user.shiftStart, end: user.shiftEnd } : null,
    heartbeatInterval: branch?.heartbeatInterval || 90,
    gracePeriod: branch?.gracePeriod || 300,
    earliestCheckInBeforeShiftMinutes: settings.earliestCheckInBeforeShiftMinutes,
    serverTime: new Date().toISOString(),
  });
});

// POST /api/agent/heartbeat   { connected, ssid, bssid, occurredAt? }
const heartbeat = handle(async (req, res) => {
  const result = await engine.ingestSignal({ device: req.device, signal: toSignal(req.body, "HEARTBEAT"), live: true, ip: req.ip });
  ok(res, result);
});

// POST /api/agent/shutdown    { connected, ssid, bssid, occurredAt? }
const shutdown = handle(async (req, res) => {
  const result = await engine.ingestSignal({ device: req.device, signal: toSignal(req.body, "SHUTDOWN"), live: true, ip: req.ip });
  ok(res, result);
});

// POST /api/agent/batch       { events: [{ kind, connected, ssid, bssid, occurredAt }] }
// Replays the agent's offline queue at the ORIGINAL timestamps.
const batch = handle(async (req, res) => {
  const list = Array.isArray(req.body?.events) ? req.body.events : [];
  const events = list.slice(0, 500).map((e) => ({
    ...toSignal(e, e.kind === "SHUTDOWN" ? "SHUTDOWN" : "HEARTBEAT"),
    occurredAt: e.occurredAt,
  }));
  const result = await engine.ingestBatch({ device: req.device, events, ip: req.ip });
  ok(res, result);
});

// POST /api/agent/overtime   { answer: "YES" | "NO" }
// The employee's answer to the shift-end "Are you still working?" pop-up on the PC.
const overtime = handle(async (req, res) => {
  const result = await engine.answerOvertime(req.device.userId, req.body?.answer, "AGENT");
  ok(res, result);
});

module.exports = { getConfig, heartbeat, shutdown, batch, overtime };
