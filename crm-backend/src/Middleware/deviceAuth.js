// Authenticates the desktop agent by its DEVICE TOKEN (not the employee's password).
//   Authorization: Device <token>
// Only the SHA-256 hash of the token is stored, so a database leak does not leak tokens.
const crypto = require("crypto");
const Device = require("../Models/Device.Model");

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

// tiny in-memory rate limit: 120 requests / minute / device
const hits = new Map();
function limited(id) {
  const now = Date.now();
  const rec = hits.get(id) || { start: now, n: 0 };
  if (now - rec.start > 60 * 1000) {
    rec.start = now;
    rec.n = 0;
  }
  rec.n += 1;
  hits.set(id, rec);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > 120000) hits.delete(k);
  return rec.n > 120;
}

async function deviceAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Device ") ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ success: false, code: "NO_TOKEN", message: "Device token missing." });

  const device = await Device.findOne({ tokenHash: hashToken(token) }).select("+tokenHash");
  if (!device) return res.status(401).json({ success: false, code: "BAD_TOKEN", message: "Unknown device token. Re-register this computer." });
  if (device.status === "REVOKED") return res.status(401).json({ success: false, code: "DEVICE_REVOKED", message: "This device was revoked by an administrator." });
  if (device.status === "PENDING") return res.status(403).json({ success: false, code: "DEVICE_PENDING", message: "Waiting for administrator approval." });

  if (limited(String(device._id))) return res.status(429).json({ success: false, code: "RATE_LIMITED", message: "Too many requests." });

  req.device = device;
  next();
}

module.exports = deviceAuth;
module.exports.hashToken = hashToken;
