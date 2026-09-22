// =====================================================
// CALENDAR  - holidays, weekly offs and approved leave
// =====================================================
const Holiday = require("../Models/Holiday.Model");
const Leave = require("../Models/Leave.Model");
const { getSettings } = require("./settings.service");
const { eachDate, weekday } = require("../Utils/time");

/** Load everything needed to classify days between two date keys */
async function loadCalendar(fromKey, toKey, userIds = null) {
  const settings = await getSettings();
  const holidays = await Holiday.find({ date: { $gte: fromKey, $lte: toKey } }).lean();

  const leaveQuery = { status: "Approved", fromDate: { $lte: toKey }, toDate: { $gte: fromKey } };
  if (userIds) leaveQuery.userId = { $in: userIds };
  const leaves = await Leave.find(leaveQuery).lean();

  const leavesByUser = new Map();
  for (const l of leaves) {
    const k = String(l.userId);
    if (!leavesByUser.has(k)) leavesByUser.set(k, []);
    leavesByUser.get(k).push(l);
  }

  return { settings, holidays, leavesByUser };
}

/**
 * HOLIDAY | WEEKLY_OFF | ON_LEAVE | HALF_LEAVE | WFH | null
 * Order matters: a holiday beats a weekly off beats leave.
 */
function dayKind(user, date, cal) {
  const branchId = user.branchId ? String(user.branchId) : null;
  const holiday = cal.holidays.find((h) => h.date === date && (!h.branchId || String(h.branchId) === branchId));
  if (holiday) return { kind: "HOLIDAY", label: holiday.name };

  if ((cal.settings.weeklyOffDays || []).includes(weekday(date))) return { kind: "WEEKLY_OFF", label: "Weekly off" };

  const leave = (cal.leavesByUser.get(String(user._id)) || []).find((l) => l.fromDate <= date && l.toDate >= date);
  if (leave) {
    if (leave.type === "Work From Home") return { kind: "WFH", label: leave.type };
    if (leave.halfDay) return { kind: "HALF_LEAVE", label: `${leave.type} (half day)` };
    return { kind: "ON_LEAVE", label: leave.type };
  }
  return null;
}

/** Working days a leave request would consume (weekly offs and holidays are free) */
function countLeaveDays(user, fromKey, toKey, halfDay, cal) {
  if (halfDay && fromKey === toKey) {
    const k = dayKind(user, fromKey, { ...cal, leavesByUser: new Map() });
    return k ? 0 : 0.5;
  }
  let days = 0;
  for (const d of eachDate(fromKey, toKey)) {
    if (!dayKind(user, d, { ...cal, leavesByUser: new Map() })) days += 1;
  }
  return days;
}

module.exports = { loadCalendar, dayKind, countLeaveDays };
