const express = require("express");
const cors = require("cors");
const logger = require("morgan");
const path = require("path");

// Import routers
const UserRouter = require("./src/routers/User.route");
const AdminRouter = require("./src/routers/Admin.route");
const Taskrouter = require("./src/routers/Task.route");
const Projectrouter = require("./src/routers/Project.route");
const attendancerouter = require("./src/routers/Attendance.route");
const agentRouter = require("./src/routers/Agent.route");
const deviceRouter = require("./src/routers/Device.route");
const branchRouter = require("./src/routers/Branch.route");
const notificationRouter = require("./src/routers/Notification.route");
const leaveRouter = require("./src/routers/Leave.route");
const holidayRouter = require("./src/routers/Holiday.route");
const regularizationRouter = require("./src/routers/Regularization.route");
const settingRouter = require("./src/routers/Setting.route");
const staffRouter = require("./src/routers/Staff.route");
const dailyReportRouter = require("./src/routers/DailyReport.route");

const app = express();

// The office network check compares the address a request comes from. When the API
// sits behind nginx / a cloud load balancer, set TRUST_PROXY (for example 1) so the
// REAL client address is used instead of the proxy's. Leave it unset when the API is
// reached directly.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(v) ? Number(v) : v === "true" ? true : v);
}

app.use(cors());

app.use(logger("dev"));
app.use(express.json());

// Serve uploaded project images
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// Router Middleware
app.use("/api/UserAccounts", UserRouter);
app.use("/api/admin", AdminRouter);
app.use("/api/Task", Taskrouter);
app.use("/api/Project", Projectrouter);
app.use("/api/attendance",attendancerouter );

// Wi-Fi attendance, notifications and staff management
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);
app.use("/api/agent", agentRouter);
app.use("/api/devices", deviceRouter);
app.use("/api/branches", branchRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/leaves", leaveRouter);
app.use("/api/holidays", holidayRouter);
app.use("/api/regularizations", regularizationRouter);
app.use("/api/settings", settingRouter);
app.use("/api/staff", staffRouter);
app.use("/api/reports", dailyReportRouter);

// Unknown API routes / unhandled errors answer in JSON instead of an HTML page
app.use("/api", (req, res) =>
  res.status(404).json({ success: false, message: "Route not found." })
);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status =
    err.status || (err.name === "MulterError" ? 400 : 500);
  if (status >= 500) console.error("Unhandled error:", err);
  res.status(status).json({
    success: false,
    error: true,
    message: err.message || "Unexpected server error.",
  });
});

// app.listen(8000, () => {
//   console.log(
//     "Server is running on port 8000. Welcome to the Express app..."
//   );
// });

module.exports = app;