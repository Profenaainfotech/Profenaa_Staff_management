const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    // ==============================
    // USER DETAILS
    // ==============================

    name: {
      type: String,
      required: true,
      trim: true,
    },

    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      required: true,
    },

    // ==============================
    // EMPLOYEE SHIFT TIMING
    // ==============================

    // Example:
    // 09:30 = 9:30 AM
    // 10:00 = 10:00 AM

    shiftStart: {
      type: String,
      default: "09:30",
      trim: true,
    },

    // Example:
    // 18:30 = 6:30 PM
    // 19:30 = 7:30 PM
    // 20:30 = 8:30 PM

    shiftEnd: {
      type: String,
      default: "18:30",
      trim: true,
    },

    // ==============================
    // EMPLOYEE ATTENDANCE / ACTIVITY
    // ==============================

    isOnline: {
      type: Boolean,
      default: false,
    },

    loginTime: {
      type: Date,
      default: null,
    },

    logoutTime: {
      type: Date,
      default: null,
    },

    lastActivity: {
      type: Date,
      default: null,
    },

    totalWorkingMinutes: {
      type: Number,
      default: 0,
    },

    // ==============================
    // STAFF PROFILE / WI-FI ATTENDANCE
    // ==============================

    // Branch the employee belongs to. Wi-Fi attendance is only accepted from
    // that branch's registered access points.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    // WIFI      = attendance is recorded automatically from the office Wi-Fi agent
    // CRM_LOGIN = attendance is recorded from CRM login/logout (previous behaviour)
    attendanceMode: {
      type: String,
      enum: ["WIFI", "CRM_LOGIN"],
      default: "CRM_LOGIN",
    },

    // false = cannot log in (deactivated / left the company)
    isActive: {
      type: Boolean,
      default: true,
    },

    email: { type: String, default: "", trim: true, lowercase: true },
    department: { type: String, default: "", trim: true },
    employeeCode: { type: String, default: "", trim: true },
    joiningDate: { type: String, default: "" }, // YYYY-MM-DD

    // Date of birth (YYYY-MM-DD)
    dateOfBirth: { type: String, default: "" },

    // Mode of learning / engagement: Full Time, Part Time, Freelancer or Intern
    learningMode: {
      type: String,
      enum: ["", "Full Time", "Part Time", "Freelancer", "Intern"],
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model(
  "UserAccounts",
  UserSchema
);

module.exports = User;