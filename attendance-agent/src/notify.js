// Desktop pop-ups (Windows toasts). Optional: if node-notifier is not installed
// the agent still works, it just only logs.
const log = require("./log");

let notifier = null;
try {
  // eslint-disable-next-line global-require
  notifier = require("node-notifier");
} catch (_) {
  notifier = null;
}

function toast(title, message) {
  log.info(`NOTICE: ${title} - ${message}`);
  if (!notifier || process.env.ATTENDANCE_NO_TOAST) return;
  try {
    // sound: true = the normal Windows notification sound, so every alert is heard
    notifier.notify({ title, message, appID: "Profenaa Attendance", sound: !process.env.ATTENDANCE_NO_SOUND });
  } catch (_) {
    /* never let a pop-up break attendance */
  }
}

module.exports = { toast };
