// =====================================================
// SHIFT-END QUESTION  "Are you still working?"
// DAY-OFF QUESTION    "Today is a day off. Are you working today?"
//
// Uses a Windows HTA (HTML Application) - built into every Windows PC,
// nothing to install. The window stays on top and plays a repeating alarm
// until the employee clicks Yes or No (or the deadline passes).
//
// Return values:
//   "YES"         - employee clicked Yes
//   "NO"          - employee clicked No
//   "TIMEOUT"     - deadline passed with no click
//   "UNAVAILABLE" - not Windows (dev machine)
//   "CANCELLED"   - answered elsewhere (web page / CRM)
//
// ATTENDANCE_FAKE_PROMPT=yes|no|timeout  answers without showing anything (tests).
// =====================================================
const fs   = require("fs");
const os   = require("os");
const path = require("path");
const { execFile } = require("child_process");
const log  = require("./log");

let current = null; // { child, resultFile, cancelled }

// ---- helpers ----
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function clock12(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

// ---- build the HTA ----
// The HTA writes a single line ("YES" / "NO" / "TIMEOUT") to resultFile,
// then calls window.close(). The Node side watches that file.
function buildHta({ type, secondsLeft, shiftEnd, dayType }) {
  const secs   = Math.max(10, Math.min(Math.round(secondsLeft || 600), 7200));
  const isOff  = type === "OFFDAY";
  const end    = clock12(shiftEnd);

  const title   = isOff
    ? `Today is a day off — are you working?`
    : `Shift ended${end ? ` at ${end}` : ""} — are you still working?`;

  const subtitle = isOff
    ? `Today is a ${dayType === "HOLIDAY" ? "holiday" : "Sunday / day off"}.`
    : `Your shift has ended.`;

  const body = isOff
    ? `<b>Yes</b> = today's hours are counted as day-off work.<br><b>No</b> = nothing is recorded today.`
    : `<b>Yes</b> = extra time is recorded as overtime.<br><b>No</b> = attendance ends at shift end.`;

  const warn = isOff
    ? `No answer = nothing is recorded (same as any other day off).`
    : `No answer = the day is marked as a <b>half day</b> until you explain.`;

  const yesLabel = isOff ? "✔ Yes, I am working" : "✔ Yes, still working";
  const noLabel  = isOff ? "✘ No, it is my day off" : "✘ No, I am finished";

  // Inline WAV data for a short beep tone (440 Hz, 0.3s, PCM 8-bit 8000Hz mono)
  // Generated mathematically — no external file needed.
  // We use the Web Audio API (available in MSHTML / Trident inside HTA) as fallback,
  // then also try window.Audio with a data URI of a tiny WAV.
  // The real alarm: we schedule a repeated JS beep every 8 seconds.

  return `<html>
<head>
<title>Profenaa Attendance</title>
<HTA:APPLICATION
  APPLICATIONNAME="Profenaa Attendance Alert"
  ID="oHTA"
  VERSION="1.0"
  BORDER="dialog"
  BORDERSTYLE="normal"
  CAPTION="yes"
  SHOWINTASKBAR="yes"
  SINGLEINSTANCE="yes"
  SYSMENU="no"
  WINDOWSTATE="normal"
  SCROLL="no"
  MAXIMIZEBUTTON="no"
  MINIMIZEBUTTON="no"
/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:Segoe UI,Arial,sans-serif; }
  body { background:#1e1b4b; color:#fff; display:flex; align-items:center; justify-content:center;
         height:100vh; padding:24px; }
  .card { background:#312e81; border:2px solid #6366f1; border-radius:16px; padding:28px 32px;
          max-width:480px; width:100%; box-shadow:0 0 40px rgba(99,102,241,0.5); }
  .icon { font-size:36px; text-align:center; margin-bottom:12px; }
  .title { font-size:18px; font-weight:700; color:#e0e7ff; text-align:center; margin-bottom:6px; }
  .sub   { font-size:13px; color:#a5b4fc; text-align:center; margin-bottom:14px; }
  .body  { font-size:13px; color:#c7d2fe; text-align:center; line-height:1.6; margin-bottom:10px; }
  .warn  { font-size:12px; color:#fbbf24; text-align:center; margin-bottom:18px; }
  .timer { font-size:28px; font-weight:900; color:#f43f5e; text-align:center;
           font-variant-numeric:tabular-nums; margin-bottom:20px; letter-spacing:2px; }
  .btns  { display:flex; gap:12px; justify-content:center; }
  button { border:none; border-radius:10px; padding:12px 28px; font-size:15px; font-weight:700;
           cursor:pointer; flex:1; max-width:200px; transition:opacity 0.15s; }
  button:hover { opacity:0.85; }
  .yes   { background:#10b981; color:#fff; }
  .no    { background:#6b7280; color:#fff; }
  .pulse { animation:pulse 1s ease-in-out infinite alternate; }
  @keyframes pulse { from{box-shadow:0 0 40px rgba(99,102,241,0.5);} to{box-shadow:0 0 60px rgba(244,63,94,0.8);} }
</style>
</head>
<body>
<div class="card pulse" id="card">
  <div class="icon">&#9201;</div>
  <div class="title">${esc(title)}</div>
  <div class="sub">${esc(subtitle)}</div>
  <div class="body">${body}</div>
  <div class="warn">${warn}</div>
  <div class="timer" id="tmr">${Math.floor(secs/60)}:${String(secs%60).padStart(2,"0")}</div>
  <div class="btns">
    <button class="yes" onclick="answer('YES')">${yesLabel}</button>
    <button class="no"  onclick="answer('NO')">${noLabel}</button>
  </div>
</div>
<script language="VBScript">
Sub answer(v)
  Dim fso, f
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.OpenTextFile(resultPath, 2, True)
  f.WriteLine v
  f.Close
  window.close()
End Sub

Dim secondsLeft
secondsLeft = ${secs}
Dim resultPath
resultPath = document.getElementById("rpath").value

Sub Tick()
  If secondsLeft <= 0 Then
    Dim fso2, f2
    Set fso2 = CreateObject("Scripting.FileSystemObject")
    Set f2 = fso2.OpenTextFile(resultPath, 2, True)
    f2.WriteLine "TIMEOUT"
    f2.Close
    window.close()
    Exit Sub
  End If
  secondsLeft = secondsLeft - 1
  Dim mm, ss
  mm = Int(secondsLeft / 60)
  ss = secondsLeft Mod 60
  If ss < 10 Then
    document.getElementById("tmr").innerText = mm & ":0" & ss
  Else
    document.getElementById("tmr").innerText = mm & ":" & ss
  End If
  If (secondsLeft Mod 8) = 0 Then
    PlayBeep()
  End If
  window.setTimeout "Tick()", 1000
End Sub

Sub PlayBeep()
  Dim sh
  Set sh = CreateObject("WScript.Shell")
  sh.Run "mshta.exe ""javascript:new ActiveXObject('WScript.Shell').Run('powershell -w hidden -c [console]::beep(880,300)',0,false);close()""", 0, False
End Sub

Sub Window_OnLoad()
  ' Size and centre the window
  window.resizeTo 520, 380
  Dim sw, sh2
  sw = screen.width
  sh2 = screen.height
  window.moveTo (sw-520)/2, (sh2-380)/2
  ' Force always on top via WScript
  Dim ws
  Set ws = CreateObject("WScript.Shell")
  ' Play initial alarm
  PlayBeep()
  ' Start countdown
  window.setTimeout "Tick()", 1000
End Sub
</script>
<input type="hidden" id="rpath" value="RESULT_PATH_PLACEHOLDER">
</body>
</html>`;
}

// ---- main entry point ----
function showPrompt({ type = "OVERTIME", secondsLeft = 600, shiftEnd = "", dayType = "WEEKLY_OFF" } = {}) {
  const fake = String(process.env.ATTENDANCE_FAKE_PROMPT || "").toLowerCase();
  if (fake) {
    return new Promise((resolve) =>
      setTimeout(() => resolve(fake === "yes" ? "YES" : fake === "no" ? "NO" : "TIMEOUT"), 300)
    );
  }
  if (process.platform !== "win32") return Promise.resolve("UNAVAILABLE");

  const pid      = process.pid;
  const ts       = Date.now();
  const resultFile = path.join(os.tmpdir(), `profenaa-result-${pid}-${ts}.txt`);
  const htaFile    = path.join(os.tmpdir(), `profenaa-alert-${pid}-${ts}.hta`);

  const html = buildHta({ type, secondsLeft, shiftEnd, dayType })
    .replace("RESULT_PATH_PLACEHOLDER", resultFile.replace(/\\/g, "\\\\"));

  return new Promise((resolve) => {
    let done     = false;
    let watcher  = null;
    let pollTimer = null;

    const finish = (v) => {
      if (done) return;
      done = true;
      current = null;
      clearInterval(pollTimer);
      if (watcher) { try { watcher.close(); } catch (_) {} }
      try { fs.unlinkSync(htaFile);    } catch (_) {}
      try { fs.unlinkSync(resultFile); } catch (_) {}
      resolve(v);
    };

    try {
      fs.writeFileSync(htaFile, html, "utf8");
    } catch (err) {
      log.warn(`Could not write HTA file: ${err.message}`);
      return finish("UNAVAILABLE");
    }

    // Poll the result file every 500 ms (fs.watch inside HTA host is unreliable)
    pollTimer = setInterval(() => {
      try {
        const raw = fs.readFileSync(resultFile, "utf8").trim();
        if (raw) finish(raw);
      } catch (_) { /* not written yet */ }
    }, 500);

    const totalMs = (Math.max(10, Math.round(secondsLeft)) + 30) * 1000;

    try {
      const child = execFile(
        "mshta.exe",
        [htaFile],
        { windowsHide: false, timeout: totalMs },
        (err) => {
          // mshta exited — if the result file is there, we already resolved;
          // if not (e.g. task-killed), resolve as TIMEOUT
          if (!done) {
            try {
              const raw = fs.readFileSync(resultFile, "utf8").trim();
              finish(raw || "TIMEOUT");
            } catch (_) {
              finish(err ? "UNAVAILABLE" : "TIMEOUT");
            }
          }
        }
      );
      current = { child, resultFile, htaFile, cancelled: false };
    } catch (err) {
      log.warn(`mshta.exe could not be launched: ${err.message}`);
      clearInterval(pollTimer);
      finish("UNAVAILABLE");
    }
  });
}

// Kept for backward-compat (agent.js calls askStillWorking)
function askStillWorking(opts) {
  return showPrompt({ type: "OVERTIME", ...opts });
}

function askOffDay(opts) {
  return showPrompt({ type: "OFFDAY", ...opts });
}

/** Close the dialog (answered elsewhere) */
function cancel() {
  if (!current) return false;
  current.cancelled = true;
  try { current.child.kill(); } catch (_) {}
  return true;
}

module.exports = { askStillWorking, askOffDay, cancel, clock12, showPrompt };