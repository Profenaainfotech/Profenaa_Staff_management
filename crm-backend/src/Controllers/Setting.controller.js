const { getSettings, updateSettings } = require("../Services/settings.service");
const notify = require("../Services/notification.service");
const User = require("../Models/User.Model");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const get = handle(async (req, res) => {
  const s = await getSettings();
  ok(res, { settings: s });
});

const update = handle(async (req, res) => {
  const result = await updateSettings(req.body || {});
  if (result.errors) throw httpError(400, result.errors.join(". "));
  ok(res, { settings: result.settings });
});

// POST /api/settings/test-notification  { userId }
// Sends a real test notification + a voice-speak trigger to a specific staff member.
// Used from the Rules tab so admins can confirm the notification pipeline works.
const testNotification = handle(async (req, res) => {
  const { userId } = req.body || {};
  if (!userId || !isObjectId(userId)) throw httpError(400, "Provide a valid staff userId.");
  const user = await User.findById(userId).select("name _id");
  if (!user) throw httpError(404, "Staff member not found.");
  await notify.notifyUser(user._id, {
    category: "attendance",
    type: "TEST_NOTIFICATION",
    severity: "info",
    title: "🔔 Test notification",
    message: `This is a test from the admin. If you can read this and your browser said it out loud, notifications and voice are working correctly.`,
    link: "Attendance",
    data: { voice: true, sound: true, test: true },
    dedupeKey: `test-notif:${user._id}:${Date.now()}`,
  });
  ok(res, { message: `Test notification sent to ${user.name}. Ask them to confirm they saw and heard it.` });
});

module.exports = { get, update, testNotification };