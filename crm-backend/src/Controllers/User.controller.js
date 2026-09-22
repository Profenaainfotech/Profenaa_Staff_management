
const User = require("../Models/User.Model");
const Attendance = require("../Models/Attendance.Model");
const loginGate = require("../Services/loginGate.service");
const attendanceEngine = require("../Services/attendanceEngine");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// =====================================================
// JWT SECRET
// =====================================================

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

// =====================================================
// IST DATE HELPER
// =====================================================

const getISTDate = () => {
  const now = new Date();

  const ist = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    })
  );

  const year = ist.getFullYear();
  const month = String(
    ist.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    ist.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// =====================================================
// SHIFT TIME HELPER
// Converts "09:30" -> total minutes
// =====================================================

const timeToMinutes = (timeString) => {
  if (!timeString) {
    return 0;
  }

  const [hours, minutes] = timeString
    .split(":")
    .map(Number);

  return hours * 60 + minutes;
};

// =====================================================
// GET CURRENT IST MINUTES
// =====================================================

const getCurrentISTMinutes = () => {
  const now = new Date();

  const istString = now.toLocaleString(
    "en-US",
    {
      timeZone: "Asia/Kolkata",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const [hours, minutes] =
    istString.split(":").map(Number);

  return hours * 60 + minutes;
};

// =====================================================
// CREATE USER
// =====================================================

const createUser = async (req, res) => {
  try {
    const {
      name,
      mobile,
      password,
      role,
      shiftStart,
      shiftEnd,
    } = req.body;

    // -----------------------------------------------
    // Validation
    // -----------------------------------------------

    if (!name || !mobile || !password || !role) {
      return res.status(400).json({
        success: false,
        message:
          "Name, mobile number, password, and role are required",
      });
    }

    // -----------------------------------------------
    // Clean values
    // -----------------------------------------------

    const cleanName = name.trim();
    const cleanMobile = mobile.trim();
    const cleanRole = role.trim();

    // -----------------------------------------------
    // Basic mobile validation
    // -----------------------------------------------

    if (
      !/^[0-9+\-\s()]{10,15}$/.test(
        cleanMobile
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid mobile number",
      });
    }

    // -----------------------------------------------
    // Check duplicate username
    // -----------------------------------------------

    const existingUser = await User.findOne({
      name: cleanName,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      });
    }

    // -----------------------------------------------
    // Check duplicate mobile
    // -----------------------------------------------

    const existingMobile =
      await User.findOne({
        mobile: cleanMobile,
      });

    if (existingMobile) {
      return res.status(409).json({
        success: false,
        message:
          "Mobile number already exists",
      });
    }

    // -----------------------------------------------
    // Hash password
    // -----------------------------------------------

    const hashedPassword =
      await bcrypt.hash(password, 10);

    // -----------------------------------------------
    // Create user
    // -----------------------------------------------

    const user = await User.create({
      name: cleanName,
      mobile: cleanMobile,
      password: hashedPassword,
      role: cleanRole,

      isOnline: false,
      loginTime: null,
      logoutTime: null,
      lastActivity: null,
      totalWorkingMinutes: 0,

      // Employee-specific shift
      shiftStart:
        shiftStart || "09:30",

      shiftEnd:
        shiftEnd || "18:30",
    });

    // -----------------------------------------------
    // Response
    // -----------------------------------------------

    return res.status(201).json({
      success: true,
      message: "User created successfully",

      user: {
        _id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,

        isOnline: user.isOnline,
        loginTime: user.loginTime,
        logoutTime: user.logoutTime,
        lastActivity: user.lastActivity,
        totalWorkingMinutes:
          user.totalWorkingMinutes,

        shiftStart: user.shiftStart,
        shiftEnd: user.shiftEnd,
      },
    });
  } catch (error) {
    console.error(
      "CREATE USER ERROR:",
      error
    );

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const duplicateField =
        Object.keys(
          error.keyPattern || {}
        )[0];

      if (duplicateField === "mobile") {
        return res.status(409).json({
          success: false,
          message:
            "Mobile number already exists",
        });
      }

      if (duplicateField === "name") {
        return res.status(409).json({
          success: false,
          message:
            "Username already exists",
        });
      }
    }

    return res.status(500).json({
      success: false,
      message:
        "Server error while creating user",
      error: error.message,
    });
  }
};

