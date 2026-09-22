// =====================================================
// SHIFT-END QUESTION  "Are you still working?"
//
// Windows: a real Yes / No dialog that stays on top, with its own countdown
// (WScript.Shell.Popup - built into Windows, nothing to install).
//   Yes -> "YES"   No -> "NO"   nobody clicked -> "TIMEOUT"
// Other systems (development only): "UNAVAILABLE" - the agent then shows a
// notice pointing at the Attendance page instead.
//
// ATTENDANCE_FAKE_PROMPT=yes|no|timeout  answers without showing anything (tests).
// =====================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const log = require("./log");

let current = null; // { child, file, cancel }

const vbs = (s) => String(s).replace(/"/g, '""').replace(/[^\x20-\x7e]/g, "?"); // plain ASCII keeps VBScript happy

function clock12(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function askStillWorking({ secondsLeft = 600, shiftEnd = "" } = {}) {
  const secs = Math.max(5, Math.min(Math.round(secondsLeft), 3600));

  const fake = String(process.env.ATTENDANCE_FAKE_PROMPT || "").toLowerCase();
  if (fake) {
    return new Promise((resolve) => setTimeout(() => resolve(fake === "yes" ? "YES" : fake === "no" ? "NO" : "TIMEOUT"), 300));
  }
  if (process.platform !== "win32") return Promise.resolve("UNAVAILABLE");

  const mins = Math.max(1, Math.round(secs / 60));
  const end = clock12(shiftEnd);
  const lines = [
    `Your shift ${end ? `ended at ${end}` : "has ended"}.`,
    "",
    "Are you still working?",
    "",
    "YES = I am still working (recorded as overtime)",
    "NO = I am finished for the day",
    "",
    `If you do not answer within ${mins} minute${mins === 1 ? "" : "s"}, your attendance ends at shift end and the day is marked as a half day until you explain.`,
  ];
  // one VBScript string per line, joined with vbCrLf (a raw line break would end the statement)
  const message = lines.map((l) => `"${vbs(l)}"`).join(" & vbCrLf & ");

  const script =
    'Set sh = CreateObject("WScript.Shell")\r\n' +
    `r = sh.Popup(${message}, ${secs}, "Profenaa Attendance - Are you still working?", 4 + 32 + 4096 + 65536)\r\n` +
    "WScript.Echo r\r\n";

  const file = path.join(os.tmpdir(), `profenaa-ask-${process.pid}-${Date.now()}.vbs`);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      current = null;
      try {
        fs.unlinkSync(file);
      } catch (_) {
        /* already gone */
      }
      resolve(v);
    };
    try {
      fs.writeFileSync(file, script, "latin1");
      const child = execFile("cscript", ["//nologo", file], { windowsHide: false, timeout: (secs + 20) * 1000 }, (err, stdout) => {
        if (err && !current?.cancelled) {
          log.warn(`Shift-end dialog could not be shown: ${err.message}`);
          return finish("UNAVAILABLE");
        }
        if (current?.cancelled) return finish("CANCELLED");
        const code = String(stdout || "").trim();
        finish(code === "6" ? "YES" : code === "7" ? "NO" : "TIMEOUT");
      });
      current = { child, cancelled: false };
    } catch (err) {
      log.warn(`Shift-end dialog error: ${err.message}`);
      finish("UNAVAILABLE");
    }
  });
}

/** Close the dialog (the question was answered elsewhere, e.g. on the web page) */
function cancel() {
  if (!current) return false;
  current.cancelled = true;
  try {
    current.child.kill();
  } catch (_) {
    /* already closed */
  }
  return true;
}

module.exports = { askStillWorking, cancel, clock12 };
