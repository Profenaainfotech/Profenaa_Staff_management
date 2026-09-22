const Holiday = require("../Models/Holiday.Model");
const Branch = require("../Models/Branch.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const { isValidDateKey, dateKey } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

// GET /api/holidays?year=2026
const list = handle(async (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || "") ? req.query.year : dateKey().slice(0, 4);
  const holidays = await Holiday.find({ date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } })
    .populate("branchId", "name")
    .sort({ date: 1 })
    .lean();
  ok(res, { year, holidays });
});

const create = handle(async (req, res) => {
  const { date, name, branchId } = req.body || {};
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  if (!name || !String(name).trim()) throw httpError(400, "Holiday name is required");
  let branch = null;
  if (branchId) {
    if (!isObjectId(branchId) || !(branch = await Branch.findById(branchId))) throw httpError(400, "Unknown branch");
  }
  const holiday = await Holiday.create({ date, name: String(name).trim(), branchId: branch ? branch._id : null });

  if (date >= dateKey()) {
    const q = { isActive: { $ne: false } };
    if (branch) q.branchId = branch._id;
    const users = await User.find(q).select("_id").lean();
    await notify.notifyUsers(users.map((u) => u._id), {
      category: "system",
      type: "HOLIDAY_ADDED",
      severity: "info",
      title: `Holiday: ${holiday.name}`,
      message: `${date}${branch ? ` (${branch.name})` : ""}`,
      link: "Leaves",
    });
  }
  ok(res, { holiday }, 201);
});

const remove = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const r = await Holiday.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw httpError(404, "Holiday not found");
  ok(res, {});
});

module.exports = { list, create, remove };
