// =====================================================
// BIRTHDAY REMINDERS  (background scheduler)
//
// Once a day, look at every active staff member's date of birth and tell the
// admins about anyone whose birthday is exactly 2 days away, so there is time
// to plan something. Idempotent (one notification per person per year, via a
// dedupe key), so a restart or an extra sweep never sends it twice.
// =====================================================
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const { dateKey, addDays } = require("../Utils/time");

const SWEEP_MS = Number(process.env.BIRTHDAY_SWEEP_MS || 60 * 60 * 1000); // once an hour is plenty
const LEAD_DAYS = 2;

let sweepTimer = null;
let sweeping = false;
let checkedFor = null; // today's date key we have already swept (avoids re-scanning every tick)

/** "1990-06-17" (any year) turns birthday-this-year into "2026-06-17" */
function birthdayThisYear(dob, year) {
  const m = Number(dob.slice(5, 7));
  const d = Number(dob.slice(8, 10));
  if (!m || !d) return null;
  // clamp Feb 29 in a non-leap year to Feb 28, so nobody is skipped entirely
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function sweep(now = new Date()) {
  const today = dateKey(now);
  if (today === checkedFor) return; // already handled today
  checkedFor = today;

  const targetKey = addDays(today, LEAD_DAYS);
  const year = Number(targetKey.slice(0, 4)); // the target date's year (matters across a year boundary)

  const staff = await User.find({ isActive: { $ne: false }, dateOfBirth: { $nin: ["", null] } }).select("_id name dateOfBirth").lean();
  const soon = staff.filter((u) => birthdayThisYear(u.dateOfBirth, year) === targetKey);
  if (!soon.length) return;

  for (const u of soon) {
    await notify.notifyAdmins({
      category: "staff",
      type: "BIRTHDAY_UPCOMING",
      severity: "info",
      title: `${u.name}'s birthday is coming up`,
      message: `${u.name}'s birthday is in ${LEAD_DAYS} days (${targetKey}).`,
      link: "Staff Directory",
      data: { userId: String(u._id), date: targetKey },
      dedupeKey: `birthday:${u._id}:${year}`,
    });
  }
}

function start() {
  if (sweepTimer) return;
  const tick = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await sweep();
    } catch (err) {
      console.error("[BirthdayReminder] sweep failed:", err.message);
    } finally {
      sweeping = false;
    }
  };
  tick(); // run once immediately, then on the interval
  sweepTimer = setInterval(tick, SWEEP_MS);
}

function stop() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = { start, stop, sweep };
