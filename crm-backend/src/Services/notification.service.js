// =====================================================
// NOTIFICATIONS
// Stored in MongoDB (so nothing is lost while someone is offline) and pushed
// instantly over Socket.IO. A failure here must NEVER break attendance
// processing, so every public function swallows and logs its own errors.
// =====================================================
const Notification = require("../Models/Notification.Model");
const AdminAccount = require("../Models/Admin.Model");
const socket = require("./socket");

let adminIdsCache = { at: 0, ids: [] };

async function getAdminIds() {
  if (Date.now() - adminIdsCache.at < 60 * 1000) return adminIdsCache.ids;
  const admins = await AdminAccount.find({}, "_id").lean();
  adminIdsCache = { at: Date.now(), ids: admins.map((a) => String(a._id)) };
  return adminIdsCache.ids;
}

function clean(payload = {}) {
  return {
    category: payload.category || "system",
    type: payload.type || "GENERIC",
    severity: payload.severity || "info",
    title: String(payload.title || "").slice(0, 140),
    message: String(payload.message || "").slice(0, 600),
    link: payload.link || "",
    data: payload.data || {},
    dedupeKey: payload.dedupeKey || null,
  };
}

async function createOne(recipientType, recipientId, payload) {
  const body = clean(payload);
  if (!body.title) return null;

  if (body.dedupeKey) {
    const exists = await Notification.findOne({ recipientId, dedupeKey: body.dedupeKey }).select("_id").lean();
    if (exists) return null;
  }

  const doc = await Notification.create({ recipientType, recipientId, ...body });
  const out = doc.toObject();

  if (recipientType === "user") socket.emitToUser(String(recipientId), "notification", out);
  else socket.emitToAdmin(String(recipientId), "notification", out);
  return out;
}

async function notifyUser(userId, payload) {
  try {
    return await createOne("user", userId, payload);
  } catch (err) {
    console.error("[Notify] user notification failed:", err.message);
    return null;
  }
}

async function notifyUsers(userIds = [], payload) {
  const out = [];
  for (const id of userIds) out.push(await notifyUser(id, payload));
  return out;
}

async function notifyAdmins(payload) {
  try {
    const ids = await getAdminIds();
    const out = [];
    for (const id of ids) out.push(await createOne("admin", id, payload));
    return out;
  } catch (err) {
    console.error("[Notify] admin notification failed:", err.message);
    return [];
  }
}

/** Tell open dashboards something changed so they refresh without waiting for the next poll. */
function pushAttendanceUpdate(userId, payload = {}) {
  try {
    socket.emitToUser(String(userId), "attendance:update", payload);
    socket.emitToAdmins("attendance:update", { userId: String(userId), ...payload });
  } catch (err) {
    console.error("[Notify] live update failed:", err.message);
  }
}

module.exports = { notifyUser, notifyUsers, notifyAdmins, pushAttendanceUpdate };
