// "The Wi-Fi/agent failed but I was in the office" - employee requests a correction,
// admin approves (times are applied to the attendance record and audited) or rejects.
const Regularization = require("../Models/Regularization.Model");
const User = require("../Models/User.Model");
const engine = require("../Services/attendanceEngine");
const notify = require("../Services/notification.service");
const { dateKey, addDays, dateAtTime, isValidDateKey } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// POST /api/regularizations  { date, checkIn:"HH:MM", checkOut:"HH:MM", reason }
const create = handle(async (req, res) => {
  const { date, checkIn, checkOut, reason } = req.body || {};
  const user = req.actor.doc;
  const today = dateKey();

  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  if (date > today) throw httpError(400, "You cannot correct a future date");
  if (date < addDays(today, -31)) throw httpError(400, "Corrections are limited to the last 31 days");
  if (!HHMM.test(String(checkIn)) || !HHMM.test(String(checkOut))) throw httpError(400, "Times must be HH:MM");
  if (!reason || !String(reason).trim()) throw httpError(400, "Please explain what happened");

  const inAt = dateAtTime(date, checkIn);
  const outAt = dateAtTime(date, checkOut);
  if (outAt <= inAt) throw httpError(400, "Check-out must be after check-in");
  if (outAt > new Date()) throw httpError(400, "Check-out cannot be in the future");

  if (await Regularization.findOne({ userId: user._id, date, status: "Pending" })) {
    throw httpError(409, "You already have a pending correction for this date");
  }

  const reg = await Regularization.create({
    userId: user._id,
    userName: user.name,
    date,
    requestedCheckIn: inAt,
    requestedCheckOut: outAt,
    reason: String(reason).trim().slice(0, 500),
  });

  await notify.notifyAdmins({
    category: "attendance",
    type: "CORRECTION_REQUEST",
    severity: "info",
    title: `${user.name} requested an attendance correction`,
    message: `${date} · ${checkIn} – ${checkOut}`,
    link: "AdminAttendance",
    data: { regularizationId: String(reg._id) },
  });
  ok(res, { regularization: reg }, 201);
});

const mine = handle(async (req, res) => {
  const items = await Regularization.find({ userId: req.actor.id }).sort({ createdAt: -1 }).limit(60).lean();
  ok(res, { regularizations: items });
});

const cancel = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const reg = await Regularization.findOne({ _id: req.params.id, userId: req.actor.id, status: "Pending" });
  if (!reg) throw httpError(404, "No pending request found");
  reg.status = "Cancelled";
  await reg.save();
  ok(res, { regularization: reg });
});

// GET /api/regularizations?status=Pending   (admin)
const listAll = handle(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = String(req.query.status);
  const items = await Regularization.find(q).sort({ status: 1, createdAt: -1 }).limit(300).lean();
  ok(res, { regularizations: items });
});

// PATCH /api/regularizations/:id/decide  { decision, note }
const decide = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const { decision, note = "" } = req.body || {};
  if (!["Approved", "Rejected"].includes(decision)) throw httpError(400, "decision must be Approved or Rejected");
  const reg = await Regularization.findById(req.params.id);
  if (!reg) throw httpError(404, "Request not found");
  if (reg.status !== "Pending") throw httpError(409, `Already ${reg.status.toLowerCase()}`);

  if (decision === "Approved") {
    await engine.applyManualTimes({
      userId: reg.userId,
      date: reg.date,
      checkIn: reg.requestedCheckIn,
      checkOut: reg.requestedCheckOut,
      by: req.actor.name,
      note: `Correction approved: ${reg.reason}`,
    });
  }
  reg.status = decision;
  reg.decidedBy = req.actor.name;
  reg.decidedAt = new Date();
  reg.adminNote = String(note).trim().slice(0, 300);
  await reg.save();

  if (await User.exists({ _id: reg.userId })) {
    await notify.notifyUser(reg.userId, {
      category: "attendance",
      type: decision === "Approved" ? "CORRECTION_APPROVED" : "CORRECTION_REJECTED",
      severity: decision === "Approved" ? "success" : "warning",
      title: `Attendance correction ${decision.toLowerCase()}`,
      message: `${reg.date}${reg.adminNote ? ` — ${reg.adminNote}` : ""}`,
      link: "Attendance",
    });
  }
  ok(res, { regularization: reg });
});

module.exports = { create, mine, cancel, listAll, decide };
