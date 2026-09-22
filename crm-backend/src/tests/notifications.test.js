// =====================================================
// NOTIFICATION DELETE TEST      node src/tests/notifications.test.js
//
//  - delete ONE notification (read or unread), deleting twice is harmless
//  - delete by range: today / last 7 days / all time, optionally "only what I have read"
//  - counts for each choice (shown in the panel before deleting)
//  - only ever the caller's OWN notifications; login required; bad input refused
//  - "today" is India time; "last 7 days" is a rolling 7 x 24 hours
//  - an alert with a duplicate guard (dedupeKey) stays hidden and is NOT re-created;
//    every other notification is really removed
//  - old notifications saved before this change still show up and can be deleted
//
// !! WIPES the database it connects to; refuses unless the name contains "test".
// =====================================================
require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");

const app = require("../../app");
const Notification = require("../Models/Notification.Model");
const notify = require("../Services/notification.service");
const { dateKey, startOfDay } = require("../Utils/time");

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log("  ✓", name);
  } else {
    failures.push(name);
    console.log("  ✗", name, extra !== undefined ? `\n      got: ${JSON.stringify(extra)}` : "");
  }
}
const section = (t) => console.log(`\n${t}`);

let BASE = "";
async function call(method, p, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {};
  try {
    json = await res.json();
  } catch (_) {
    /* empty body */
  }
  return { status: res.status, body: json };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  if (!/test/i.test(mongoose.connection.name)) throw new Error(`Refusing to wipe database "${mongoose.connection.name}" (name must contain "test")`);
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  const N = "/api/notifications";

  await call("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  const adminLogin = (await call("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" } })).body;
  const admin = adminLogin.accessToken || adminLogin.token;
  const mk = async (name, mobile) => (await call("POST", "/api/staff", { token: admin, body: { name, mobile, password: "secret123", role: "Developer", shiftStart: "09:30", shiftEnd: "18:30" } })).body.user;
  const A = await mk("Yokesh", "9300000001");
  const B = await mk("Praveen", "9300000002");
  const login = async (name) => {
    const b = (await call("POST", "/api/UserAccounts/Log-in", { body: { name, password: "secret123" } })).body;
    return b.accessToken || b.token;
  };
  const tA = await login("Yokesh");
  const tB = await login("Praveen");
  const adminId = (await mongoose.connection.db.collection("admins").findOne({}))?._id || (await mongoose.connection.db.collection("adminaccounts").findOne({}))?._id;
  check("admin and two staff are ready", Boolean(admin && A?._id && B?._id && tA && tB));

  // Insert straight into the collection so every notification gets exactly the age we want
  // (and so "old" ones can be saved WITHOUT the new deletedAt field, like real old data).
  const put = async (recipientType, recipientId, title, { ago = 0, at, read = false, dedupeKey, legacy = false } = {}) => {
    const createdAt = at || new Date(Date.now() - ago);
    const doc = { recipientType, recipientId: new mongoose.Types.ObjectId(String(recipientId)), category: "system", type: "TEST", severity: "info", title, message: "", link: "", data: {}, createdAt, updatedAt: createdAt, readAt: read ? createdAt : null };
    if (!legacy) {
      doc.dedupeKey = dedupeKey || null;
      doc.deletedAt = null;
    }
    const r = await Notification.collection.insertOne(doc);
    return String(r.insertedId);
  };

  // ---- Yokesh's notifications, aged on purpose --------------------------------
  const todayStart = startOfDay(dateKey()); // 00:00 IST today
  const early = new Date(Math.min(Date.now() - 1000, todayStart.getTime() + 60 * 1000)); // "earlier today", also right after midnight
  const T1 = await put("user", A._id, "Today - unread", { at: early });
  const T2 = await put("user", A._id, "Today - read", { at: early, read: true });
  await put("user", A._id, "Yesterday 23:59", { at: new Date(todayStart.getTime() - 60 * 1000) }); // just before IST midnight
  await put("user", A._id, "3 days ago - read", { ago: 3 * DAY, read: true });
  await put("user", A._id, "6 days 23 hours ago", { ago: 6 * DAY + 23 * HOUR });
  await put("user", A._id, "7 days 1 hour ago", { ago: 7 * DAY + HOUR });
  await put("user", A._id, "10 days ago - read", { ago: 10 * DAY, read: true });
  // ...and other people's, which must never be touched
  await put("user", B._id, "Praveen 1", { at: early });
  await put("user", B._id, "Praveen 2", { at: early });
  await put("admin", adminId, "Admin 1", { at: early });
  await put("admin", adminId, "Admin 2", { at: early });

  // ================================================== COUNTS
  section("Counts for each choice");
  let r = await call("GET", `${N}/counts`, { token: tA });
  check("Today = 2, Last 7 days = 5, All time = 7", r.status === 200 && r.body.counts.today === 2 && r.body.counts.week === 5 && r.body.counts.all === 7, r.body);
  check("'Yesterday 23:59' is NOT today (India midnight), and 7 days 1 hour ago is NOT in the last 7 days", r.body.counts.today === 2 && r.body.counts.week === 5);
  r = await call("GET", `${N}/counts?readOnly=1`, { token: tA });
  check("counts when only read ones are chosen: 1 / 2 / 3", r.body.counts.today === 1 && r.body.counts.week === 2 && r.body.counts.all === 3, r.body);
  r = await call("GET", `${N}/counts`, { token: tB });
  check("each person only counts their own", r.body.counts.all === 2, r.body);
  r = await call("GET", `${N}/counts`);
  check("counts need a login (401)", r.status === 401);

  // ================================================== DELETE ONE
  section("Delete one notification");
  r = await call("GET", `${N}?limit=50`, { token: tA });
  check("the list shows all 7, 4 of them unread", r.body.notifications.length === 7 && r.body.unreadCount === 4, r.body.unreadCount);
  r = await call("DELETE", `${N}/${T1}`, { token: tA });
  check("an UNREAD notification can be deleted", r.status === 200 && r.body.deleted === 1, r.body);
  r = await call("GET", `${N}?limit=50`, { token: tA });
  check("...it is gone and the unread number went down", r.body.notifications.length === 6 && r.body.unreadCount === 3 && !r.body.notifications.some((n) => n.title === "Today - unread"), r.body.unreadCount);
  r = await call("DELETE", `${N}/${T1}`, { token: tA });
  check("deleting it a second time is harmless", r.status === 200 && r.body.deleted === 0, r);
  const praveenId = String((await Notification.findOne({ title: "Praveen 1" }))._id);
  r = await call("DELETE", `${N}/${praveenId}`, { token: tA });
  check("somebody else's notification cannot be deleted", r.status === 200 && r.body.deleted === 0, r);
  check("...it is still there for its owner", (await call("GET", N, { token: tB })).body.notifications.length === 2);
  r = await call("DELETE", `${N}/not-an-id`, { token: tA });
  check("a broken id is refused (400)", r.status === 400, r);
  r = await call("DELETE", `${N}/${T2}`);
  check("no login: refused (401)", r.status === 401, r);

  // ================================================== BY RANGE
  section("Delete by Today / Last 7 days / All time");
  r = await call("DELETE", N, { token: tA });
  check("no range given: refused with a clear message (400)", r.status === 400 && /Choose what to delete/.test(r.body.message), r.body);
  r = await call("DELETE", `${N}?range=yesterday`, { token: tA });
  check("an unknown range is refused (400)", r.status === 400, r.body);
  r = await call("DELETE", `${N}?range=today`);
  check("no login: refused (401)", r.status === 401);

  r = await call("DELETE", `${N}?range=today&readOnly=1`, { token: tA });
  check("Today, only the read ones: deletes just 'Today - read'", r.status === 200 && r.body.deleted === 1, r.body);
  r = await call("GET", `${N}?limit=50`, { token: tA });
  check("...everything else is still there", r.body.notifications.length === 5 && r.body.notifications.some((n) => n.title === "Yesterday 23:59"), r.body.notifications.map((n) => n.title));

  r = await call("DELETE", `${N}?range=week`, { token: tA });
  check("Last 7 days: deletes yesterday, 3 days ago and 6 days 23 hours ago (3)", r.status === 200 && r.body.deleted === 3, r.body);
  r = await call("GET", `${N}?limit=50`, { token: tA });
  check("...older ones stay (7 days 1 hour and 10 days)", r.body.notifications.length === 2 && r.body.notifications.every((n) => /7 days 1 hour|10 days/.test(n.title)), r.body.notifications.map((n) => n.title));

  r = await call("DELETE", `${N}?range=all`, { token: tA });
  check("All time: deletes the rest (2)", r.status === 200 && r.body.deleted === 2, r.body);
  r = await call("GET", `${N}?limit=50`, { token: tA });
  check("...the list is empty and nothing is unread", r.body.notifications.length === 0 && r.body.unreadCount === 0, r.body);
  r = await call("DELETE", `${N}?range=all`, { token: tA });
  check("deleting when nothing is left is harmless (0)", r.status === 200 && r.body.deleted === 0, r.body);

  section("Only the caller's own");
  r = await call("GET", N, { token: tB });
  check("Praveen still has both of his", r.body.notifications.length === 2, r.body.notifications.length);
  r = await call("GET", N, { token: admin });
  check("the admin still has both of theirs", r.body.notifications.length === 2, r.body.notifications.length);
  r = await call("DELETE", `${N}?range=all`, { token: admin });
  check("the admin deleting 'all time' removes only the admin's", r.body.deleted === 2 && (await call("GET", N, { token: tB })).body.notifications.length === 2, r.body);

  // ================================================== DEDUPE
  section("Alerts cannot come back after deleting them");
  const payload = { category: "attendance", type: "LATE", severity: "warning", title: "Checked in late", message: "160 min after shift start", dedupeKey: `late:${A._id}:${dateKey()}` };
  const first = await notify.notifyUser(A._id, payload);
  check("the alert is created the first time", Boolean(first));
  r = await call("GET", N, { token: tA });
  check("...and shows in the list", r.body.notifications.length === 1 && r.body.unreadCount === 1);
  r = await call("DELETE", `${N}?range=all`, { token: tA });
  check("the person deletes it", r.body.deleted === 1);
  r = await call("GET", N, { token: tA });
  check("...it disappears from the list and the unread number", r.body.notifications.length === 0 && r.body.unreadCount === 0, r.body);
  const again = await notify.notifyUser(A._id, payload);
  check("the next attendance check tries to raise the same alert: it is NOT created again", again === null);
  r = await call("GET", N, { token: tA });
  check("...so it does not reappear", r.body.notifications.length === 0 && r.body.unreadCount === 0, r.body);
  const marker = await Notification.collection.findOne({ dedupeKey: payload.dedupeKey });
  check("...the deleted alert is kept only as a hidden marker", Boolean(marker?.deletedAt));
  r = await call("POST", `${N}/read-all`, { token: tA });
  check("'mark all read' ignores hidden ones", r.status === 200 && r.body.updated === 0, r.body);

  await notify.notifyUser(A._id, { title: "Plain message", message: "no duplicate guard" });
  r = await call("DELETE", `${N}?range=today`, { token: tA });
  check("a notification WITHOUT a duplicate guard is deleted for real", r.body.deleted === 1 && (await Notification.countDocuments({ title: "Plain message" })) === 0, r.body);
  const other = await notify.notifyUser(A._id, { ...payload, dedupeKey: `late:${A._id}:another-day` });
  check("a different day's alert is still created", Boolean(other));

  // ================================================== OLD DATA + OLD BUTTON
  section("Notifications saved before this change");
  await call("DELETE", `${N}?range=all`, { token: tA });
  const legacyUnread = await put("user", A._id, "Old unread", { at: early, legacy: true });
  await put("user", A._id, "Old read", { at: early, read: true, legacy: true });
  r = await call("GET", N, { token: tA });
  check("old notifications (no deletedAt / dedupeKey saved) still show up", r.body.notifications.length === 2 && r.body.unreadCount === 1, r.body);
  r = await call("GET", `${N}/counts`, { token: tA });
  check("...and are counted", r.body.counts.today === 2, r.body);
  r = await call("DELETE", `${N}/read`, { token: tA });
  check("the older 'clear read' request still works (only the read one)", r.status === 200 && r.body.deleted === 1, r.body);
  r = await call("DELETE", `${N}/${legacyUnread}`, { token: tA });
  check("an old notification can be deleted, and is really removed", r.body.deleted === 1 && !(await Notification.collection.findOne({ _id: new mongoose.Types.ObjectId(legacyUnread) })), r.body);

  server.close();
  await mongoose.disconnect();
  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("FAILED:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("\nTEST CRASHED:", err);
  process.exit(2);
});
