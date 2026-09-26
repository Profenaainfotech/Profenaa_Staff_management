// Wi-Fi attendance: employee "my day" + admin live board, reports, audit log, manual edits
const AttendanceEvent = require("../Models/AttendanceEvent.Model");
const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");
const LoginLog = require("../Models/LoginLog.Model");
const report = require("../Services/report.service");
const engine = require("../Services/attendanceEngine");
const { dateAtTime, dateKey, isValidDateKey, monthRange, addDays } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

// ---------------- employee ----------------
const myLive = handle(async (req, res) => {
  ok(res, await report.userLive(req.payload.id));
});

// GET /api/attendance/my/month?month=2026-09
const myMonth = handle(async (req, res) => {
  const month = req.query.month || dateKey().slice(0, 7);
  const data = await report.monthlyReport({ month, userId: req.payload.id });
  ok(res, { month: data.month, from: data.from, to: data.to, summary: { ...data.rows[0], days: undefined }, days: data.rows[0]?.days || [] });
});

// GET /api/attendance/my/events?limit=30
const myEvents = handle(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const events = await AttendanceEvent.find({ userId: req.payload.id, type: { $ne: "REJECTED_NETWORK" } })
    .sort({ occurredAt: -1 })
    .limit(limit)
    .lean();
  ok(res, { events });
});

// ---------------- admin ----------------
// GET /api/attendance/admin/board?date=&branchId=&q=&mode=
const adminBoard = handle(async (req, res) => {
  const { date, branchId, q, mode } = req.query;
  if (date && !isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  if (branchId && !isObjectId(branchId)) throw httpError(400, "Invalid branchId");
  ok(res, await report.dailyBoard({ date, branchId, q, mode }));
});

// GET /api/attendance/admin/report?month=2026-09&branchId=
const adminReport = handle(async (req, res) => {
  const { month, branchId } = req.query;
  if (branchId && !isObjectId(branchId)) throw httpError(400, "Invalid branchId");
  ok(res, await report.monthlyReport({ month, branchId }));
});

// GET /api/attendance/admin/user/:userId?month=  (one employee's calendar)
const adminUserMonth = handle(async (req, res) => {
  if (!isObjectId(req.params.userId)) throw httpError(400, "Invalid user id");
  const data = await report.monthlyReport({ month: req.query.month, userId: req.params.userId });
  ok(res, { month: data.month, summary: { ...data.rows[0], days: undefined }, days: data.rows[0]?.days || [] });
});

// GET /api/attendance/admin/events?userId=&date=&type=&limit=
const adminEvents = handle(async (req, res) => {
  const q = {};
  if (isObjectId(req.query.userId)) q.userId = req.query.userId;
  if (req.query.date) {
    if (!isValidDateKey(req.query.date)) throw httpError(400, "date must be YYYY-MM-DD");
    q.date = req.query.date;
  }
  if (req.query.type) q.type = String(req.query.type).toUpperCase();
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const events = await AttendanceEvent.find(q).sort({ occurredAt: -1 }).limit(limit).populate("branchId", "name").lean();
  ok(res, { events });
});

// GET /api/attendance/admin/detail?userId=&date=
const adminDetail = handle(async (req, res) => {
  const { userId, date } = req.query;
  if (!isObjectId(userId) || !isValidDateKey(date)) throw httpError(400, "userId and date (YYYY-MM-DD) are required");
  const attendance = await Attendance.findOne({ userId, date }).lean();
  const events = await AttendanceEvent.find({ userId, date, type: { $ne: "REJECTED_NETWORK" } }).sort({ occurredAt: 1 }).lean();
  const logins = await LoginLog.find({ userId, date }).sort({ at: 1 }).lean();
  ok(res, { attendance, events, logins });
});

// PUT /api/attendance/admin/manual  { userId, date, checkIn:"HH:MM", checkOut:"HH:MM", note }
const adminManual = handle(async (req, res) => {
  const { userId, date, checkIn, checkOut, note } = req.body || {};
  if (!isObjectId(userId)) throw httpError(400, "Invalid userId");
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  if (date > dateKey()) throw httpError(400, "Cannot record attendance for a future date");
  if (!/^\d{2}:\d{2}$/.test(String(checkIn)) || !/^\d{2}:\d{2}$/.test(String(checkOut))) {
    throw httpError(400, "checkIn and checkOut must be HH:MM");
  }
  if (!note || !String(note).trim()) throw httpError(400, "A reason is required for manual changes");

  const att = await engine.applyManualTimes({
    userId,
    date,
    checkIn: dateAtTime(date, checkIn),
    checkOut: dateAtTime(date, checkOut),
    by: req.admin.name,
    note: String(note).trim(),
  });
  ok(res, { attendance: att });
});

// ---------------- shift-end question, explanations, sign-ins (employee) ----------------
// POST /api/attendance/my/overtime   { answer: "YES" | "NO" }
const myOvertimeAnswer = handle(async (req, res) => {
  const r = await engine.answerOvertime(req.payload.id, req.body?.answer, "WEB");
  if (!r.ok) {
    const msg =
      r.code === "EXPIRED"
        ? "The time to answer has passed."
        : "There is no shift-end question waiting for an answer.";
    throw httpError(409, msg);
  }
  ok(res, r);
});

// POST /api/attendance/my/explain   { date, text }
const myExplain = handle(async (req, res) => {
  const { date, text } = req.body || {};
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  const att = await engine.explainReview(req.payload.id, date, text);
  ok(res, { message: "Your explanation was sent to the administrator", review: att.review });
});

// GET /api/attendance/my/reviews   days waiting for (or recently given) an explanation, last 14 days
const myReviews = handle(async (req, res) => {
  const from = addDays(dateKey(), -14);
  const docs = await Attendance.find({ userId: req.payload.id, date: { $gte: from }, "review.state": { $in: ["PENDING_EXPLANATION", "EXPLAINED", "APPROVED", "REJECTED"] } })
    .sort({ date: -1 })
    .lean();
  ok(res, {
    reviews: docs.map((d) => ({ date: d.date, totalMinutes: d.totalMinutes, checkOut: d.checkOut, review: d.review })),
  });
});

// GET /api/attendance/my/logins?limit=15
const myLogins = handle(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 15, 50);
  const logins = await LoginLog.find({ userId: req.payload.id, role: "user" }).sort({ at: -1 }).limit(limit).lean();
  ok(res, { logins });
});

