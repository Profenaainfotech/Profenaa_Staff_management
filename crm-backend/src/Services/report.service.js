// =====================================================
// REPORTS  - live board, monthly report, employee view
// =====================================================
const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");
const Branch = require("../Models/Branch.Model");
const Device = require("../Models/Device.Model");

const core = require("./attendanceCore");
const engine = require("./attendanceEngine");
const { loadCalendar, dayKind } = require("./calendar.service");
const { getSettings } = require("./settings.service");
const { dateKey, minutesOfDay, timeToMinutes, eachDate, monthRange, weekday } = require("../Utils/time");

const WORKED = ["PRESENT", "WARNING", "LEFT", "LOGGED_OUT", "COMPLETED", "INCOMPLETE"];

const isTracked = (u) => u.isActive !== false;

/**
 * One display code per staff member per day.
 * PRESENT WARNING LEFT COMPLETED HALF_DAY ABSENT INCOMPLETE
 * ON_LEAVE HALF_LEAVE WFH HOLIDAY WEEKLY_OFF NOT_YET_IN  (null = not applicable)
 */
function displayFor({ user, att, date, today, cal, ctx, nowMin }) {
  if (user.joiningDate && date < user.joiningDate) return { code: null };

  if (att && (att.sessions?.length || att.checkIn)) {
    const state = att.wifi?.state;
    if (state === "WARNING") return { code: "WARNING" };
    if (state === "CONNECTED") return { code: "PRESENT" };

    if (att.attendanceSource === "CRM_LOGIN") {
      if (att.status === "Present") return { code: date === today ? "PRESENT" : "INCOMPLETE" };
      if (att.status === "Half Day") return { code: "HALF_DAY" };
      if (att.status === "Absent") return { code: "ABSENT" };
      return { code: "COMPLETED" };
    }

    if (date === today && !att.finalized) return { code: core.isSignedOut(att) ? "LOGGED_OUT" : "LEFT" };
    const status = att.finalized ? att.status : core.effectiveStatus(att, cal.settings);
    if (status === "Half Day") return { code: "HALF_DAY" };
    if (status === "Absent") return { code: "ABSENT" };
    return { code: "COMPLETED" };
  }

  const k = dayKind(user, date, cal);
  if (k) return { code: k.kind, label: k.label };
  if (date > today) return { code: null };
  if (date < today) return { code: "ABSENT" };

  const shiftStart = timeToMinutes(user.shiftStart, 570);
  const overdue = nowMin > shiftStart + Number(cal.settings.lateGraceMinutes ?? 10);
  return { code: "NOT_YET_IN", overdue };
}

const ORDER = {
  WARNING: 0, PRESENT: 1, LEFT: 2, LOGGED_OUT: 2, NOT_YET_IN: 3, ABSENT: 4, INCOMPLETE: 5, HALF_DAY: 6,
  COMPLETED: 7, WFH: 8, HALF_LEAVE: 9, ON_LEAVE: 10, HOLIDAY: 11, WEEKLY_OFF: 12,
};

