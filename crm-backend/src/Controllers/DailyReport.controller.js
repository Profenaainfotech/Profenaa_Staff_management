// =====================================================
// DAILY REPORT (DHR)
// What each employee did during the working day, hour by hour.
//   employee : one report per day - save as draft, then submit
//   admin    : every report, filter by date / name / branch / status,
//              see who has not submitted, reopen a report for correction
// =====================================================
const DailyReport = require("../Models/DailyReport.Model");
const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const tech = require("../Services/techWork.service");
const { dateKey, isValidDateKey, addDays } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ["Completed", "In Progress", "Blocked"];
const EDIT_WINDOW_DAYS = 14;

const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Validate + normalise entries. `strict` (submit) also requires content. */
function cleanEntries(list, strict) {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) throw httpError(400, "entries must be a list");
  if (list.length > 40) throw httpError(400, "A report can have at most 40 entries");
  const out = [];
  list.forEach((e, i) => {
    const row = i + 1;
    const from = clip(e?.from, 5);
    const to = clip(e?.to, 5);
    const task = clip(e?.task, 500);
    if (!strict && !from && !to && !task) return; // ignore blank draft rows
    if (!HHMM.test(from) || !HHMM.test(to)) throw httpError(400, `Row ${row}: enter the time as HH:MM`);
    if (toMin(to) <= toMin(from)) throw httpError(400, `Row ${row}: "to" must be after "from"`);
    if (task.length < (strict ? 5 : 1)) throw httpError(400, `Row ${row}: describe what you did`);
    const status = STATUSES.includes(e?.status) ? e.status : "Completed";
    out.push({
      from,
      to,
      project: clip(e?.project, 80),
      category: clip(e?.category, 40) || "Other",
      task,
      status,
      minutes: toMin(to) - toMin(from),
    });
  });
  out.sort((a, b) => a.from.localeCompare(b.from));
  return out;
}

function cleanSummary(s) {
  if (s === undefined) return undefined;
  return {
    achievements: clip(s?.achievements, 1500),
    blockers: clip(s?.blockers, 1500),
    tomorrowPlan: clip(s?.tomorrowPlan, 1500),
    notes: clip(s?.notes, 1500),
  };
}

function checkDate(date) {
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  const today = dateKey();
  if (date > today) throw httpError(400, "You cannot write a report for a future date");
  if (date < addDays(today, -EDIT_WINDOW_DAYS)) throw httpError(400, `Reports can only be written for the last ${EDIT_WINDOW_DAYS} days`);
}

const sum = (entries) => entries.reduce((t, e) => t + (e.minutes || 0), 0);

// ---------------- employee ----------------
// GET /api/reports/my?date=
const myReport = handle(async (req, res) => {
  const date = req.query.date || dateKey();
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  const [report, att, user] = await Promise.all([
    DailyReport.findOne({ userId: req.payload.id, date }).lean(),
    Attendance.findOne({ userId: req.payload.id, date }).select("checkIn checkOut totalMinutes overtimeMinutes offDayMinutes dayType").lean(),
    User.findById(req.payload.id).select("shiftStart shiftEnd").lean(),
  ]);
  // Technologies Task card: null unless this person has allocated work (their DHR is then unchanged)
  const techCard = await tech.forDay(req.payload.id, date, report);
  if (techCard) techCard.recent = await tech.recent(req.payload.id, dateKey());
  ok(res, {
    date,
    report,
    attendance: att || null,
    shift: user ? { start: user.shiftStart, end: user.shiftEnd } : null,
    editable: !report || report.status === "DRAFT",
    tech: techCard,
  });
});

async function upsert(req, { submit }) {
  const { date } = req.body || {};
  checkDate(date);
  const userId = req.payload.id;

  let doc = await DailyReport.findOne({ userId, date });
  if (doc && doc.status === "SUBMITTED") throw httpError(409, "This report is already submitted. Ask an administrator to reopen it.");

  const user = await User.findById(userId).select("name role department branchId");
  if (!user) throw httpError(404, "Staff member not found");

  const entries = cleanEntries(req.body.entries, submit);
  const summary = cleanSummary(req.body.summary);
  if (!doc) doc = new DailyReport({ userId, userName: user.name, role: user.role, department: user.department || "", branchId: user.branchId || null, date });
  if (entries !== undefined) doc.entries = entries;
  if (summary !== undefined) doc.summary = summary;
  doc.reportedMinutes = sum(doc.entries);

  // Technologies Task card - only for staff who have allocated work on this date.
  // The ticks decide the percentage (ticked / allocated); unticked items count as not done.
  const allocs = await tech.activeAllocations(userId, date);
  const tw = req.body.techWork;
  if (allocs.length) {
    const keep = (doc.techWork?.items || []).filter((i) => i.done).map((i) => i.taskId);
    doc.techWork = tech.snapshot(allocs, tw !== undefined ? tw?.doneIds : keep);
    if (submit && tw?.confirmed !== true) {
      throw httpError(400, "Tick the allocated work you completed today in the Technologies Task card (leave the rest unticked) and confirm it before submitting.");
    }
  } else {
    doc.techWork = tech.snapshot([], []);
  }

  if (submit) {
    if (!doc.entries.length) throw httpError(400, "Add at least one entry describing your work");
    if (clip(doc.summary?.achievements, 1500).length < 10) throw httpError(400, "Write a short summary of what you achieved today");
    const att = await Attendance.findOne({ userId, date }).select("totalMinutes").lean();
    doc.attendanceMinutes = att?.totalMinutes || 0;
    doc.status = "SUBMITTED";
    doc.submittedAt = new Date();
  }
  await doc.save();

  if (submit) {
    await notify.notifyAdmins({
      category: "report",
      type: "DAILY_REPORT_SUBMITTED",
      severity: "info",
      title: `${user.name} submitted the daily report`,
      message: `${date} · ${Math.floor(doc.reportedMinutes / 60)}h ${doc.reportedMinutes % 60}m reported, ${doc.entries.length} entr${doc.entries.length === 1 ? "y" : "ies"}`,
      link: "Daily Reports",
      data: { userId: String(userId), date },
      dedupeKey: `dhr:${userId}:${date}`,
    });
  }
  return doc;
}

