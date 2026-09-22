// =====================================================
// LOGIN GATE + LOGIN ACTIVITY
//
//  * Wi-Fi staff can only sign in to the CRM from the office network
//    (unless they have approved work-from-home for today).
//  * Every sign-in / sign-out (employees and admins) is written to the login
//    activity log with the device, browser and network it came from.
//
// "Office network" is learned, not configured: it is the address the office
// agents connect from while on the registered office Wi-Fi (plus any extra
// addresses the admin adds under Wi-Fi Setup > Rules).
// =====================================================
const Device = require("../Models/Device.Model");
const OfficeIp = require("../Models/OfficeIp.Model");
const LoginLog = require("../Models/LoginLog.Model");
const { getSettings } = require("./settings.service");
const { loadCalendar } = require("./calendar.service");
const { normalizeIp, sameNetwork, parseUserAgent } = require("../Utils/network");
const { dateKey } = require("../Utils/time");

const LEARNED_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const DEVICE_MATCH_MS = 15 * 60 * 1000;

const MESSAGE =
  "You are not connected to the office Wi-Fi. Please log in through the office Wi-Fi. Mobile data and other Wi-Fi networks are not allowed for office staff.";

/** OFFICE | OUTSIDE | UNVERIFIED (nothing learned yet) | NOT_CHECKED (rule off or not a Wi-Fi employee) */
async function networkFor(user, ip) {
  if (!user || user.attendanceMode !== "WIFI" || !user.branchId) return "NOT_CHECKED";
  const settings = await getSettings();
  if (settings.requireOfficeWifiLogin === false) return "NOT_CHECKED";

  const clean = normalizeIp(ip);
  const learned = await OfficeIp.find({ branchId: user.branchId, lastSeenAt: { $gte: new Date(Date.now() - LEARNED_FOR_MS) } })
    .select("ip")
    .lean();
  const known = [...learned.map((k) => k.ip), ...(settings.extraOfficeIps || [])];
  if (!known.length) return "UNVERIFIED"; // no agent has reported yet, so it cannot be judged
  return known.some((k) => sameNetwork(k, clean)) ? "OFFICE" : "OUTSIDE";
}

/** { allowed, network, message, reason } for a password-verified login attempt */
async function checkLogin(user, ip) {
  const network = await networkFor(user, ip);
  if (network !== "OUTSIDE") return { allowed: true, network, reason: "" };

  // approved work-from-home for today is allowed from anywhere
  try {
    // look at the approved leave itself: the calendar reports a weekly off / holiday ahead of leave,
    // and an approved work-from-home must still count on those days
    const today = dateKey();
    const cal = await loadCalendar(today, today, [user._id]);
    const wfh = (cal.leavesByUser.get(String(user._id)) || []).some(
      (l) => l.type === "Work From Home" && l.fromDate <= today && l.toDate >= today
    );
    if (wfh) return { allowed: true, network, reason: "Approved work from home" };
  } catch (_) {
    /* fall through to blocked */
  }
  return { allowed: false, network, reason: "Not on the office network", message: MESSAGE };
}

/** The employee's registered PC this request most likely came from (same address, seen recently) */
async function matchDevice(userId, ip) {
  const clean = normalizeIp(ip);
  if (!userId || !clean) return null;
  const devices = await Device.find({ userId, status: { $ne: "REVOKED" }, lastSeenAt: { $gte: new Date(Date.now() - DEVICE_MATCH_MS) } })
    .select("hostname lastIp lastSeenAt")
    .lean();
  const exact = devices.find((d) => normalizeIp(d.lastIp) === clean);
  const near = exact || devices.find((d) => sameNetwork(d.lastIp, clean));
  return near ? { id: near._id, name: near.hostname || "Registered PC" } : null;
}

/** Best-effort: the login log must never break signing in */
async function record({ role = "user", user, req, kind = "LOGIN", result = "ALLOWED", reason = "", network = "NOT_CHECKED", verified = null }) {
  try {
    const ip = normalizeIp(req?.ip || req?.socket?.remoteAddress);
    const ua = String(req?.headers?.["user-agent"] || "").slice(0, 300);
    const parsed = parseUserAgent(ua);
    const dev = role === "user" ? await matchDevice(user?._id, ip) : null;
    await LoginLog.create({
      role,
      userId: user?._id || null,
      userName: user?.name || "",
      kind,
      result,
      reason,
      ip,
      userAgent: ua,
      browser: parsed.browser,
      os: parsed.os,
      deviceType: parsed.deviceType,
      network,
      deviceId: dev?.id || null,
      deviceName: dev?.name || "",
      mode: role === "user" ? user?.attendanceMode || "CRM_LOGIN" : "ADMIN",
      branchId: user?.branchId || null,
      verified,
      at: new Date(),
      date: dateKey(),
    });
  } catch (err) {
    console.error("[LoginLog] could not record:", err.message);
  }
}

module.exports = { networkFor, checkLogin, record, matchDevice, MESSAGE };
