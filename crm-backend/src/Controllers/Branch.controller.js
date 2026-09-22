// Branches and their authorised Wi-Fi networks
const Branch = require("../Models/Branch.Model");
const User = require("../Models/User.Model");
const AttendanceEvent = require("../Models/AttendanceEvent.Model");
const { isValidBssidPattern, normalizeBssid, normalizeSsid } = require("../Utils/wifi");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const pickBranchFields = (b) => {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim();
  if (b.address !== undefined) out.address = String(b.address).trim();
  if (b.heartbeatInterval !== undefined) out.heartbeatInterval = Number(b.heartbeatInterval);
  if (b.gracePeriod !== undefined) out.gracePeriod = Number(b.gracePeriod);
  if (b.active !== undefined) out.active = Boolean(b.active);
  return out;
};

function validateTimings(f) {
  if (f.heartbeatInterval !== undefined && !(f.heartbeatInterval >= 15 && f.heartbeatInterval <= 900)) {
    throw httpError(400, "Heartbeat interval must be between 15 and 900 seconds.");
  }
  if (f.gracePeriod !== undefined && !(f.gracePeriod >= 30 && f.gracePeriod <= 3600)) {
    throw httpError(400, "Grace period must be between 30 and 3600 seconds.");
  }
  if (f.name !== undefined && !f.name) throw httpError(400, "Branch name is required.");
}

// GET /api/branches   admin: everything.  employee: just their own branch name.
const list = handle(async (req, res) => {
  if (req.actor.type === "user") {
    const id = req.actor.doc.branchId;
    const b = id ? await Branch.findById(id).select("name").lean() : null;
    return ok(res, { branches: b ? [b] : [] });
  }
  const branches = await Branch.find({}).sort({ name: 1 }).lean();
  const counts = await User.aggregate([{ $match: { branchId: { $ne: null } } }, { $group: { _id: "$branchId", n: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  ok(res, { branches: branches.map((b) => ({ ...b, staffCount: byId.get(String(b._id)) || 0 })) });
});

const create = handle(async (req, res) => {
  const f = pickBranchFields(req.body || {});
  validateTimings(f);
  if (!f.name) throw httpError(400, "Branch name is required.");
  if (await Branch.findOne({ name: f.name })) throw httpError(409, "A branch with this name already exists.");
  const branch = await Branch.create(f);
  ok(res, { branch }, 201);
});

const update = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid branch id");
  const f = pickBranchFields(req.body || {});
  validateTimings(f);
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw httpError(404, "Branch not found");
  if (f.name && f.name !== branch.name && (await Branch.findOne({ name: f.name }))) {
    throw httpError(409, "A branch with this name already exists.");
  }
  Object.assign(branch, f);
  await branch.save();
  ok(res, { branch });
});

const remove = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid branch id");
  const staff = await User.countDocuments({ branchId: req.params.id });
  if (staff) throw httpError(409, `${staff} staff member(s) are assigned to this branch. Move them first.`);
  const r = await Branch.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw httpError(404, "Branch not found");
  ok(res, { message: "Branch deleted" });
});

// ---------------- networks ----------------
const addNetwork = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid branch id");
  const { ssid, bssid, band, label } = req.body || {};
  if (!ssid || !String(ssid).trim()) throw httpError(400, "SSID is required.");
  if (!isValidBssidPattern(bssid)) {
    throw httpError(400, "BSSID must look like 8C:C7:C3:09:1D:70 (or a prefix such as 8C:C7:C3:09:1D:*).");
  }
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw httpError(404, "Branch not found");

  const dup = branch.networks.some(
    (n) => normalizeSsid(n.ssid) === normalizeSsid(ssid) && normalizeBssid(n.bssid) === normalizeBssid(bssid)
  );
  if (dup) throw httpError(409, "This access point is already registered for the branch.");

  branch.networks.push({ ssid: String(ssid).trim(), bssid, band: band || "Other", label: label || "" });
  await branch.save();
  ok(res, { branch }, 201);
});

const updateNetwork = handle(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw httpError(404, "Branch not found");
  const net = branch.networks.id(req.params.networkId);
  if (!net) throw httpError(404, "Network not found");
  const { ssid, bssid, band, label, active } = req.body || {};
  if (ssid !== undefined) {
    if (!String(ssid).trim()) throw httpError(400, "SSID is required.");
    net.ssid = String(ssid).trim();
  }
  if (bssid !== undefined) {
    if (!isValidBssidPattern(bssid)) throw httpError(400, "Invalid BSSID.");
    net.bssid = bssid;
  }
  if (band !== undefined) net.band = band;
  if (label !== undefined) net.label = String(label);
  if (active !== undefined) net.active = Boolean(active);
  await branch.save();
  ok(res, { branch });
});

const removeNetwork = handle(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw httpError(404, "Branch not found");
  const net = branch.networks.id(req.params.networkId);
  if (!net) throw httpError(404, "Network not found");
  net.deleteOne();
  await branch.save();
  ok(res, { branch });
});

// GET /api/branches/rejected-networks
// Networks staff connected to that were NOT recognised - the fastest way to
// find an access point that was forgotten during setup.
const rejectedNetworks = handle(async (req, res) => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const events = await AttendanceEvent.find({ type: "REJECTED_NETWORK", occurredAt: { $gte: since } })
    .sort({ occurredAt: -1 })
    .limit(600)
    .lean();

  const map = new Map();
  for (const e of events) {
    const key = `${e.branchId}|${e.ssid}|${e.bssid}`;
    const cur = map.get(key) || { branchId: e.branchId, ssid: e.ssid, bssid: e.bssid, count: 0, lastSeen: e.occurredAt, users: new Set() };
    cur.count += 1;
    cur.users.add(e.userName);
    map.set(key, cur);
  }
  const branches = await Branch.find({}).select("name").lean();
  const nameBy = new Map(branches.map((b) => [String(b._id), b.name]));
  const items = [...map.values()]
    .map((r) => ({ ...r, users: [...r.users].slice(0, 5), branchName: nameBy.get(String(r.branchId)) || "" }))
    .sort((a, b) => b.count - a.count);
  ok(res, { items });
});

module.exports = { list, create, update, remove, addNetwork, updateNetwork, removeNetwork, rejectedNetworks };
