// =====================================================
// ATTENDANCE MONITOR  (background scheduler)
// =====================================================
//  every 15 s : notice silent devices, expire grace periods, shift-end cap
//  every  1 min: no-show reminders, admin morning digest
//  every  5 min: close out finished days
// All jobs are idempotent (dedupe keys / flags), so a restart never double-notifies.
// =====================================================
const User = require("../Models/User.Model");
const Attendance = require("../Models/Attendance.Model");
const Device = require("../Models/Device.Model");
const DailyReport = require("../Models/DailyReport.Model");

const engine = require("./attendanceEngine");
const notify = require("./notification.service");
const { getSettings } = require("./settings.service");
const { loadCalendar, dayKind } = require("./calendar.service");
const { dailyBoard } = require("./report.service");
const { dateKey, minutesOfDay, timeToMinutes } = require("../Utils/time");

const SWEEP_MS = Number(process.env.MONITOR_INTERVAL_MS || 15000);

let sweepTimer = null;
let sweeping = false;
let tickCount = 0;
let digestSentFor = null;

async function noShowReminders(now) {
  const settings = await getSettings();
  const wait = Number(settings.noShowReminderMinutes) || 0;
  if (!wait) return;

  const today = dateKey(now);
  const nowMin = minutesOfDay(now);

  const users = await User.find({
    isActive: { $ne: false },
    attendanceMode: "WIFI",
    branchId: { $ne: null },
  })
    .select("_id name shiftStart shiftEnd branchId joiningDate")
    .lean();

  const due = users.filter(
    (u) =>
      nowMin >= timeToMinutes(u.shiftStart, 570) + wait &&
      nowMin < timeToMinutes(u.shiftEnd, 1110) &&
      (!u.joiningDate || u.joiningDate <= today)
  );
  if (!due.length) return;

  const ids = due.map((u) => u._id);
  const [docs, cal, devices] = await Promise.all([
    Attendance.find({ userId: { $in: ids }, date: today }).select("userId").lean(),
    loadCalendar(today, today, ids),
    Device.find({ userId: { $in: ids }, status: "ACTIVE" }).select("userId").lean(),
  ]);
  const seen = new Set(docs.map((d) => String(d.userId)));
  const hasDevice = new Set(devices.map((d) => String(d.userId)));

  for (const u of due) {
    if (seen.has(String(u._id)) || dayKind(u, today, cal)) continue;
    await notify.notifyUser(u._id, {
      category: "attendance",
      type: "NO_SHOW_REMINDER",
      severity: "warning",
      title: "Your attendance has not started",
      message: hasDevice.has(String(u._id))
        ? "We have not detected your computer on the office Wi-Fi yet. Make sure the attendance agent is running and you are connected to the office network. If you are working from elsewhere, request leave or a correction."
        : "You have not registered your computer for Wi-Fi attendance yet. Open Attendance and register this device.",
      link: "Attendance",
      dedupeKey: `noshow:${u._id}:${today}`,
    });
  }
}

async function morningDigest(now) {
  const settings = await getSettings();
  const at = settings.morningDigestTime;
  if (!at) return;

  const today = dateKey(now);
  if (digestSentFor === today) return;

  const start = timeToMinutes(at, 660);
  const nowMin = minutesOfDay(now);
  if (nowMin < start || nowMin >= start + 180) return;

  const { summary, rows } = await dailyBoard({ date: today });
  if (!summary.total || summary.holiday + summary.weeklyOff === summary.total) {
    digestSentFor = today;
    return;
  }

  const overdue = rows.filter((r) => r.display === "NOT_YET_IN" && r.overdue).map((r) => r.name);
  const here = summary.inOffice + summary.left + summary.completed + summary.halfDay;
  const names = overdue.slice(0, 6).join(", ");
  await notify.notifyAdmins({
    category: "attendance",
    type: "MORNING_DIGEST",
    severity: overdue.length ? "warning" : "info",
    title: "Today's attendance so far",
    message:
      `${here} in · ${summary.late} late · ${overdue.length} not in yet · ${summary.onLeave + summary.wfh} on leave/WFH` +
      (names ? `\nNot in yet: ${names}${overdue.length > 6 ? ` +${overdue.length - 6} more` : ""}` : ""),
    link: "AdminAttendance",
    dedupeKey: `digest:${today}`,
  });
  digestSentFor = today;
}

/** Remind people who worked today but have not submitted their Daily Report once their shift is over */
async function reportReminders(now) {
  const settings = await getSettings();
  const wait = Number(settings.dailyReportReminderMinutes) || 0;
  if (!wait) return;

  const today = dateKey(now);
  const nowMin = minutesOfDay(now);
  const docs = await Attendance.find({ date: today, "sessions.0": { $exists: true } }).select("userId").lean();
  if (!docs.length) return;

  const ids = docs.map((d) => d.userId);
  const [users, done] = await Promise.all([
    User.find({ _id: { $in: ids }, isActive: { $ne: false } }).select("_id shiftEnd").lean(),
    DailyReport.find({ date: today, status: "SUBMITTED", userId: { $in: ids } }).select("userId").lean(),
  ]);
  const submitted = new Set(done.map((r) => String(r.userId)));

  for (const u of users) {
    if (submitted.has(String(u._id))) continue;
    if (nowMin < timeToMinutes(u.shiftEnd, 1110) + wait) continue;
    await notify.notifyUser(u._id, {
      category: "report",
      type: "DAILY_REPORT_REMINDER",
      severity: "warning",
      title: "Please submit your daily report",
      message: "Write down what you worked on today. It only takes a few minutes and your manager can see it straight away.",
      link: "Daily Report",
      dedupeKey: `dhr-remind:${u._id}:${today}`,
    });
  }
}

async function minuteJobs(now) {
  await noShowReminders(now);
  await reportReminders(now);
  await morningDigest(now);
  if (tickCount % 5 === 0) await engine.finalizePastDays(dateKey(now));
}

async function tick() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();
    await engine.runMonitorTick(now);
    tickCount += 1;
    if (tickCount % Math.max(1, Math.round(60000 / SWEEP_MS)) === 0) {
      await minuteJobs(now);
    }
  } catch (err) {
    console.error("[Monitor] error:", err.message);
  } finally {
    sweeping = false;
  }
}

function start() {
  if (sweepTimer) return;
  console.log(`[Monitor] attendance sweep every ${SWEEP_MS / 1000}s`);
  sweepTimer = setInterval(tick, SWEEP_MS);
  sweepTimer.unref?.();
}

function stop() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = { start, stop, tick, noShowReminders, morningDigest, reportReminders };