// =====================================================
// USER LOGIN
// =====================================================

const LoginUser = async (req, res) => {
  try {
    const {
      name,
      password,
    } = req.body;

    // -----------------------------------------------
    // Validation
    // -----------------------------------------------

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Name and password are required",
      });
    }

    // -----------------------------------------------
    // Find user
    // -----------------------------------------------

    const user = await User.findOne({
      name: name.trim(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid username or password",
      });
    }

    // -----------------------------------------------
    // Check password
    // -----------------------------------------------

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid username or password",
      });
    }

    // -----------------------------------------------
    // Deactivated staff cannot sign in
    // -----------------------------------------------

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message:
          "This account is deactivated. Contact your administrator.",
      });
    }

    // -----------------------------------------------
    // Wi-Fi staff can only sign in from the office network
    // -----------------------------------------------

    const gate = await loginGate.checkLogin(
      user,
      req.ip
    );

    if (!gate.allowed) {
      await loginGate.record({
        user,
        req,
        kind: "LOGIN",
        result: "BLOCKED",
        reason: gate.reason,
        network: gate.network,
      });

      return res.status(403).json({
        success: false,
        code: "OFFICE_WIFI_REQUIRED",
        message: gate.message,
      });
    }

    // =================================================
    // START NEW CRM SESSION
    // =================================================

    const currentLoginTime =
      new Date();

    user.isOnline = true;
    user.loginTime =
      currentLoginTime;
    user.logoutTime = null;
    user.lastActivity =
      currentLoginTime;

    // Do NOT reset totalWorkingMinutes
    await user.save();

    // Login activity (device, browser, network) + Wi-Fi attendance sign-in
    await loginGate.record({
      user,
      req,
      kind: "LOGIN",
      result: "ALLOWED",
      reason: gate.reason,
      network: gate.network,
    });

    try {
      await attendanceEngine.onCrmLogin(
        user
      );
    } catch (attendanceError) {
      console.error(
        "Wi-Fi attendance sign-in error:",
        attendanceError.message
      );
    }

    // =================================================
    // AUTOMATIC ATTENDANCE CHECK-IN
    // =================================================

    const today = getISTDate();

    let attendance =
      await Attendance.findOne({
        userId: user._id,
        date: today,
      });

    // -----------------------------------------------
    // If today's attendance doesn't exist,
    // create it automatically
    // -----------------------------------------------

    if (user.attendanceMode === "WIFI") {
      // Wi-Fi attendance: the office agent records it. CRM login must not
      // create or modify the attendance record.
    } else if (!attendance) {
      const shiftStart =
        user.shiftStart || "09:30";

      const shiftStartMinutes =
        timeToMinutes(
          shiftStart
        );

      const currentISTMinutes =
        getCurrentISTMinutes();

      const lateMinutes =
        Math.max(
          0,
          currentISTMinutes -
            shiftStartMinutes
        );

      attendance =
        await Attendance.create({
          userId: user._id,
          userName: user.name,

          date: today,

          checkIn:
            currentLoginTime,

          checkOut: null,

          totalMinutes: 0,
          totalHours: "0h 0m",

          status: "Present",

          attendanceSource:
            "CRM_LOGIN",

          lateMinutes,

          earlyLogoutMinutes: 0,

          overtimeMinutes: 0,

          correctionReason: "",
        });
    } else {
      // ---------------------------------------------
      // If attendance already exists today
      // ---------------------------------------------

      // If already completed, do not overwrite
      // completed attendance accidentally.
      if (!attendance.checkOut) {
        // The original check-in time is kept (logging in again used to
        // overwrite it and reset the day).
        attendance.userName =
          user.name;

        attendance.status =
          "Present";

        attendance.attendanceSource =
          "CRM_LOGIN";

        // lateMinutes is left as calculated at the first check-in.

        await attendance.save();
      }
    }

    // =================================================
    // CREATE JWT
    // =================================================

    const token = jwt.sign(
      {
        id: user._id,
        userId: user._id,
        name: user.name,
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,
      message:
        "Login successful",

      token,

      user: {
        _id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,

        isOnline: user.isOnline,
        loginTime: user.loginTime,
        logoutTime: user.logoutTime,
        lastActivity:
          user.lastActivity,

        totalWorkingMinutes:
          user.totalWorkingMinutes,

        shiftStart:
          user.shiftStart ||
          "09:30",

        shiftEnd:
          user.shiftEnd ||
          "18:30",

        attendance: {
          date: today,
          checkIn:
            attendance?.checkIn ||
            currentLoginTime,
          status:
            attendance?.status ||
            "Present",
        },
      },
    });
  } catch (error) {
    console.error(
      "LOGIN USER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error during login",
      error: error.message,
    });
  }
};

