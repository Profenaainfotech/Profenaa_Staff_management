// =====================================================================
// TECHNOLOGIES TASKS (allocated work + past work)
//   admin : allocate work to particular staff, edit / stop / delete it,
//           see every allocated person's daily percentage (performance)
//   staff : GET /my - the work allocated to me (the Daily Report shows the tick card)
// The daily percentage itself is calculated from the ticks in the DHR - see
// Services/techWork.service.js.
// =====================================================================
const TechTask = require("../Models/TechTask.Model");
const DailyReport = require("../Models/DailyReport.Model");
const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const tech = require("../Services/techWork.service");
const { dateKey, isValidDateKey, addDays, eachDate } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const KINDS = ["Task", "PastWork"];
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

function cleanUrl(v) {
  const url = clip(v, 300);
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return url;
  } catch {
    throw httpError(400, "The reference link must start with http:// or https://");
  }
}

// ---------------- admin: allocate ----------------
// POST /api/tech-tasks   { title, description, kind, technology, referenceUrl, startDate, endDate, userIds[] }
const create = handle(async (req, res) => {
  const title = clip(req.body.title, 150);
  if (!title) throw httpError(400, "Title is required");
  const kind = req.body.kind || "Task";
  if (!KINDS.includes(kind)) throw httpError(400, "kind must be Task or PastWork");

  const userIds = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String))].filter(isObjectId);
  if (!userIds.length) throw httpError(400, "Choose at least one staff member");

  const today = dateKey();
  const startDate = req.body.startDate || today;
  const endDate = req.body.endDate || "";
  if (!isValidDateKey(startDate)) throw httpError(400, "Start date must be YYYY-MM-DD");
  if (endDate && !isValidDateKey(endDate)) throw httpError(400, "End date must be YYYY-MM-DD");
  if (endDate && endDate < startDate) throw httpError(400, "End date cannot be before the start date");

  const users = await User.find({ _id: { $in: userIds }, isActive: { $ne: false } }).select("name").lean();
  if (!users.length) throw httpError(400, "None of the chosen staff members can be found");

  const base = {
    title,
    description: clip(req.body.description, 1500),
    kind,
    technology: clip(req.body.technology, 60),
    referenceUrl: cleanUrl(req.body.referenceUrl),
    assignedBy: req.admin?.name || "Admin",
    startDate,
    endDate,
  };
  const docs = await TechTask.insertMany(users.map((u) => ({ ...base, assignedTo: u._id, assignedToName: u.name })));

  await Promise.all(
    users.map((u) =>
      notify.notifyUser(u._id, {
        category: "task",
        type: "TECH_TASK_ALLOCATED",
        severity: "info",
        title: kind === "PastWork" ? "Past work allocated to you" : "Technologies task allocated to you",
        message: `${title} - tick it in your Daily Report on the days you complete it.`,
        link: "Daily Report",
      })
    )
  );
  ok(res, { message: `Allocated to ${docs.length} staff member${docs.length === 1 ? "" : "s"}`, tasks: docs }, 201);
});

// ---------------- admin: list ----------------
// GET /api/tech-tasks?userId=&kind=&status=active|inactive|all
const list = handle(async (req, res) => {
  const { userId, kind, status = "active" } = req.query;
  const q = {};
  if (isObjectId(userId)) q.assignedTo = userId;
  if (KINDS.includes(kind)) q.kind = kind;
  if (status === "active") q.isActive = true;
  if (status === "inactive") q.isActive = false;
  const tasks = await TechTask.find(q).sort({ assignedToName: 1, kind: 1, createdAt: -1 }).limit(1000).lean();
  ok(res, { tasks });
});

// ---------------- admin: edit ----------------
// PUT /api/tech-tasks/:id   (any of: title, description, kind, technology, referenceUrl, startDate, endDate, isActive)
const update = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const doc = await TechTask.findById(req.params.id);
  if (!doc) throw httpError(404, "Allocation not found");
  const b = req.body || {};

  if (b.title !== undefined) {
    const t = clip(b.title, 150);
    if (!t) throw httpError(400, "Title is required");
    doc.title = t;
  }
  if (b.description !== undefined) doc.description = clip(b.description, 1500);
  if (b.kind !== undefined) {
    if (!KINDS.includes(b.kind)) throw httpError(400, "kind must be Task or PastWork");
    doc.kind = b.kind;
  }
  if (b.technology !== undefined) doc.technology = clip(b.technology, 60);
  if (b.referenceUrl !== undefined) doc.referenceUrl = cleanUrl(b.referenceUrl);
  if (b.startDate !== undefined) {
    if (!isValidDateKey(b.startDate)) throw httpError(400, "Start date must be YYYY-MM-DD");
    doc.startDate = b.startDate;
  }
  if (b.endDate !== undefined) {
    if (b.endDate && !isValidDateKey(b.endDate)) throw httpError(400, "End date must be YYYY-MM-DD");
    doc.endDate = b.endDate || "";
  }
  if (doc.endDate && doc.endDate < doc.startDate) throw httpError(400, "End date cannot be before the start date");
  if (b.isActive !== undefined) doc.isActive = Boolean(b.isActive);
  await doc.save();
  ok(res, { message: "Allocation updated", task: doc });
});

// ---------------- admin: delete ----------------
// Reports that were already submitted keep their own copy of the ticks, so history is not lost.
const remove = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const doc = await TechTask.findByIdAndDelete(req.params.id);
  if (!doc) throw httpError(404, "Allocation not found");
  ok(res, { message: "Allocation deleted" });
});

