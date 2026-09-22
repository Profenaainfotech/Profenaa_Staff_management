# Profenaa CRM - Wi-Fi attendance, notifications, leaves, staff directory

Employees are marked present automatically while their PC is on the office Wi-Fi.
Grace periods, lunch breaks, reconnects, offline queues and overnight PCs are handled
by the server. Existing staff stay on CRM-login attendance until you switch them, so
nobody suddenly shows absent.

## Set up (in this order)

**1. Backend** (`crm-backend`)

```
copy .env.example .env   # Windows. Then edit .env: set your database name in MONGO_URI (local MongoDB, as in Compass)
npm install
npm run seed             # default rules + your 3 branches and access points (safe to re-run)
npm run dev
```

JWT_SECRET / ADMIN_JWT_SECRET are optional locally: without them the old built-in values keep every current
login working. For a public server set both to long random text (this logs everyone out once).
The backend only reads a file named exactly `.env` (not `.env.example`).

**2. Frontend** (`crm-frontend/App/vite-project`, note the two extra folders) - run `npm install` once, then `npm run dev`.
Optional `VITE_API_URL` changes the API address for the NEW screens only. Your existing
screens still call `http://localhost:8000` exactly as before; change that for production as you did before.

**3. In the admin panel**

1. **Wi-Fi Setup > Branches & Wi-Fi**: check each branch's access points. Udumalpet only has its 2.4 GHz AP; add the 5 GHz one if it exists.
2. **Wi-Fi Setup > Rules**: review working hours, late/grace, weekly off, leave allowances.
3. **Staff Directory**: give each person a branch and set mode "Office Wi-Fi" (select several, then change in bulk). CLI alternative: `npm run enable-wifi -- --branch "Pollachi" --all --dry-run`.
4. **Attendance** now has Live board / Monthly report / Corrections / Audit log. Your original screen is the **Records** tab.

**4. Each employee PC** (`attendance-agent`, see its README): install Node.js LTS, set `serverUrl` in `config.json`, double-click `install-startup.bat`. On Windows 11 24H2 or newer turn on Settings > Privacy & security > Location.

## Tests

- Backend: `npm test` (unit) and `node src/tests/integration.test.js` (121 checks). The integration test wipes the database it connects to and refuses unless the DB name contains "test".
- Agent: `node test/wifi.test.js` and `node test/agent.test.js` (about 2 minutes, includes a real 65 s server outage).

## Bugs fixed in the original code

Task controller required a wrongly-cased model file (would not boot on Linux). Attendance schema silently dropped late/early/overtime/correction fields. Re-login overwrote the first check-in time. Admin "Delete user" called a route that did not exist. Admin "Edit user" only saved the password. create-account, update-password and admin-register had no authentication. Admin JWT secret was hardcoded with no expiry. MONGO_URI was printed to the console.

## Other small changes in original files (additive)

- `Project.controller.js`: notifies staff when a project is assigned or added to the pool.
- `requireAuth.js`: a deactivated account can no longer use an old token.
- `token.js`: admin secret can be set with `ADMIN_JWT_SECRET` (old value stays as the default).
- `AdminDashboard.jsx` / `UserDashboard.jsx`: new imports, sidebar items, tabs and the new activity bell, plus two swapped tags so the Attendance tab goes through a wrapper that still shows your ORIGINAL screen for CRM-login staff. Only 2 original lines were replaced.

## Known limits - please check

- Tested on FerretDB (a MongoDB-compatible stand-in), not real MongoDB. Back up your database in Compass first, and try the seed on a copy (change the database name in MONGO_URI) before your real one.
- The Windows `netsh` test samples are reconstructed from the known output format. Run `node index.js --wifi` on one real Windows 10 and one Windows 11 PC to confirm.
- The UI was tested by rendering it against the real API (27 screen tests plus your two dashboards), not visually in a browser. Click through both dashboards once.
- Never register a phone hotspot or personal router as an office access point.
- Admins still have no attendance profile (separate collection, unchanged).
- `get-All-Profiles` is still unauthenticated because `ProjectManagement.jsx` calls it without a token, and the auth middleware still logs decoded JWTs. Both left as they were.
- Per-user locking is per process, so multiple server instances would need sticky routing.
- The MVP's `agent/config.json` contained a real email and password in plaintext. Rotate that password.

## UPDATED files (already in your project - replace them)

- `crm-backend/app.js`
- `crm-backend/package.json`
- `crm-backend/package-lock.json`
- `crm-backend/src/server.js`
- `crm-backend/src/Controllers/Attendance.controller.js`
- `crm-backend/src/Controllers/Project.controller.js`
- `crm-backend/src/Controllers/Task.controller.js`
- `crm-backend/src/Controllers/User.controller.js`
- `crm-backend/src/Middleware/requireAuth.js`
- `crm-backend/src/Models/Attendance.Model.js`
- `crm-backend/src/Models/User.Model.js`
- `crm-backend/src/Utils/token.js`
- `crm-backend/src/routers/Admin.route.js`
- `crm-backend/src/routers/Attendance.route.js`
- `crm-backend/src/routers/User.route.js`
- `crm-frontend/App/vite-project/src/Component/AdminDashboard.jsx`
- `crm-frontend/App/vite-project/src/Component/UserDashboard.jsx`