// =====================================================
// USER LOGOUT
// =====================================================

const LogoutUser = async (req, res) => {
  try {
    // -----------------------------------------------
    // Get user ID from JWT
    // -----------------------------------------------

    const userId =
      req.user?.id ||
      req.user?.userId ||
      req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "User authentication required",
      });
    }

    // -----------------------------------------------
    // Find user
    // -----------------------------------------------

    const user =
      await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // -----------------------------------------------
    // Logout time
    // -----------------------------------------------

    const currentLogoutTime =
      new Date();

    // =================================================
    // CALCULATE CURRENT SESSION
    // =================================================

    let sessionMinutes = 0;

    if (
      user.isOnline === true &&
      user.loginTime
    ) {
      const loginTime =
        new Date(
          user.loginTime
        );

      const sessionMilliseconds =
        currentLogoutTime.getTime() -
        loginTime.getTime();

      sessionMinutes =
        Math.max(
          0,
          sessionMilliseconds
        ) / 60000;

      // Add current session
      user.totalWorkingMinutes =
        (Number(
          user.totalWorkingMinutes
        ) || 0) +
        sessionMinutes;
    }

    // =================================================
    // AUTOMATIC ATTENDANCE CHECK-OUT
    // =================================================

    const today = getISTDate();

    const attendance =
      await Attendance.findOne({
        userId: user._id,
        date: today,
      });

    if (
      user.attendanceMode !== "WIFI" &&
      attendance &&
      attendance.checkIn &&
      !attendance.checkOut
    ) {
      const checkInTime =
        new Date(
          attendance.checkIn
        );

      // ---------------------------------------------
      // Calculate total attendance minutes
      // ---------------------------------------------

      const attendanceMilliseconds =
        currentLogoutTime.getTime() -
        checkInTime.getTime();

      const totalMinutes =
        Math.max(
          0,
          Math.floor(
            attendanceMilliseconds /
              60000
          )
        );

      const hours =
        Math.floor(
          totalMinutes / 60
        );

      const minutes =
        totalMinutes % 60;

      // ---------------------------------------------
      // Employee shift
      // ---------------------------------------------

      const shiftStart =
        user.shiftStart ||
        "09:30";

      const shiftEnd =
        user.shiftEnd ||
        "18:30";

      const shiftStartMinutes =
        timeToMinutes(
          shiftStart
        );

      const shiftEndMinutes =
        timeToMinutes(
          shiftEnd
        );

      // ---------------------------------------------
      // Calculate late login
      // ---------------------------------------------

      const checkInISTMinutes =
        (() => {
          const checkInIST =
            new Date(
              checkInTime.toLocaleString(
                "en-US",
                {
                  timeZone:
                    "Asia/Kolkata",
                }
              )
            );

          return (
            checkInIST.getHours() *
              60 +
            checkInIST.getMinutes()
          );
        })();

      const lateMinutes =
        Math.max(
          0,
          checkInISTMinutes -
            shiftStartMinutes
        );

      // ---------------------------------------------
      // Calculate early logout
      // ---------------------------------------------

      const logoutISTMinutes =
        getCurrentISTMinutes();

      const earlyLogoutMinutes =
        Math.max(
          0,
          shiftEndMinutes -
            logoutISTMinutes
        );

      // ---------------------------------------------
      // Calculate overtime
      // ---------------------------------------------

      const overtimeMinutes =
        Math.max(
          0,
          logoutISTMinutes -
            shiftEndMinutes
        );

      // ---------------------------------------------
      // Update Attendance
      // ---------------------------------------------

      attendance.checkOut =
        currentLogoutTime;

      attendance.totalMinutes =
        totalMinutes;

      attendance.totalHours =
        `${hours}h ${minutes}m`;

      attendance.status =
        "Completed";

      attendance.lateMinutes =
        lateMinutes;

      attendance.earlyLogoutMinutes =
        earlyLogoutMinutes;

      attendance.overtimeMinutes =
        overtimeMinutes;

      await attendance.save();
    }

    // =================================================
    // WI-FI ATTENDANCE: cross-check the PC, then stop the timer
    // =================================================

    try {
      const logoutNetwork =
        await loginGate.networkFor(
          user,
          req.ip
        );

      const wifiLogout =
        await attendanceEngine.onCrmLogout(
          user,
          { network: logoutNetwork }
        );

      await loginGate.record({
        user,
        req,
        kind: "LOGOUT",
        result: "ALLOWED",
        network: logoutNetwork,
        verified: wifiLogout
          ? wifiLogout.verified
          : null,
      });
    } catch (attendanceError) {
      console.error(
        "Wi-Fi attendance sign-out error:",
        attendanceError.message
      );
    }

    // =================================================
    // MARK USER OFFLINE
    // =================================================

    user.isOnline = false;

    user.logoutTime =
      currentLogoutTime;

    user.lastActivity =
      currentLogoutTime;

    // Clear current login session
    // so active timer stops
    user.loginTime = null;

    await user.save();

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,
      message:
        "Logout successful and attendance checked out automatically",

      user: {
        _id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,

        isOnline: user.isOnline,

        loginTime:
          user.loginTime,

        logoutTime:
          user.logoutTime,

        lastActivity:
          user.lastActivity,

        totalWorkingMinutes:
          user.totalWorkingMinutes,
      },

      attendance: attendance
        ? {
            date:
              attendance.date,

            checkIn:
              attendance.checkIn,

            checkOut:
              attendance.checkOut,

            totalMinutes:
              attendance.totalMinutes,

            totalHours:
              attendance.totalHours,

            status:
              attendance.status,

            lateMinutes:
              attendance.lateMinutes,

            earlyLogoutMinutes:
              attendance.earlyLogoutMinutes,

            overtimeMinutes:
              attendance.overtimeMinutes,
          }
        : null,
    });
  } catch (error) {
    console.error(
      "LOGOUT USER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error during logout",
      error: error.message,
    });
  }
};