// ----------------------------------------------------
// Live board
// ----------------------------------------------------
/** Build one board row per user for a given day (shared by the live board and the staff directory) */
async function buildRows(users, day) {
  const today = dateKey();
  const now = new Date();
  const nowMin = minutesOfDay(now);

  const ids = users.map((u) => u._id);
  const [docs, devices, branches, cal] = await Promise.all([
    Attendance.find({ userId: { $in: ids }, date: day }).lean(),
    Device.find({ userId: { $in: ids }, status: { $ne: "REVOKED" } }).lean(),
    Branch.find({}).lean(),
    loadCalendar(day, day, ids),
  ]);

  const docBy = new Map(docs.map((d) => [String(d.userId), d]));
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  const deviceBy = new Map();
  for (const d of devices) {
    const k = String(d.userId);
    const cur = deviceBy.get(k);
    if (!cur || (cur.status !== "ACTIVE" && d.status === "ACTIVE")) deviceBy.set(k, d);
  }

  const rows = users.map((u) => {
    const att = docBy.get(String(u._id)) || null;
    const branch = u.branchId ? branchBy.get(String(u.branchId)) : null;
    const ctx = engine.buildCtx(u, branch, cal.settings);
    const disp = displayFor({ user: u, att, date: day, today, cal, ctx, nowMin });
    const dev = deviceBy.get(String(u._id));
    const worked = att ? (day === today ? core.workedMinutesLive(att, ctx, now) : att.totalMinutes) : 0;

    return {
      userId: u._id,
      name: u.name,
      mobile: u.mobile,
      role: u.role,
      department: u.department || "",
      email: u.email || "",
      employeeCode: u.employeeCode || "",
      joiningDate: u.joiningDate || "",
      dateOfBirth: u.dateOfBirth || "",
      learningMode: u.learningMode || "",
      isActive: u.isActive !== false,
      branch: branch ? { id: branch._id, name: branch.name } : null,
      mode: u.attendanceMode || "CRM_LOGIN",
      shift: { start: u.shiftStart || "09:30", end: u.shiftEnd || "18:30" },
      device: dev ? { id: dev._id, status: dev.status, hostname: dev.hostname, lastSeenAt: dev.lastSeenAt } : null,
      agentOnline: dev?.lastSeenAt ? Date.now() - new Date(dev.lastSeenAt).getTime() < 5 * 60 * 1000 : false,
      display: disp.code,
      label: disp.label || "",
      overdue: Boolean(disp.overdue),
      attendanceId: att?._id || null,
      source: att?.attendanceSource || null,
      checkIn: att?.checkIn || null,
      checkOut: att?.checkOut || null,
      workedMinutes: worked,
      lateMinutes: att?.lateMinutes || 0,
      earlyLogoutMinutes: att?.earlyLogoutMinutes || 0,
      overtimeMinutes: att?.overtimeMinutes || 0,
      dayType: att?.dayType || "WORKING",
      offDayMinutes: att?.offDayMinutes || 0,
      overtimeState: att?.overtime?.state || "NONE",
      reviewState: att?.review?.state || "NONE",
      signedOut: att ? core.isSignedOut(att) : false,
      sessions: att?.sessions?.length || 0,
      ssid: att?.wifi?.ssid || "",
      warningReason: att?.wifi?.state === "WARNING" ? att.wifi.warningReason : null,
      graceDeadline: att?.wifi?.state === "WARNING" ? att.wifi.graceDeadline : null,
      lastHeartbeatAt: att?.wifi?.lastHeartbeatAt || null,
      correctionReason: att?.correctionReason || "",
    };
  });

  return { rows, cal, now, today };
}

async function dailyBoard({ date, branchId, q, mode } = {}) {
  const day = date || dateKey();

  const userQuery = { isActive: { $ne: false } };
  if (branchId) userQuery.branchId = branchId;
  if (mode) userQuery.attendanceMode = mode;
  let users = await User.find(userQuery).select("-password").lean();

  if (q) {
    const needle = String(q).toLowerCase();
    users = users.filter((u) =>
      [u.name, u.mobile, u.role, u.department, u.employeeCode].some((v) => String(v || "").toLowerCase().includes(needle))
    );
  }

  const { rows, cal, now, today } = await buildRows(users, day);

  rows.sort((a, b) => (ORDER[a.display] ?? 99) - (ORDER[b.display] ?? 99) || a.name.localeCompare(b.name));

  const count = (code) => rows.filter((r) => r.display === code).length;
  const lateGrace = Number(cal.settings.lateGraceMinutes ?? 10);
  const summary = {
    total: rows.length,
    present: count("PRESENT"),
    warning: count("WARNING"),
    left: count("LEFT"),
    completed: count("COMPLETED"),
    halfDay: count("HALF_DAY"),
    absent: count("ABSENT") + count("INCOMPLETE"),
    notYetIn: count("NOT_YET_IN"),
    onLeave: count("ON_LEAVE") + count("HALF_LEAVE"),
    wfh: count("WFH"),
    holiday: count("HOLIDAY"),
    weeklyOff: count("WEEKLY_OFF"),
    loggedOut: count("LOGGED_OUT"),
    overtime: rows.filter((r) => r.overtimeMinutes > 0 || r.overtimeState === "CONFIRMED").length,
    offDayWork: rows.filter((r) => r.offDayMinutes > 0).length,
    needsReview: rows.filter((r) => ["PENDING_EXPLANATION", "EXPLAINED"].includes(r.reviewState)).length,
    late: rows.filter((r) => r.lateMinutes > lateGrace).length,
    inOffice: rows.filter((r) => ["PRESENT", "WARNING"].includes(r.display)).length,
    wifiWithoutDevice: rows.filter((r) => r.mode === "WIFI" && (!r.device || r.device.status !== "ACTIVE")).length,
  };

  return { date: day, today, summary, rows, serverTime: now.toISOString() };
}