// ---------------- admin: shift-end reviews, sign-in activity, overtime & Sunday work ----------------
// GET /api/attendance/admin/reviews?status=open|all
const adminReviews = handle(async (req, res) => {
  const states = req.query.status === "all" ? ["PENDING_EXPLANATION", "EXPLAINED", "APPROVED", "REJECTED"] : ["PENDING_EXPLANATION", "EXPLAINED"];
  const docs = await Attendance.find({ "review.state": { $in: states } }).sort({ date: -1 }).limit(200).lean();
  ok(res, {
    reviews: docs.map((d) => ({
      attendanceId: d._id,
      userId: d.userId,
      userName: d.userName,
      date: d.date,
      totalMinutes: d.totalMinutes,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      review: d.review,
    })),
  });
});

// PATCH /api/attendance/admin/review   { userId, date, decision: "APPROVE"|"REJECT", note }
const adminDecideReview = handle(async (req, res) => {
  const { userId, date, decision, note } = req.body || {};
  if (!isObjectId(userId)) throw httpError(400, "Invalid userId");
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  const att = await engine.decideReview({ userId, date, decision, note, by: req.admin.name });
  ok(res, { message: decision === "APPROVE" ? "Marked Present" : "Kept as a half day", attendance: att });
});

// GET /api/attendance/admin/logins?date=&from=&to=&userId=&result=&role=&limit=
const adminLogins = handle(async (req, res) => {
  const { date, from, to, userId, result, role, q } = req.query;
  const query = {};
  if (date) {
    if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
    query.date = date;
  } else if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  if (isObjectId(userId)) query.userId = userId;
  if (["ALLOWED", "BLOCKED"].includes(result)) query.result = result;
  if (["user", "admin"].includes(role)) query.role = role;
  if (q) query.userName = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const logins = await LoginLog.find(query).sort({ at: -1 }).limit(limit).lean();
  ok(res, { logins });
});

// GET /api/attendance/admin/extra?from=&to=&branchId=   (overtime + Sunday / holiday work)
const adminExtra = handle(async (req, res) => {
  const { from, to, branchId } = req.query;
  if (from && !isValidDateKey(from)) throw httpError(400, "from must be YYYY-MM-DD");
  if (to && !isValidDateKey(to)) throw httpError(400, "to must be YYYY-MM-DD");
  if (branchId && !isObjectId(branchId)) throw httpError(400, "Invalid branchId");
  ok(res, await report.extraWork({ from, to, branchId }));
});

// POST /api/attendance/admin/run-check-now
//
// The shift-end question, the day-off question, and the absolute safety cap all run on a
// timer in the background (attendanceMonitor.js). This runs that exact same check once,
// immediately, instead of waiting - so a stale session someone forgot to close gets
// cleaned up right away, and this is also the "test it without waiting for shift end"
// button: run it, then look at Users & Team / an individual's Attendance page for the
// result.
const adminRunCheckNow = handle(async (req, res) => {
  const result = await engine.runMonitorTick(new Date());
  ok(res, { message: `Checked ${result.checked} open session${result.checked === 1 ? "" : "s"}.`, ...result });
});

const exists = async (id) => Boolean(await User.exists({ _id: id }));

module.exports = {
  myLive,
  myMonth,
  myEvents,
  myOvertimeAnswer,
  myExplain,
  myLogins,
  myReviews,
  adminBoard,
  adminReport,
  adminUserMonth,
  adminEvents,
  adminDetail,
  adminManual,
  adminReviews,
  adminDecideReview,
  adminLogins,
  adminExtra,
  adminRunCheckNow,
  exists,
  monthRange,
};
