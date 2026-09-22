// Device registration (employee) and device management (admin)
const crypto = require("crypto");
const Device = require("../Models/Device.Model");
const User = require("../Models/User.Model");
const AttendanceEvent = require("../Models/AttendanceEvent.Model");
const { hashToken } = require("../Middleware/deviceAuth");
const { getSettings } = require("../Services/settings.service");
const notify = require("../Services/notification.service");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const clean = (d) => {
  const o = d.toObject ? d.toObject() : { ...d };
  delete o.tokenHash;
  return o;
};

async function logEvent(device, user, type, message) {
  try {
    await AttendanceEvent.create({
      userId: device.userId,
      userName: user?.name || device.userName || "",
      deviceId: device._id,
      branchId: device.branchId || null,
      type,
      message,
    });
  } catch (_) {
    /* audit only */
  }
}

// POST /api/devices/register   (employee)   { deviceId, hostname, platform, agentVersion }
const register = handle(async (req, res) => {
  const { deviceId, hostname = "", platform = "", agentVersion = "" } = req.body || {};
  if (!ID_RE.test(String(deviceId || ""))) throw httpError(400, "A valid deviceId from the attendance agent is required.");

  const user = req.actor.doc;
  const settings = await getSettings();
  const token = crypto.randomBytes(32).toString("hex");

  let device = await Device.findOne({ deviceId }).select("+tokenHash");
  let created = false;

  if (device) {
    if (String(device.userId) !== String(user._id)) {
      throw httpError(409, "This computer is already registered to another employee. Ask an administrator to release it.");
    }
    if (device.status === "REVOKED") throw httpError(403, "This device was revoked. Contact your administrator.");
    // same employee re-installing the agent: rotate the token, keep the status
    device.hostname = String(hostname).slice(0, 80) || device.hostname;
    device.platform = String(platform).slice(0, 40) || device.platform;
    device.agentVersion = String(agentVersion).slice(0, 20) || device.agentVersion;
  } else {
    const active = await Device.countDocuments({ userId: user._id, status: "ACTIVE" });
    const autoApprove = settings.autoApproveFirstDevice && active < (settings.maxActiveDevicesPerUser || 1);
    device = new Device({
      userId: user._id,
      userName: user.name,
      branchId: user.branchId || null,
      deviceId,
      hostname: String(hostname).slice(0, 80),
      platform: String(platform).slice(0, 40),
      agentVersion: String(agentVersion).slice(0, 20),
      status: autoApprove ? "ACTIVE" : "PENDING",
      approvedBy: autoApprove ? "auto" : "",
      approvedAt: autoApprove ? new Date() : null,
    });
    created = true;
  }

  device.tokenHash = hashToken(token);
  await device.save();

  if (created) {
    await logEvent(device, user, "DEVICE_REGISTERED", `${user.name} registered ${device.hostname || device.deviceId} (${device.status})`);
    if (device.status === "PENDING") {
      await notify.notifyAdmins({
        category: "device",
        type: "DEVICE_PENDING",
        severity: "warning",
        title: "Device waiting for approval",
        message: `${user.name} registered another computer (${device.hostname || device.deviceId}).`,
        link: "Wi-Fi Setup",
        data: { deviceId: String(device._id) },
        dedupeKey: `devpending:${device._id}`,
      });
    }
  }

  ok(res, { device: clean(device), deviceToken: token, status: device.status }, created ? 201 : 200);
});

// GET /api/devices/mine
const mine = handle(async (req, res) => {
  const devices = await Device.find({ userId: req.actor.id }).select("-tokenHash").sort({ createdAt: -1 }).lean();
  ok(res, { devices });
});

// DELETE /api/devices/mine/:id   (employee removes their own device, e.g. laptop replaced)
const removeMine = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid device id");
  const r = await Device.deleteOne({ _id: req.params.id, userId: req.actor.id });
  if (!r.deletedCount) throw httpError(404, "Device not found");
  ok(res, { message: "Device removed" });
});

// ---------------- admin ----------------
// GET /api/devices?status=&branchId=
const listAll = handle(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = String(req.query.status).toUpperCase();
  if (isObjectId(req.query.branchId)) q.branchId = req.query.branchId;
  const devices = await Device.find(q).select("-tokenHash").populate("branchId", "name").sort({ status: 1, createdAt: -1 }).lean();
  ok(res, { devices });
});

async function setStatus(req, res, status) {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid device id");
  const device = await Device.findById(req.params.id);
  if (!device) throw httpError(404, "Device not found");
  const user = await User.findById(device.userId).select("name");

  device.status = status;
  if (status === "ACTIVE") {
    device.approvedBy = req.actor.name;
    device.approvedAt = new Date();
    device.revokedAt = null;
  } else if (status === "REVOKED") {
    device.revokedAt = new Date();
  }
  await device.save();

  await logEvent(device, user, status === "ACTIVE" ? "DEVICE_APPROVED" : "DEVICE_REVOKED", `${req.actor.name} set ${device.hostname || device.deviceId} to ${status}`);
  await notify.notifyUser(device.userId, {
    category: "device",
    type: status === "ACTIVE" ? "DEVICE_APPROVED" : "DEVICE_REVOKED",
    severity: status === "ACTIVE" ? "success" : "critical",
    title: status === "ACTIVE" ? "Device approved" : "Device revoked",
    message:
      status === "ACTIVE"
        ? `${device.hostname || "Your computer"} can now record Wi-Fi attendance.`
        : `${device.hostname || "Your computer"} can no longer record attendance. Contact your administrator.`,
    link: "Attendance",
  });
  ok(res, { device: clean(device) });
}

const approve = handle((req, res) => setStatus(req, res, "ACTIVE"));
const revoke = handle((req, res) => setStatus(req, res, "REVOKED"));

const removeAny = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid device id");
  const r = await Device.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw httpError(404, "Device not found");
  ok(res, { message: "Device deleted" });
});

module.exports = { register, mine, removeMine, listAll, approve, revoke, removeAny };