// ----------------------------------------------------
// Monthly report (all staff) / calendar (one employee)
// ----------------------------------------------------
async function monthlyReport({ month, branchId, userId } = {}) {
  const range = monthRange(month || dateKey().slice(0, 7));
  if (!range) throw Object.assign(new Error("Month must look like 2026-09"), { status: 400 });

  const today = dateKey();
  const to = range.to > today ? today : range.to;
  const userQuery = userId ? { _id: userId } : { isActive: { $ne: false } };
  if (branchId) userQuery.branchId = branchId;
  const users = await User.find(userQuery).select("-password").lean();
  const ids = users.map((u) => u._id);

  const [docs, cal, branches] = await Promise.all([
    Attendance.find({ userId: { $in: ids }, date: { $gte: range.from, $lte: range.to } }).lean(),
    loadCalendar(range.from, range.to, ids),
    Branch.find({}).lean(),
  ]);
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  const docBy = new Map(docs.map((d) => [`${d.userId}|${d.date}`, d]));
  const lateGrace = Number(cal.settings.lateGraceMinutes ?? 10);
  const dates = to >= range.from ? eachDate(range.from, to) : [];
  const nowMin = minutesOfDay();

  const rows = users.map((u) => {
    const branch = u.branchId ? branchBy.get(String(u.branchId)) : null;
    const ctx = engine.buildCtx(u, branch, cal.settings);
    const t = {
      present: 0, halfDays: 0, absent: 0, leave: 0, wfh: 0, holidays: 0, weeklyOffs: 0,
      lateDays: 0, totalMinutes: 0, overtimeMinutes: 0, workingDays: 0,
      overtimeDays: 0, offDayDays: 0, offDayMinutes: 0,
    };
    const days = [];

    for (const date of dates) {
      const att = docBy.get(`${u._id}|${date}`) || null;
      const disp = displayFor({ user: u, att, date, today, cal, ctx, nowMin });
      const c = disp.code;
      if (!c) continue;

      // Sunday / holiday work is extra work: its own bucket, not a "present" working day
      const offWork = Boolean(att && att.dayType && att.dayType !== "WORKING" && (att.sessions?.length || att.checkIn));

      if (offWork) {
        t.offDayDays += 1;
        t.offDayMinutes += att.offDayMinutes || att.totalMinutes || 0;
      } else if (WORKED.includes(c)) t.present += 1;
      else if (c === "HALF_DAY") t.halfDays += 1;
      else if (c === "ABSENT") t.absent += 1;
      else if (c === "ON_LEAVE" || c === "HALF_LEAVE") t.leave += c === "HALF_LEAVE" ? 0.5 : 1;
      else if (c === "WFH") t.wfh += 1;
      else if (c === "HOLIDAY") t.holidays += 1;
      else if (c === "WEEKLY_OFF") t.weeklyOffs += 1;

      if (!offWork && !["HOLIDAY", "WEEKLY_OFF", "NOT_YET_IN"].includes(c)) t.workingDays += 1;
      if (att && att.lateMinutes > lateGrace) t.lateDays += 1;
      if (att) {
        t.totalMinutes += att.totalMinutes || 0;
        t.overtimeMinutes += att.overtimeMinutes || 0;
        if ((att.overtimeMinutes || 0) > 0) t.overtimeDays += 1;
      }

      days.push({
        date,
        display: c,
        label: disp.label || "",
        checkIn: att?.checkIn || null,
        checkOut: att?.checkOut || null,
        totalMinutes: att?.totalMinutes || 0,
        lateMinutes: att?.lateMinutes || 0,
        overtimeMinutes: att?.overtimeMinutes || 0,
        dayType: att?.dayType || "WORKING",
        offDayMinutes: att?.offDayMinutes || 0,
        review: att?.review?.state || "NONE",
        sessions: att?.sessions?.length || 0,
        source: att?.attendanceSource || null,
        correctionReason: att?.correctionReason || "",
      });
    }

    const credited = t.present + t.halfDays * 0.5 + t.wfh + t.leave;
    return {
      userId: u._id,
      name: u.name,
      role: u.role,
      department: u.department || "",
      branch: branch ? branch.name : "",
      ...t,
      attendancePercent: t.workingDays ? Math.round((credited / t.workingDays) * 100) : 0,
      days: userId ? days : undefined,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { month: month || dateKey().slice(0, 7), from: range.from, to: range.to, rows };
}

// ----------------------------------------------------
// The signed-in employee's own live picture
// ----------------------------------------------------
async function userLive(userId) {
  const user = await User.findById(userId).select("-password").lean();
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

  const now = new Date();
  const today = dateKey(now);
  const settings = await getSettings();
  const branch = user.branchId ? await Branch.findById(user.branchId).lean() : null;
  const ctx = engine.buildCtx(user, branch, settings);
  const cal = await loadCalendar(today, today, [user._id]);

  const att = await Attendance.findOne({ userId: user._id, date: today }).lean();
  const devices = await Device.find({ userId: user._id, status: { $ne: "REVOKED" } }).select("-tokenHash").lean();
  const device = devices.find((d) => d.status === "ACTIVE") || devices[0] || null;
  const kind = dayKind(user, today, cal);

  let notice = null;
  if ((user.attendanceMode || "CRM_LOGIN") !== "WIFI") notice = "MODE_NOT_WIFI";
  else if (!branch) notice = "NO_BRANCH";
  else if (!device) notice = "NO_DEVICE";
  else if (device.status === "PENDING") notice = "DEVICE_PENDING";

  const live = att ? engine.liveState(att, ctx, now) : engine.liveState(null, ctx, now);
  const disp = displayFor({ user, att, date: today, today, cal, ctx, nowMin: minutesOfDay(now) });

  return {
    today,
    serverTime: now.toISOString(),
    mode: user.attendanceMode || "CRM_LOGIN",
    notice,
    branch: branch ? { id: branch._id, name: branch.name } : null,
    shift: ctx.shiftStart ? { start: ctx.shiftStart, end: ctx.shiftEnd } : null,
    device: device
      ? {
          id: device._id,
          hostname: device.hostname,
          status: device.status,
          lastSeenAt: device.lastSeenAt,
          lastSsid: device.lastSsid,
          agentOnline: device.lastSeenAt ? Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000 : false,
        }
      : null,
    dayKind: kind,
    display: disp.code,
    live,
    attendance: att
      ? {
          id: att._id,
          date: att.date,
          checkIn: att.checkIn,
          checkOut: att.checkOut,
          status: att.status,
          source: att.attendanceSource,
          totalMinutes: att.totalMinutes,
          totalHours: att.totalHours,
          lateMinutes: att.lateMinutes,
          earlyLogoutMinutes: att.earlyLogoutMinutes,
          overtimeMinutes: att.overtimeMinutes,
          offDayMinutes: att.offDayMinutes || 0,
          dayType: att.dayType || "WORKING",
          review: att.review && att.review.state && att.review.state !== "NONE" ? att.review : null,
          correctionReason: att.correctionReason,
          ssid: att.wifi?.ssid || "",
          sessions: (att.sessions || []).map((s) => ({
            checkIn: s.checkIn,
            checkOut: s.checkOut,
            lastPresentAt: s.lastPresentAt,
            endReason: s.endReason,
            endLabel: s.endReason ? core.END_REASON_LABELS[s.endReason] || s.endReason : null,
            source: s.source,
          })),
        }
      : null,
  };
}

// ----------------------------------------------------
// Overtime and work on days off (Sunday / holidays), kept apart from normal hours
// ----------------------------------------------------
async function extraWork({ from, to, branchId } = {}) {
  const end = to || dateKey();
  const start = from || `${end.slice(0, 7)}-01`;
  const userQuery = { isActive: { $ne: false } };
  if (branchId) userQuery.branchId = branchId;
  const users = await User.find(userQuery).select("name role department branchId").lean();
  const ids = users.map((u) => u._id);

  const [docs, branches] = await Promise.all([
    Attendance.find({
      userId: { $in: ids },
      date: { $gte: start, $lte: end },
      $or: [{ overtimeMinutes: { $gt: 0 } }, { offDayMinutes: { $gt: 0 } }],
    })
      .sort({ date: 1 })
      .lean(),
    Branch.find({}).select("name").lean(),
  ]);
  const branchBy = new Map(branches.map((b) => [String(b._id), b.name]));
  const userBy = new Map(users.map((u) => [String(u._id), u]));

  const byUser = new Map();
  for (const d of docs) {
    const u = userBy.get(String(d.userId));
    if (!u) continue;
    const key = String(d.userId);
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: u._id,
        name: u.name,
        role: u.role,
        department: u.department || "",
        branch: u.branchId ? branchBy.get(String(u.branchId)) || "" : "",
        overtimeMinutes: 0,
        overtimeDays: 0,
        offDayMinutes: 0,
        offDayDays: 0,
        days: [],
      });
    }
    const row = byUser.get(key);
    const off = d.dayType && d.dayType !== "WORKING";
    if (off) {
      row.offDayMinutes += d.offDayMinutes || 0;
      row.offDayDays += 1;
    } else {
      row.overtimeMinutes += d.overtimeMinutes || 0;
      row.overtimeDays += 1;
    }
    row.days.push({
      date: d.date,
      kind: off ? (d.dayType === "HOLIDAY" ? "HOLIDAY" : weekday(d.date) === 0 ? "SUNDAY" : "WEEKLY_OFF") : "OVERTIME",
      minutes: off ? d.offDayMinutes || 0 : d.overtimeMinutes || 0,
      totalMinutes: d.totalMinutes || 0,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
    });
  }

  const rows = [...byUser.values()].sort((a, b) => b.offDayMinutes + b.overtimeMinutes - (a.offDayMinutes + a.overtimeMinutes));
  const summary = rows.reduce(
    (t, r) => ({
      people: t.people + 1,
      overtimeMinutes: t.overtimeMinutes + r.overtimeMinutes,
      overtimeDays: t.overtimeDays + r.overtimeDays,
      offDayMinutes: t.offDayMinutes + r.offDayMinutes,
      offDayDays: t.offDayDays + r.offDayDays,
    }),
    { people: 0, overtimeMinutes: 0, overtimeDays: 0, offDayMinutes: 0, offDayDays: 0 }
  );
  return { from: start, to: end, summary, rows };
}

module.exports = { displayFor, buildRows, dailyBoard, monthlyReport, userLive, extraWork };