## NEW files (add them)

- `attendance-agent/README.md`
- `attendance-agent/config.example.json`
- `attendance-agent/index.js`
- `attendance-agent/install-startup.bat`
- `attendance-agent/package.json`
- `attendance-agent/src/agent.js`
- `attendance-agent/src/api.js`
- `attendance-agent/src/config.js`
- `attendance-agent/src/log.js`
- `attendance-agent/src/notify.js`
- `attendance-agent/src/queue.js`
- `attendance-agent/src/setup.js`
- `attendance-agent/src/wifi.js`
- `attendance-agent/start-hidden.vbs`
- `attendance-agent/test/agent.test.js`
- `attendance-agent/test/wifi.test.js`
- `attendance-agent/uninstall-startup.bat`
- `crm-backend/.env.example`
- `crm-backend/src/Controllers/Agent.controller.js`
- `crm-backend/src/Controllers/AttendanceCenter.controller.js`
- `crm-backend/src/Controllers/Branch.controller.js`
- `crm-backend/src/Controllers/Device.controller.js`
- `crm-backend/src/Controllers/Holiday.controller.js`
- `crm-backend/src/Controllers/Leave.controller.js`
- `crm-backend/src/Controllers/Notification.controller.js`
- `crm-backend/src/Controllers/Regularization.controller.js`
- `crm-backend/src/Controllers/Setting.controller.js`
- `crm-backend/src/Controllers/Staff.controller.js`
- `crm-backend/src/Middleware/adminBootstrap.js`
- `crm-backend/src/Middleware/anyAuth.js`
- `crm-backend/src/Middleware/deviceAuth.js`
- `crm-backend/src/Models/AttendanceEvent.Model.js`
- `crm-backend/src/Models/Branch.Model.js`
- `crm-backend/src/Models/Device.Model.js`
- `crm-backend/src/Models/Holiday.Model.js`
- `crm-backend/src/Models/Leave.Model.js`
- `crm-backend/src/Models/Notification.Model.js`
- `crm-backend/src/Models/Regularization.Model.js`
- `crm-backend/src/Models/Setting.Model.js`
- `crm-backend/src/Services/attendanceCore.js`
- `crm-backend/src/Services/attendanceEngine.js`
- `crm-backend/src/Services/attendanceMonitor.js`
- `crm-backend/src/Services/calendar.service.js`
- `crm-backend/src/Services/notification.service.js`
- `crm-backend/src/Services/report.service.js`
- `crm-backend/src/Services/settings.service.js`
- `crm-backend/src/Services/socket.js`
- `crm-backend/src/Utils/http.js`
- `crm-backend/src/Utils/secrets.js`
- `crm-backend/src/Utils/time.js`
- `crm-backend/src/Utils/wifi.js`
- `crm-backend/src/routers/Agent.route.js`
- `crm-backend/src/routers/Branch.route.js`
- `crm-backend/src/routers/Device.route.js`
- `crm-backend/src/routers/Holiday.route.js`
- `crm-backend/src/routers/Leave.route.js`
- `crm-backend/src/routers/Notification.route.js`
- `crm-backend/src/routers/Regularization.route.js`
- `crm-backend/src/routers/Setting.route.js`
- `crm-backend/src/routers/Staff.route.js`
- `crm-backend/src/scripts/enable-wifi-mode.js`
- `crm-backend/src/scripts/seed.js`
- `crm-backend/src/tests/attendanceCore.test.js`
- `crm-backend/src/tests/integration.test.js`
- `crm-backend/src/tests/utils.test.js`
- `crm-frontend/App/vite-project/src/Component/wifi/AdminAttendanceHub.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/AdminLeaves.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/AuditLog.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/Corrections.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/DayDetail.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/LiveBoard.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/MonthCalendar.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/MonthlyReport.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/MyAttendance.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/MyLeaves.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/NotificationCenter.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/StaffDirectory.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/WifiAttendance.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/WifiSetup.jsx`
- `crm-frontend/App/vite-project/src/Component/wifi/events.js`
- `crm-frontend/App/vite-project/src/Component/wifi/ui.jsx`
- `crm-frontend/App/vite-project/src/lib/api.js`
- `crm-frontend/App/vite-project/src/lib/format.js`
- `crm-frontend/App/vite-project/src/lib/hooks.js`
- `crm-frontend/App/vite-project/src/lib/socket.js`
