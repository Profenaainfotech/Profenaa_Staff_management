// =====================================================
// TECHNOLOGIES TASK - calculation + helpers
//
// One rule, used everywhere (staff card, submit, admin views):
//     daily % = ticked items / allocated items x 100
// Nothing ticked = 0 %.  Allocated items that are not ticked simply count as not done.
// The server always recalculates from the ticks - a percentage sent by the browser is never trusted.
// =====================================================
const TechTask = require("../Models/TechTask.Model");
const DailyReport = require("../Models/DailyReport.Model");
const { addDays } = require("../Utils/time");

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (ticked, total) => (total > 0 ? round1((ticked / total) * 100) : null);

/** Allocations that are live for this person on this date. */
function activeAllocations(userId, date) {
  return TechTask.find({
    assignedTo: userId,
    isActive: true,
    startDate: { $lte: date },
    $or: [{ endDate: "" }, { endDate: { $exists: false } }, { endDate: { $gte: date } }],
  })
    .sort({ kind: 1, createdAt: 1 })
    .lean();
}

/** Counts and percentages for a list of { kind, done } items. */
function summarise(items) {
  const count = (list) => ({ total: list.length, ticked: list.filter((i) => i.done).length });
  const all = count(items);
  const task = count(items.filter((i) => i.kind === "Task"));
  const past = count(items.filter((i) => i.kind === "PastWork"));
  return {
    allocated: all.total,
    ticked: all.ticked,
    percent: pct(all.ticked, all.total),
    taskAllocated: task.total,
    taskTicked: task.ticked,
    taskPercent: pct(task.ticked, task.total),
    pastAllocated: past.total,
    pastTicked: past.ticked,
    pastPercent: pct(past.ticked, past.total),
  };
}

/** The copy stored on the daily report: only ids that really are allocated can be ticked. */
function snapshot(allocs, doneIds = []) {
  const done = new Set((Array.isArray(doneIds) ? doneIds : []).map(String));
  const items = allocs.map((a) => ({
    taskId: a._id,
    title: a.title,
    kind: a.kind,
    technology: a.technology || "",
    done: done.has(String(a._id)),
  }));
  return { items, ...summarise(items) };
}

/**
 * What the staff member's DHR card shows for a date.
 *   null                        -> no allocated work, no card (their DHR is unchanged)
 *   submitted report            -> the frozen copy stored when it was submitted
 *   draft / not started         -> today's live allocations, with any ticks already saved
 */
async function forDay(userId, date, report) {
  if (report?.status === "SUBMITTED") {
    const tw = report.techWork;
    if (!tw || !(tw.allocated > 0)) return null;
    return { locked: true, ...tw };
  }
  const allocs = await activeAllocations(userId, date);
  if (!allocs.length) return null;
  const saved = new Map((report?.techWork?.items || []).map((i) => [String(i.taskId), i.done === true]));
  const items = allocs.map((a) => ({
    taskId: a._id,
    title: a.title,
    description: a.description || "",
    kind: a.kind,
    technology: a.technology || "",
    referenceUrl: a.referenceUrl || "",
    done: saved.get(String(a._id)) === true,
  }));
  return { locked: false, items, ...summarise(items) };
}

/** Last N days of this person's submitted percentages (for the small history strip). */
async function recent(userId, todayKey, days = 7) {
  const from = addDays(todayKey, -(days - 1));
  const rows = await DailyReport.find({ userId, status: "SUBMITTED", date: { $gte: from }, "techWork.allocated": { $gt: 0 } })
    .select("date techWork.percent techWork.ticked techWork.allocated")
    .sort({ date: 1 })
    .lean();
  const list = rows.map((r) => ({ date: r.date, percent: r.techWork.percent, ticked: r.techWork.ticked, allocated: r.techWork.allocated }));
  const avg = list.length ? round1(list.reduce((t, r) => t + (r.percent || 0), 0) / list.length) : null;
  return { days: list, average: avg };
}

module.exports = { round1, pct, activeAllocations, summarise, snapshot, forDay, recent };