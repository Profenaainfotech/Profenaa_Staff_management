// Desktop pop-ups (Windows toasts via PowerShell BurntToast-style XML,
// falling back to node-notifier, then to log-only).
// "alarm" level = persistent sound loop until dismissed.
const log = require("./log");

let notifier = null;
try {
  notifier = require("node-notifier");
} catch (_) {
  notifier = null;
}

// ---- PowerShell XML toast (Windows 10/11, no install needed) ----
// These use the native Action Centre and stay visible until dismissed.
const { execFile } = require("child_process");

function psToast(title, message, { sound = true, urgent = false } = {}) {
  if (process.platform !== "win32") return;
  // Scenario="alarm" keeps it on screen and plays the alarm sound on repeat
  const scenario = urgent ? "alarm" : "reminder";
  const xml = [
    `<toast scenario="${scenario}" launch="profenaa">`,
    `  <visual><binding template="ToastGeneric">`,
    `    <text>${escXml(title)}</text>`,
    `    <text>${escXml(message)}</text>`,
    `  </binding></visual>`,
    sound ? `  <audio src="ms-winsoundevent:Notification.Looping.Alarm" loop="true"/>` : `  <audio silent="true"/>`,
    `</toast>`,
  ].join("");

  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('${xml.replace(/'/g, "''")}')
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
$toast.Tag = "ProfenaaAttendance"
$toast.Group = "Attendance"
$mgr = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Profenaa Attendance")
$mgr.Show($toast)
`;

  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
    { windowsHide: true, timeout: 10000 },
    (err) => { if (err) fallbackToast(title, message, { sound }); }
  );
}

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fallbackToast(title, message, { sound = true } = {}) {
  if (!notifier || process.env.ATTENDANCE_NO_TOAST) return;
  try {
    notifier.notify({
      title,
      message,
      appID: "Profenaa Attendance",
      sound: sound && !process.env.ATTENDANCE_NO_SOUND,
    });
  } catch (_) {}
}

/**
 * Show a Windows notification.
 * @param {string}  title
 * @param {string}  message
 * @param {object}  [opts]
 * @param {boolean} [opts.urgent=false]   true = scenario:"alarm", loops sound until dismissed
 * @param {boolean} [opts.sound=true]
 */
function toast(title, message, { urgent = false, sound = true } = {}) {
  log.info(`NOTICE${urgent ? " [URGENT]" : ""}: ${title} - ${message}`);
  if (process.env.ATTENDANCE_NO_TOAST) return;
  if (process.platform === "win32") {
    psToast(title, message, { sound, urgent });
  } else {
    fallbackToast(title, message, { sound });
  }
}

module.exports = { toast };