// ---------------- staff: my allocations ----------------
// GET /api/tech-tasks/my
const mine = handle(async (req, res) => {
  const today = dateKey();
  const [tasks, recent] = await Promise.all([tech.activeAllocations(req.actor.id, today), tech.recent(req.actor.id, today)]);
  ok(res, { tasks, recent });
});

// ---------------- admin: performance ----------------
// GET /api/tech-tasks/performance?from=&to=&userId=
//
// For every day in the range on which the person had allocated work:
//   - a SUBMITTED report        -> its percentage (ticked / allocated)
//   - worked that day, but no submitted report (or nothing ticked) -> 0 %
//   - today, report not submitted yet -> "Pending" (left out of the average until submitted)
//   - did not work that day (no attendance, no report) -> the day is skipped
// avgPercent is the average of the daily percentages.
// With userId, every day also carries the exact items that were ticked / not ticked.
const performance = handle(async (req, res) => {
  const today = dateKey();
  const to = req.query.to || today;
  const from = req.query.from || addDays(to, -6);
  if (!isValidDateKey(from) || !isValidDateKey(to)) throw httpError(400, "from / to must be YYYY-MM-DD");
  if (from > to) throw httpError(400, "from must not be after to");
  if (eachDate(from, to).length > 93) throw httpError(400, "Choose a range of at most 3 months");
  const only = isObjectId(req.query.userId) ? req.query.userId : null;

  const allocQuery = { startDate: { $lte: to }, $or: [{ endDate: "" }, { endDate: { $exists: false } }, { endDate: { $gte: from } }] };
  if (only) allocQuery.assignedTo = only;
  const allocs = await TechTask.find(allocQuery).lean();
  const ids = [...new Set(allocs.map((a) => String(a.assignedTo)))];
  if (!ids.length) return ok(res, { from, to, staff: [], top: null, attention: [] });

  const [users, reports, attendance] = await Promise.all([
    User.find({ _id: { $in: ids }, isActive: { $ne: false } }).select("name role department branchId").lean(),
    DailyReport.find({ userId: { $in: ids }, date: { $gte: from, $lte: to } }).select("userId date status techWork").lean(),
    Attendance.find({ userId: { $in: ids }, date: { $gte: from, $lte: to }, $or: [{ "sessions.0": { $exists: true } }, { checkIn: { $ne: null } }] }).select("userId date").lean(),
  ]);

  const reportOf = new Map(reports.map((r) => [`${r.userId}|${r.date}`, r]));
  const worked = new Set(attendance.map((a) => `${a.userId}|${a.date}`));
  const dates = eachDate(from, to).filter((d) => d <= today);

  const staff = users.map((u) => {
    const mine = allocs.filter((a) => String(a.assignedTo) === String(u._id));
    const days = [];
    for (const date of dates) {
      const key = `${u._id}|${date}`;
      const rep = reportOf.get(key);
      const snap = rep?.status === "SUBMITTED" && rep.techWork?.allocated > 0 ? rep.techWork : null;
      if (snap) {
        days.push({
          date,
          status: "Submitted",
          percent: snap.percent ?? 0,
          ticked: snap.ticked,
          allocated: snap.allocated,
          taskPercent: snap.taskPercent,
          pastPercent: snap.pastPercent,
          ...(only ? { items: snap.items } : {}),
        });
        continue;
      }
      const live = mine.filter((a) => a.isActive && a.startDate <= date && (!a.endDate || a.endDate >= date));
      if (!live.length) continue;
      if (date === today && rep?.status !== "SUBMITTED") {
        days.push({ date, status: "Pending", percent: null, ticked: 0, allocated: live.length });
      } else if (worked.has(key) || rep) {
        days.push({ date, status: "Missing", percent: 0, ticked: 0, allocated: live.length });
      }
    }
    const counted = days.filter((d) => d.percent !== null);
    const avgPercent = counted.length ? tech.round1(counted.reduce((t, d) => t + d.percent, 0) / counted.length) : null;
    const todayRow = days.find((d) => d.date === today);
    return {
      userId: u._id,
      name: u.name,
      role: u.role || "",
      department: u.department || "",
      currentAllocated: mine.filter((a) => a.isActive && a.startDate <= today && (!a.endDate || a.endDate >= today)).length,
      daysCounted: counted.length,
      missingDays: days.filter((d) => d.status === "Missing").length,
      avgPercent,
      todayPercent: todayRow ? todayRow.percent : null,
      todayStatus: todayRow ? todayRow.status : null,
      days,
    };
  });

  staff.sort((a, b) => (b.avgPercent ?? -1) - (a.avgPercent ?? -1) || a.name.localeCompare(b.name));
  staff.forEach((s, i) => (s.rank = s.avgPercent === null ? null : i + 1));

  const ranked = staff.filter((s) => s.avgPercent !== null);
  ok(res, {
    from,
    to,
    staff,
    top: ranked[0] ? { userId: ranked[0].userId, name: ranked[0].name, avgPercent: ranked[0].avgPercent } : null,
    // people the admin should look at: low average or reports missing
    attention: ranked.filter((s) => s.avgPercent < 50 || s.missingDays > 0).map((s) => ({ userId: s.userId, name: s.name, avgPercent: s.avgPercent, missingDays: s.missingDays })),
  });
});

module.exports = { create, list, update, remove, mine, performance };