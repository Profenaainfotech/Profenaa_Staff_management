const express = require("express");

const attendancerouter = express.Router();

const requireAuth = require("../Middleware/requireAuth");
const adminAuth = require("../Middleware/adminAuth");
const anyAuth = require("../Middleware/anyAuth");
const center = require("../Controllers/AttendanceCenter.controller");

const {
  checkIn,
  checkOut,
  getMyTodayAttendance,
  getMyAttendanceHistory,
  getAllAttendance,
  getAttendanceByDate,
} = require("../Controllers/Attendance.controller");

// USER
attendancerouter.get("/my/today", requireAuth, getMyTodayAttendance);

attendancerouter.post("/check-in", requireAuth, checkIn);

attendancerouter.post("/check-out", requireAuth, checkOut);

attendancerouter.get("/my/history", requireAuth, getMyAttendanceHistory);

// ADMIN
attendancerouter.get("/admin/all", adminAuth, getAllAttendance);

attendancerouter.get("/admin/date/:date", adminAuth, getAttendanceByDate);

// ---------------------------------------------------
// WI-FI ATTENDANCE
// ---------------------------------------------------

// USER
attendancerouter.get("/my/live", requireAuth, center.myLive);
attendancerouter.get("/my/month", requireAuth, center.myMonth);
attendancerouter.get("/my/events", requireAuth, center.myEvents);
attendancerouter.post("/my/overtime", requireAuth, center.myOvertimeAnswer);
attendancerouter.post("/my/offday", requireAuth, center.myOffDayAnswer);
attendancerouter.post("/my/explain", requireAuth, center.myExplain);
attendancerouter.get("/my/logins", requireAuth, center.myLogins);
attendancerouter.get("/my/reviews", requireAuth, center.myReviews);

// ADMIN
attendancerouter.get("/admin/board", anyAuth.adminOnly, center.adminBoard);
attendancerouter.get("/admin/report", anyAuth.adminOnly, center.adminReport);
attendancerouter.get("/admin/user/:userId", anyAuth.adminOnly, center.adminUserMonth);
attendancerouter.get("/admin/events", anyAuth.adminOnly, center.adminEvents);
attendancerouter.get("/admin/detail", anyAuth.adminOnly, center.adminDetail);
attendancerouter.put("/admin/manual", anyAuth.adminOnly, center.adminManual);
attendancerouter.get("/admin/reviews", anyAuth.adminOnly, center.adminReviews);
attendancerouter.patch("/admin/review", anyAuth.adminOnly, center.adminDecideReview);
attendancerouter.get("/admin/logins", anyAuth.adminOnly, center.adminLogins);
attendancerouter.get("/admin/extra", anyAuth.adminOnly, center.adminExtra);

module.exports = attendancerouter;
