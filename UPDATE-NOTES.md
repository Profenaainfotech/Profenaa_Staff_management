# Update 2 - already applied in this folder

Every file below is already replaced / added here. Your `.env`, `package.json`, lock files, `node_modules` and uploads were not touched.
To run: restart the backend and the frontend dev server. On each staff PC copy the four agent files (below) and restart the PC. No `npm install` is needed.

## NEW (16)
- `attendance-agent/src/prompt.js`
- `attendance-agent/test/prompt.test.js`
- `crm-backend/src/Controllers/DailyReport.controller.js`
- `crm-backend/src/Models/DailyReport.Model.js`
- `crm-backend/src/Models/LoginLog.Model.js`
- `crm-backend/src/Models/OfficeIp.Model.js`
- `crm-backend/src/Services/loginGate.service.js`
- `crm-backend/src/Utils/network.js`
- `crm-backend/src/routers/DailyReport.route.js`
- `crm-backend/src/tests/phase2.integration.test.js`
- `crm-frontend/App/vite-project/src/Component/wifi/AdminDailyReports.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/DailyReport.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/LoginActivity.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/OvertimePanel.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/ShiftEnd.jsx`
- `crm-frontend/App/vite-project/src/lib/sound.js`

## REPLACED (38)
- `attendance-agent/README.md`
- `attendance-agent/package.json`
- `attendance-agent/src/agent.js`
- `attendance-agent/src/notify.js`
- `attendance-agent/test/wifi.test.js`
- `crm-backend/.env.example`
- `crm-backend/app.js`
- `crm-backend/src/Controllers/Admin.controller.js`
- `crm-backend/src/Controllers/Agent.controller.js`
- `crm-backend/src/Controllers/AttendanceCenter.controller.js`
- `crm-backend/src/Controllers/User.controller.js`
- `crm-backend/src/Models/Attendance.Model.js`
- `crm-backend/src/Models/AttendanceEvent.Model.js`
- `crm-backend/src/Models/Device.Model.js`
- `crm-backend/src/Models/Notification.Model.js`
- `crm-backend/src/Models/Setting.Model.js`
- `crm-backend/src/Services/attendanceCore.js`
- `crm-backend/src/Services/attendanceEngine.js`
- `crm-backend/src/Services/attendanceMonitor.js`
- `crm-backend/src/Services/report.service.js`
- `crm-backend/src/Services/settings.service.js`
- `crm-backend/src/routers/Agent.route.js`
- `crm-backend/src/routers/Attendance.route.js`
- `crm-backend/src/tests/attendanceCore.test.js`
- `crm-frontend/App/vite-project/src/Component/AdminDashboard.jsx`
- `crm-frontend/App/vite-project/src/Component/UserDashboard.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/AdminAttendanceHub.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/Corrections.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/DayDetail.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/LiveBoard.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/MonthCalendar.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/MonthlyReport.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/NotificationCenter.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/StaffDirectory.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/WifiAttendance.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/WifiSetup.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/events.js`
- `crm-frontend/App/vite-project/src/Component/wifi/ui.jsx`

`crm-backend/.env.example`: your own file was kept; only a `TRUST_PROXY` note was added at the end.

**Agent PCs need only:** `attendance-agent/src/agent.js`, `src/notify.js`, `src/prompt.js` (new), `package.json`.

## 5-minute check
1. An employee (agent running, on office Wi-Fi) logs out: Attendance > Live board shows **Logged out** and the timer stops.
2. Log in from a phone on mobile data: refused with the office-Wi-Fi message (the office network is learned from the agents, so one office PC must report first).
3. Header button says **Create Staff** and opens the Staff Directory form.
4. Attendance > **Login activity**: every sign-in with device, browser and network.
5. After a shift ends with the PC still on Wi-Fi, the Yes / No box appears (also on the employee's Attendance page).
6. **Daily Report** (employee) and **Daily Reports** (admin, filters by date / name / branch / status).
7. **Overtime & Sunday**: admin > Performance (top) and Attendance > Overtime & Sunday.

## Settings (Wi-Fi Setup > Rules)
Shift-end answer time (10 min) and re-ask interval (60 min); if nobody answers: half day until explained + approved (default) or only flag; require office Wi-Fi to sign in; extra office addresses; Daily Report reminder.

## Good to know
- Behind nginx / a cloud proxy: add `TRUST_PROXY=1` to `crm-backend/.env`. Not needed when the API is reached directly.
- Until an office PC has reported once, logins are allowed (the office network is not known yet).
- Sunday is the only off day; holidays you add under Leaves & holidays also count as days off.
- Closing the laptop or leaving the Wi-Fi at shift end is never penalised; only "PC still on, nobody answered".
- Notification sound needs one click on the page first (browser rule); the bell has a mute switch.
- Logging out now also checks a CRM-login employee out (the backend always did; the button never asked).
