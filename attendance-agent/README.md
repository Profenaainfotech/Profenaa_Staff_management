# Profenaa Attendance Agent (Windows)

Runs quietly on each employee's PC. Every ~90 seconds it notes which Wi-Fi network
the PC is on and sends it to the CRM. **All attendance decisions are made by the
server**; the agent is only a sensor. It never stores your CRM password.

## Install (per computer, 2 minutes)

1. Install **Node.js LTS** (https://nodejs.org).
2. Copy this folder to the PC (e.g. `C:\ProfenaaAgent`).
3. Copy `config.example.json` to `config.json` and set your server address:
   ```json
   { "serverUrl": "https://crm.yourdomain.com" }
   ```
4. Double-click **`install-startup.bat`**. It asks for the employee's CRM username and
   password **once**, registers the PC, and makes the agent start automatically at every
   Windows sign-in.
5. **Windows 11 24H2 or newer:** turn ON *Settings > Privacy & security > Location*.
   Without it Windows hides the Wi-Fi name and attendance cannot be recorded.
6. The first computer of an employee is approved automatically. Extra computers wait for
   an administrator (CRM > Wi-Fi Setup > Devices).

## Commands

| Command | What it does |
|---|---|
| `node index.js` | run the agent |
| `node index.js --setup` | register / re-register this PC |
| `node index.js --wifi` | show the SSID and **BSSID** this PC sees (use it to register access points) |
| `node index.js --status` | device, queue size and what the server says |
| `uninstall-startup.bat` | stop auto-start |

Logs: `%APPDATA%\ProfenaaAttendance\agent.log`.

## Shift end: "Are you still working?"
When the shift is over and the computer is still on the office Wi-Fi, a Yes / No box appears on top of everything:

- **Yes** - the time from then on is recorded as overtime (you are asked again about every hour).
- **No** - attendance ends at shift end.
- **No answer for 10 minutes** - attendance ends at shift end and the day is a half day until you explain in the CRM (Attendance page) and an administrator approves it.

Closing the laptop or leaving the Wi-Fi instead is never penalised. If a box cannot be shown (not Windows), a notice tells you to answer on the CRM Attendance page. Every notice from the agent also plays the normal Windows notification sound.

**Logging out of the CRM** stops the timer: the PC being on the office Wi-Fi does not restart it until you sign in again.

## What happens when things go wrong

| Situation | Result |
|---|---|
| Internet / server down | Readings are saved on disk with their real times and sent later; the server restores the session if you were there the whole time. |
| Laptop sleeps / lid closed | No readings arrive, so your session ends at your last reading. Attendance resumes when you are back. |
| Switch to a phone hotspot | A warning pop-up appears. Reconnect within the grace period (default 5 min) and nothing is lost. |
| Wi-Fi name hidden by Windows | You get a pop-up asking you to enable Location. |
| PC clock is wrong | The agent corrects timestamps using the server's time. |

## Security

- Only a random **device token** is stored (the server keeps just its hash). Revoking the
  device in the CRM stops it immediately.
- Do not copy `%APPDATA%\ProfenaaAttendance` between computers: each PC must register itself.
- The agent only reads the *network name and access-point ID*. It does not read files,
  browsing, screens or keystrokes.

## Tests

`npm test` is not needed on employee PCs. Developers: `node test/wifi.test.js` (parser) and
`node test/agent.test.js` and `node test/prompt.test.js` (need `../crm-backend` and a database whose name contains "test").
