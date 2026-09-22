const Notification = require("../Models/Notification.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");
const { dateKey, startOfDay } = require("../Utils/time");

// Everything here only ever touches the CALLER'S OWN notifications that are not deleted.
const scope = (req) => ({ recipientType: req.actor.type, recipientId: req.actor.id });
const alive = (req) => ({ ...scope(req), deletedAt: null });

// ---- deleting by date -------------------------------------------------
//   today = since 00:00 India time, week = the last 7 days, all = everything
const RANGES = ["today", "week", "all"];
const truthy = (v) => v === "1" || v === "true";

function sinceOf(range) {
  if (range === "today") return startOfDay(dateKey());
  if (range === "week") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return null;
}

/** The caller's notifications for one range (optionally only the ones already read) */
function rangeFilter(req, range) {
  const q = alive(req);
  const since = sinceOf(range);
  if (since) q.createdAt = { $gte: since };
  if (truthy(req.query.readOnly)) q.readAt = { $ne: null };
  return q;
}

/**
 * Delete what matches the filter. Alerts with a duplicate guard (dedupeKey) are hidden instead of
 * erased, so the attendance checks cannot create them again; everything else is really removed.
 */
async function purge(filter) {
  const hidden = await Notification.updateMany({ ...filter, dedupeKey: { $ne: null } }, { $set: { deletedAt: new Date() } });
  const erased = await Notification.deleteMany({ ...filter, dedupeKey: null });
  return (hidden.modifiedCount || 0) + (erased.deletedCount || 0);
}

// GET /api/notifications?limit=30&before=<ISO>&unread=1
const list = handle(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const q = { ...alive(req) };
  if (req.query.unread === "1") q.readAt = null;
  if (req.query.before) {
    const d = new Date(req.query.before);
    if (!Number.isNaN(d.getTime())) q.createdAt = { $lt: d };
  }
  if (req.query.category) q.category = String(req.query.category);
  const items = await Notification.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  const unreadCount = await Notification.countDocuments({ ...alive(req), readAt: null });
  ok(res, { notifications: items, unreadCount, hasMore: items.length === limit });
});

const unreadCount = handle(async (req, res) => {
  ok(res, { unreadCount: await Notification.countDocuments({ ...alive(req), readAt: null }) });
});

const markRead = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const r = await Notification.updateOne({ _id: req.params.id, ...alive(req), readAt: null }, { $set: { readAt: new Date() } });
  ok(res, { updated: r.modifiedCount });
});

const markAllRead = handle(async (req, res) => {
  const r = await Notification.updateMany({ ...alive(req), readAt: null }, { $set: { readAt: new Date() } });
  ok(res, { updated: r.modifiedCount });
});

// DELETE /api/notifications/:id   - one notification (deleting it twice is fine)
const remove = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const deleted = await purge({ ...alive(req), _id: req.params.id });
  ok(res, { deleted });
});

// DELETE /api/notifications?range=today|week|all[&readOnly=1]
const clear = handle(async (req, res) => {
  const range = String(req.query.range || "");
  if (!RANGES.includes(range)) throw httpError(400, "Choose what to delete: today, week or all.");
  const deleted = await purge(rangeFilter(req, range));
  ok(res, { deleted, range });
});

// GET /api/notifications/counts[?readOnly=1]  - how many each choice above would delete
const counts = handle(async (req, res) => {
  const [today, week, all] = await Promise.all(RANGES.map((r) => Notification.countDocuments(rangeFilter(req, r))));
  ok(res, { counts: { today, week, all } });
});

// DELETE /api/notifications/read  (older screens): everything already read
const clearRead = handle(async (req, res) => {
  const deleted = await purge({ ...alive(req), readAt: { $ne: null } });
  ok(res, { deleted });
});

// POST /api/notifications/broadcast   (admin)  { title, message, severity, audience, branchId, userIds }
const broadcast = handle(async (req, res) => {
  const { title, message = "", severity = "info", audience = "ALL", branchId, userIds } = req.body || {};
  if (!title || !String(title).trim()) throw httpError(400, "Title is required");
  if (!["info", "success", "warning", "critical"].includes(severity)) throw httpError(400, "Invalid severity");

  const q = { isActive: { $ne: false } };
  if (audience === "BRANCH") {
    if (!isObjectId(branchId)) throw httpError(400, "Choose a branch");
    q.branchId = branchId;
  } else if (audience === "USERS") {
    const ids = (Array.isArray(userIds) ? userIds : []).filter(isObjectId);
    if (!ids.length) throw httpError(400, "Choose at least one staff member");
    q._id = { $in: ids };
  }
  const users = await User.find(q).select("_id").lean();
  await notify.notifyUsers(users.map((u) => u._id), {
    category: "system",
    type: "ANNOUNCEMENT",
    severity,
    title: String(title).trim(),
    message: String(message).trim(),
    data: { from: req.actor.name },
  });
  ok(res, { sent: users.length });
});

module.exports = { list, unreadCount, counts, markRead, markAllRead, remove, clear, clearRead, broadcast };
