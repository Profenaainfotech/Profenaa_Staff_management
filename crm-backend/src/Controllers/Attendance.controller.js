const Attendance = require("../Models/Attendance.Model");
const User = require("../Models/User.Model");

// Wi-Fi attendance is recorded automatically by the office agent, so the manual
// check-in / check-out endpoints are not available to those employees.
const wifiTracked = async (userId) => {
  const u = await User.findById(userId).select("attendanceMode");
  return u?.attendanceMode === "WIFI";
};
const WIFI_MESSAGE =
  "Your attendance is recorded automatically from the office Wi-Fi. Manual check-in/out is not needed.";

// Get today's date in Indian Standard Time
const getISTDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

// ===============================
// USER - GET TODAY ATTENDANCE
// ===============================
const getMyTodayAttendance = async (req, res) => {
  try {
    const userId = req.payload.id;

    const today = getISTDate();

    const attendance = await Attendance.findOne({
      userId,
      date: today,
    });

    return res.status(200).json({
      success: true,
      attendance: attendance || null,
    });
  } catch (error) {
    console.error("Get today's attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get today's attendance",
      error: error.message,
    });
  }
};

// ===============================
// USER - CHECK IN
// ===============================
const checkIn = async (req, res) => {
  try {
    const userId = req.payload.id;

    if (await wifiTracked(userId)) {
      return res.status(403).json({ success: false, message: WIFI_MESSAGE });
    }
    const userName = req.payload.name || req.payload.email;

    const today = getISTDate();

    const existingAttendance = await Attendance.findOne({
      userId,
      date: today,
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: "Attendance already marked for today",
        attendance: existingAttendance,
      });
    }

    const attendance = await Attendance.create({
      userId,
      userName,
      date: today,
      checkIn: new Date(),
      status: "Present",
    });

    return res.status(201).json({
      success: true,
      message: "Check-in successful",
      attendance,
    });
  } catch (error) {
    console.error("Check-in error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check in",
      error: error.message,
    });
  }
};

// ===============================
// USER - CHECK OUT
// ===============================
const checkOut = async (req, res) => {
  try {
    const userId = req.payload.id;

    if (await wifiTracked(userId)) {
      return res.status(403).json({ success: false, message: WIFI_MESSAGE });
    }

    const today = getISTDate();

    const attendance = await Attendance.findOne({
      userId,
      date: today,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No check-in found for today",
      });
    }

    if (!attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: "Please check in first",
      });
    }

    if (attendance.checkOut) {
      return res.status(400).json({
        success: false,
        message: "Already checked out",
        attendance,
      });
    }

    const checkOutTime = new Date();

    const difference =
      checkOutTime.getTime() -
      new Date(attendance.checkIn).getTime();

    const totalMinutes = Math.max(
      0,
      Math.floor(difference / (1000 * 60))
    );

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    attendance.checkOut = checkOutTime;
    attendance.totalMinutes = totalMinutes;
    attendance.totalHours = `${hours}h ${minutes}m`;
    attendance.status = "Completed";

    await attendance.save();

    return res.status(200).json({
      success: true,
      message: "Check-out successful",
      attendance,
    });
  } catch (error) {
    console.error("Check-out error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check out",
      error: error.message,
    });
  }
};

// ===============================
// USER - ATTENDANCE HISTORY
// ===============================
const getMyAttendanceHistory = async (req, res) => {
  try {
    const userId = req.payload.id;

    const attendance = await Attendance.find({
      userId,
    }).sort({
      date: -1,
    });

    return res.status(200).json({
      success: true,
      attendance,
    });
  } catch (error) {
    console.error("Attendance history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get attendance history",
      error: error.message,
    });
  }
};

// ===============================
// ADMIN - GET ALL ATTENDANCE
// ===============================
const getAllAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find().sort({
      date: -1,
      checkIn: -1,
    });

    return res.status(200).json({
      success: true,
      attendance,
    });
  } catch (error) {
    console.error("Get all attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get attendance",
      error: error.message,
    });
  }
};

// ===============================
// ADMIN - GET ATTENDANCE BY DATE
// ===============================
const getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.params;

    const attendance = await Attendance.find({
      date,
    }).sort({
      checkIn: -1,
    });

    return res.status(200).json({
      success: true,
      attendance,
    });
  } catch (error) {
    console.error("Get attendance by date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get attendance",
      error: error.message,
    });
  }
};

module.exports = {
  getMyTodayAttendance,
  checkIn,
  checkOut,
  getMyAttendanceHistory,
  getAllAttendance,
  getAttendanceByDate,
};