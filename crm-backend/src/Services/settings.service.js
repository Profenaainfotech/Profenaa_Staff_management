const Setting = require("../Models/Setting.Model");
const { LEAVE_TYPES } = require("../Models/Leave.Model");

const KEY = "attendance";
let cache = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000;

async function getSettings(force = false) {
  if (!force && cache && Date.now() - cachedAt < TTL_MS) return cache;

  let doc = await Setting.findOne({ key: KEY }).lean();
  if (!doc) {
    await Setting.updateOne({ key: KEY }, { $setOnInsert: { key: KEY } }, { upsert: true });
    doc = await Setting.findOne({ key: KEY }).lean();
  }
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

const intField = (min, max) => (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
};

const VALIDATORS = {
  fullDayMinutes: intField(60, 1440),
  halfDayMinutes: intField(30, 1440),
  lateGraceMinutes: intField(0, 240),
  autoCheckoutAfterShiftMinutes: intField(0, 720),
  earliestCheckInBeforeShiftMinutes: intField(0, 360),
  noShowReminderMinutes: intField(0, 480),
  maxActiveDevicesPerUser: intField(1, 5),
  autoApproveFirstDevice: (v) => (typeof v === "boolean" ? v : undefined),
  requireOfficeWifiLogin: (v) => (typeof v === "boolean" ? v : undefined),
  overtimePromptMinutes: intField(1, 120),
  overtimeRecheckMinutes: intField(15, 480),
  dailyReportReminderMinutes: intField(0, 240),
  noResponseAction: (v) => (["HALF_DAY", "FLAG_ONLY"].includes(v) ? v : undefined),
  extraOfficeIps: (v) => {
    if (!Array.isArray(v)) return undefined;
    const list = v.map((x) => String(x).trim()).filter(Boolean);
    return list.length <= 20 && list.every((x) => /^[0-9a-fA-F:.]{3,45}$/.test(x)) ? [...new Set(list)] : undefined;
  },
  morningDigestTime: (v) => (v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : undefined),
  weeklyOffDays: (v) => {
    if (!Array.isArray(v)) return undefined;
    const days = [...new Set(v.map(Number))];
    return days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ? days.sort() : undefined;
  },
  leaveQuotas: (v) => {
    if (!v || typeof v !== "object") return undefined;
    const out = {};
    for (const type of LEAVE_TYPES) {
      if (v[type] === undefined) continue;
      const n = Number(v[type]);
      if (!Number.isFinite(n) || n < 0 || n > 366) return undefined;
      out[type] = n;
    }
    return out;
  },
};

/** Whitelist + validate. Returns { patch, errors } */
function sanitize(input = {}) {
  const patch = {};
  const errors = [];
  for (const [key, fn] of Object.entries(VALIDATORS)) {
    if (input[key] === undefined) continue;
    const v = fn(input[key]);
    if (v === undefined) errors.push(`Invalid value for ${key}`);
    else patch[key] = v;
  }
  return { patch, errors };
}

async function updateSettings(input) {
  const { patch, errors } = sanitize(input);
  if (errors.length) return { errors };

  const current = await getSettings(true);
  const full = patch.fullDayMinutes ?? current.fullDayMinutes;
  const half = patch.halfDayMinutes ?? current.halfDayMinutes;
  if (half >= full) return { errors: ["Half-day minutes must be smaller than full-day minutes"] };

  await Setting.updateOne({ key: KEY }, { $set: patch }, { upsert: true });
  cache = null;
  return { settings: await getSettings(true) };
}

module.exports = { getSettings, updateSettings, sanitize };