// =====================================================
// GET LOGGED-IN USER PROFILE
// =====================================================

const getProfile = async (req, res) => {
  try {
    const userId =
      req.user?.id ||
      req.user?.userId ||
      req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const user =
      await User.findById(
        userId
      ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
      profile: user,
    });
  } catch (error) {
    console.error(
      "GET PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// GET ALL USERS
// =====================================================

const getAllProfiles = async (
  req,
  res
) => {
  try {
    const users =
      await User.find()
        .select("-password")
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,

      users: users,
      userList: users,
      getprofile: users,
    });
  } catch (error) {
    console.error(
      "GET ALL USERS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while fetching users",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE PASSWORD
// =====================================================

const updatePasswordById =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        password,
        newPassword,
      } = req.body;

      const finalPassword =
        newPassword || password;

      if (!finalPassword) {
        return res.status(400).json({
          success: false,
          message:
            "New password is required",
        });
      }

      const user =
        await User.findById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          finalPassword,
          10
        );

      user.password =
        hashedPassword;

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Password updated successfully",
      });
    } catch (error) {
      console.error(
        "UPDATE PASSWORD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Server error while updating password",
        error: error.message,
      });
    }
  };

// =====================================================
// UPDATE LAST ACTIVITY
// =====================================================

const updateLastActive =
  async (req, res) => {
    try {
      const userId =
        req.user?.id ||
        req.user?.userId ||
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      const user =
        await User.findById(
          userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      // ---------------------------------------------
      // HEARTBEAT ONLY UPDATES ACTIVITY
      // It does NOT affect attendance timer.
      // ---------------------------------------------

      if (user.isOnline === true) {
        user.lastActivity =
          new Date();

        await user.save();
      }

      return res.status(200).json({
        success: true,
        message:
          "Activity updated",

        lastActivity:
          user.lastActivity,
      });
    } catch (error) {
      console.error(
        "UPDATE ACTIVE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Server error",
        error: error.message,
      });
    }
  };

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createUser,
  LoginUser,
  LogoutUser,
  getProfile,
  getAllProfiles,
  updatePasswordById,
  updateLastActive,
}

