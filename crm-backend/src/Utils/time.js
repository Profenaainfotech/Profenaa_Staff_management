// =====================================================
// IST TIME HELPERS
// =====================================================
// India has a single fixed offset (UTC+05:30, no DST), so plain arithmetic is
// used instead of Intl parsing. This keeps every date key ("YYYY-MM-DD") and
// minute-of-day identical no matter what timezone the server runs in
// (a VPS is usually UTC, which would otherwise roll the date at 05:30 IST).
// =====================================================

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

const shifted = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MS);

/** "YYYY-MM-DD" in IST */
function dateKey(d = new Date()) {
  const s = shifted(d);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

/** Minutes since IST midnight (0-1439) */
function minutesOfDay(d = new Date()) {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

function isValidDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Real instant of 00:00:00.000 IST on the given date key */
function startOfDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** Real instant of 23:59:59.999 IST on the given date key */
function endOfDay(key) {
  return new Date(startOfDay(key).getTime() + DAY_MS - 1);
}

function addDays(key, n) {
  return dateKey(new Date(startOfDay(key).getTime() + n * DAY_MS + 12 * 60 * 60 * 1000));
}

/** 0 = Sunday … 6 = Saturday, for an IST date key */
function weekday(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "09:30" -> 570 */
function timeToMinutes(str, fallback = 0) {
  if (!str || typeof str !== "string" || !str.includes(":")) return fallback;
  const [h, m] = str.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
}

/** Real instant for HH:MM on a given IST date key */
function dateAtTime(key, hhmm) {
  return new Date(startOfDay(key).getTime() + timeToMinutes(hhmm) * 60 * 1000);
}

/** Inclusive list of date keys */
function eachDate(fromKey, toKey) {
  const out = [];
  let cur = fromKey;
  let guard = 0;
  while (cur <= toKey && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

/** "2026-09" -> { from: "2026-09-01", to: "2026-09-30" } */
function monthRange(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || "")) return null;
  const [y, m] = monthKey.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${pad(last)}` };
}

function formatMinutes(total = 0) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  return `${Math.floor(t / 60)}h ${t % 60}m`;
}

module.exports = {
  IST_OFFSET_MS,
  DAY_MS,
  dateKey,
  minutesOfDay,
  isValidDateKey,
  startOfDay,
  endOfDay,
  addDays,
  weekday,
  timeToMinutes,
  dateAtTime,
  eachDate,
  monthRange,
  formatMinutes,
};