// PUT /api/reports/my   { date, entries, summary }      (save draft)
const saveDraft = handle(async (req, res) => {
  const doc = await upsert(req, { submit: false });
  ok(res, { message: "Draft saved", report: doc });
});

// POST /api/reports/my/submit   { date, entries, summary }
const submit = handle(async (req, res) => {
  const doc = await upsert(req, { submit: true });
  ok(res, { message: "Daily report submitted", report: doc });
});

// GET /api/reports/my/list?from=&to=&limit=
const myList = handle(async (req, res) => {
  const q = { userId: req.payload.id };
  if (req.query.from || req.query.to) {
    q.date = {};
    if (req.query.from) q.date.$gte = req.query.from;
    if (req.query.to) q.date.$lte = req.query.to;
  }
  const limit = Math.min(Number(req.query.limit) || 31, 100);
  const reports = await DailyReport.find(q).sort({ date: -1 }).limit(limit).lean();
  ok(res, { reports });
});

// ---------------- admin ----------------
// GET /api/reports?from=&to=&userId=&branchId=&status=&q=&limit=
const adminList = handle(async (req, res) => {
  const { from, to, userId, branchId, status, q } = req.query;
  const query = {};
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  if (isObjectId(userId)) query.userId = userId;
  if (isObjectId(branchId)) query.branchId = branchId;
  if (["DRAFT", "SUBMITTED"].includes(status)) query.status = status;
  if (q) query.userName = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const limit = Math.min(Number(req.query.limit) || 300, 1000);
  const reports = await DailyReport.find(query).sort({ date: -1, userName: 1 }).limit(limit).populate("branchId", "name").lean();
  ok(res, { reports });
});

// GET /api/reports/summary?date=   who submitted, who has not (only people who worked that day)
const summary = handle(async (req, res) => {
  const date = req.query.date || dateKey();
  if (!isValidDateKey(date)) throw httpError(400, "date must be YYYY-MM-DD");
  const [reports, worked, users] = await Promise.all([
    DailyReport.find({ date }).select("userId userName status submittedAt reportedMinutes").lean(),
    Attendance.find({ date, $or: [{ "sessions.0": { $exists: true } }, { checkIn: { $ne: null } }] }).select("userId userName totalMinutes").lean(),
    User.find({ isActive: { $ne: false } }).select("name").lean(),
  ]);
  const submittedIds = new Set(reports.filter((r) => r.status === "SUBMITTED").map((r) => String(r.userId)));
  const draftIds = new Set(reports.filter((r) => r.status === "DRAFT").map((r) => String(r.userId)));
  const active = new Set(users.map((u) => String(u._id)));
  const missing = worked
    .filter((a) => active.has(String(a.userId)) && !submittedIds.has(String(a.userId)))
    .map((a) => ({ userId: a.userId, name: a.userName, totalMinutes: a.totalMinutes, draft: draftIds.has(String(a.userId)) }));
  ok(res, { date, submitted: submittedIds.size, worked: worked.length, missing });
});

// GET /api/reports/:id
const getOne = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const report = await DailyReport.findById(req.params.id).populate("branchId", "name").lean();
  if (!report) throw httpError(404, "Report not found");
  const att = await Attendance.findOne({ userId: report.userId, date: report.date }).select("checkIn checkOut totalMinutes overtimeMinutes offDayMinutes dayType").lean();
  ok(res, { report, attendance: att || null });
});

// PATCH /api/reports/:id/reopen   { note }
const reopen = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const doc = await DailyReport.findById(req.params.id);
  if (!doc) throw httpError(404, "Report not found");
  if (doc.status !== "SUBMITTED") throw httpError(409, "Only a submitted report can be reopened");
  doc.status = "DRAFT";
  doc.reopenedBy = req.admin.name;
  doc.reopenedAt = new Date();
  await doc.save();
  await notify.notifyUser(doc.userId, {
    category: "report",
    type: "DAILY_REPORT_REOPENED",
    severity: "warning",
    title: `Your daily report for ${doc.date} was reopened`,
    message: clip(req.body?.note, 200) || "Please correct it and submit again.",
    link: "Daily Report",
    dedupeKey: `dhr-reopen:${doc._id}:${Date.now()}`,
  });
  ok(res, { message: "Report reopened for the employee", report: doc });
});

module.exports = { myReport, saveDraft, submit, myList, adminList, summary, getOne, reopen };