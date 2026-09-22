const Leave = require("../Models/Leave.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const { getSettings } = require("../Services/settings.service");
const { loadCalendar, countLeaveDays } = require("../Services/calendar.service");
const { dateKey, addDays, isValidDateKey } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const { LEAVE_TYPES } = Leave;

// POST /api/leaves   (employee) { type, fromDate, toDate, halfDay, reason }
const apply = handle(async (req, res) => {
  const { type, fromDate, toDate, halfDay = false, reason = "" } = req.body || {};
  const user = req.actor.doc;
  const today = dateKey();

  if (!LEAVE_TYPES.includes(type)) throw httpError(400, "Choose a valid leave type");
  if (!isValidDateKey(fromDate) || !isValidDateKey(toDate)) throw httpError(400, "Dates must be YYYY-MM-DD");
  if (fromDate > toDate) throw httpError(400, "The end date is before the start date");
  if (fromDate < addDays(today, -60)) throw httpError(400, "Leave cannot start more than 60 days in the past");
  if (addDays(fromDate, 90) < toDate) throw httpError(400, "A single request can cover at most 90 days");
  if (halfDay && fromDate !== toDate) throw httpError(400, "Half day applies to a single date only");
  if (!String(reason).trim()) throw httpError(400, "Please give a reason");

  const overlap = await Leave.findOne({
    userId: user._id,
    status: { $in: ["Pending", "Approved"] },
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate },
  });
  if (overlap) throw httpError(409, `You already have a ${overlap.status.toLowerCase()} request for ${overlap.fromDate} to ${overlap.toDate}`);

  const cal = await loadCalendar(fromDate, toDate, [user._id]);
  const days = countLeaveDays(user, fromDate, toDate, Boolean(halfDay), cal);
  if (days === 0) throw httpError(400, "Every selected day is already a holiday or weekly off");

  const leave = await Leave.create({
    userId: user._id,
    userName: user.name,
    type,
    fromDate,
    toDate,
    halfDay: Boolean(halfDay),
    days,
    reason: String(reason).trim().slice(0, 500),
  });

  await notify.notifyAdmins({
    category: "leave",
    type: "LEAVE_REQUEST",
    severity: "info",
    title: `${user.name} requested ${type}`,
    message: `${fromDate}${fromDate !== toDate ? ` to ${toDate}` : ""} · ${days} day(s)`,
    link: "Leaves",
    data: { leaveId: String(leave._id) },
  });
  ok(res, { leave }, 201);
});

// GET /api/leaves/mine
const mine = handle(async (req, res) => {
  const leaves = await Leave.find({ userId: req.actor.id }).sort({ fromDate: -1 }).limit(100).lean();
  ok(res, { leaves });
});

// GET /api/leaves/balance
const balance = handle(async (req, res) => {
  const settings = await getSettings();
  const year = dateKey().slice(0, 4);
  const leaves = await Leave.find({
    userId: req.actor.id,
    status: { $in: ["Approved", "Pending"] },
    fromDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).lean();

  const rows = LEAVE_TYPES.map((type) => {
    const quota = settings.leaveQuotas?.[type];
    const used = leaves.filter((l) => l.type === type && l.status === "Approved").reduce((s, l) => s + l.days, 0);
    const pending = leaves.filter((l) => l.type === type && l.status === "Pending").reduce((s, l) => s + l.days, 0);
    return { type, quota: quota ?? null, used, pending, remaining: quota == null ? null : Math.max(0, quota - used - pending) };
  });
  ok(res, { year, balance: rows });
});

// PATCH /api/leaves/:id/cancel  (employee)
const cancel = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const leave = await Leave.findOne({ _id: req.params.id, userId: req.actor.id });
  if (!leave) throw httpError(404, "Leave request not found");
  const canCancel = leave.status === "Pending" || (leave.status === "Approved" && leave.fromDate > dateKey());
  if (!canCancel) throw httpError(400, "This request can no longer be cancelled");
  const wasApproved = leave.status === "Approved";
  leave.status = "Cancelled";
  await leave.save();
  if (wasApproved) {
    await notify.notifyAdmins({
      category: "leave",
      type: "LEAVE_CANCELLED",
      severity: "info",
      title: `${leave.userName} cancelled approved leave`,
      message: `${leave.fromDate} to ${leave.toDate}`,
      link: "Leaves",
    });
  }
  ok(res, { leave });
});

// ---------------- admin ----------------
// GET /api/leaves?status=Pending&userId=&month=2026-09
const listAll = handle(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = String(req.query.status);
  if (isObjectId(req.query.userId)) q.userId = req.query.userId;
  if (/^\d{4}-\d{2}$/.test(req.query.month || "")) {
    const m = req.query.month;
    q.fromDate = { $lte: `${m}-31` };
    q.toDate = { $gte: `${m}-01` };
  }
  const leaves = await Leave.find(q).sort({ status: 1, fromDate: -1 }).limit(300).lean();
  ok(res, { leaves });
});

// PATCH /api/leaves/:id/decide  { decision: "Approved"|"Rejected", note }
const decide = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const { decision, note = "" } = req.body || {};
  if (!["Approved", "Rejected"].includes(decision)) throw httpError(400, "decision must be Approved or Rejected");
  const leave = await Leave.findById(req.params.id);
  if (!leave) throw httpError(404, "Leave request not found");
  if (leave.status !== "Pending") throw httpError(409, `Already ${leave.status.toLowerCase()}`);

  leave.status = decision;
  leave.decidedBy = req.actor.name;
  leave.decidedAt = new Date();
  leave.adminNote = String(note).trim().slice(0, 300);
  await leave.save();

  const user = await User.findById(leave.userId).select("_id").lean();
  if (user) {
    await notify.notifyUser(user._id, {
      category: "leave",
      type: decision === "Approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      severity: decision === "Approved" ? "success" : "warning",
      title: `${leave.type} ${decision.toLowerCase()}`,
      message: `${leave.fromDate}${leave.fromDate !== leave.toDate ? ` to ${leave.toDate}` : ""}${leave.adminNote ? ` — ${leave.adminNote}` : ""}`,
      link: "Leaves",
    });
  }
  ok(res, { leave });
});

module.exports = { apply, mine, balance, cancel, listAll, decide };
