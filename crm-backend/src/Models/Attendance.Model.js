const mongoose = require("mongoose");

// =====================================================
// SESSION
// One continuous stretch of presence. A day can have several
// (e.g. morning, then back after lunch, then evening).
// =====================================================
const sessionSchema = new mongoose.Schema(
  {
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },

    // Last moment the device was confirmed on an authorised office network.
    // A closed session ends HERE, not when the timeout fired - so the grace
    // period and silent minutes are never credited as work.
    lastPresentAt: { type: Date, default: null },

    endReason: { type: String, default: null },
    serverClosedAt: { type: Date, default: null },

    ssid: { type: String, default: "" },
    bssid: { type: String, default: "" },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Device", default: null },
    source: { type: String, default: "OFFICE_WIFI" },
  },
  { _id: true }
);

// =====================================================
// LIVE WI-FI STATE (drives the live board + grace countdown)
// =====================================================
const wifiSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ["CONNECTED", "WARNING", "ENDED"],
      default: "ENDED",
    },
    warningReason: { type: String, default: null },
    ssid: { type: String, default: "" },
    bssid: { type: String, default: "" },
    lastHeartbeatAt: { type: Date, default: null },
    lastPresentAt: { type: Date, default: null },
    warningStartedAt: { type: Date, default: null },
    graceDeadline: { type: Date, default: null },
    pendingEndReason: { type: String, default: null },
  },
  { _id: false }
);

// =====================================================
// CRM SIGN-IN STATE (Wi-Fi staff)
// Logging out of the CRM stops the timer; readings from the PC are ignored
// until the employee signs in again.
// =====================================================
const crmSchema = new mongoose.Schema(
  {
    loginAt: { type: Date, default: null },
    logoutAt: { type: Date, default: null },
    // was the PC confirmed on the office Wi-Fi when they logged out?
    logoutVerified: { type: Boolean, default: null },
  },
  { _id: false }
);

// =====================================================
// SHIFT-END QUESTION  ("Are you still working?")
// NONE -> ASKING -> CONFIRMED (overtime) | DECLINED | NO_RESPONSE
// =====================================================
const overtimeSchema = new mongoose.Schema(
  {
    state: { type: String, enum: ["NONE", "ASKING", "CONFIRMED", "DECLINED", "NO_RESPONSE"], default: "NONE" },
    askId: { type: Number, default: 0 },
    // how many times we have asked, with no reply yet, in the CURRENT round (reset to 1
    // each time a fresh "are you still working?" round starts - see attendanceCore.js)
    unansweredCount: { type: Number, default: 0 },
    askedAt: { type: Date, default: null },
    deadline: { type: Date, default: null },
    // time up to which the person is already known to have been working
    coveredUntil: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    nextAskAt: { type: Date, default: null },
  },
  { _id: false }
);

// =====================================================
// REVIEW  (no reply at shift end -> half day until the employee explains
// and an administrator makes it Present)
// =====================================================
const reviewSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ["NONE", "PENDING_EXPLANATION", "EXPLAINED", "APPROVED", "REJECTED"],
      default: "NONE",
    },
    reason: { type: String, default: "" },
    requestedAt: { type: Date, default: null },
    explanation: { type: String, default: "" },
    explainedAt: { type: Date, default: null },
    decidedBy: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const editSchema = new mongoose.Schema(
  {
    by: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAccounts",
      required: true,
    },

    userName: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: String,
      required: true,
    },

    // First check-in of the day / last check-out (null while a session is open)
    checkIn: {
      type: Date,
      default: null,
    },

    checkOut: {
      type: Date,
      default: null,
    },

    totalMinutes: {
      type: Number,
      default: 0,
    },

    totalHours: {
      type: String,
      default: "0h 0m",
    },

    status: {
      type: String,
      enum: ["Present", "Half Day", "Absent", "Completed"],
      default: "Present",
    },

    // ---------------------------------------------------
    // Fields the login/logout controller already wrote but the
    // old schema silently dropped (strict mode). Now persisted.
    // ---------------------------------------------------
    attendanceSource: {
      type: String,
      enum: ["CRM_LOGIN", "OFFICE_WIFI", "MANUAL"],
      default: "CRM_LOGIN",
    },

    lateMinutes: { type: Number, default: 0 },
    earlyLogoutMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    // Work on a day off (Sunday / holiday) is kept apart from normal and overtime hours
    dayType: { type: String, enum: ["WORKING", "WEEKLY_OFF", "HOLIDAY"], default: "WORKING" },
    offDayMinutes: { type: Number, default: 0 },
    correctionReason: { type: String, default: "" },

    // ---------------------------------------------------
    // Wi-Fi attendance
    // ---------------------------------------------------
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Device", default: null },
    sessions: { type: [sessionSchema], default: [] },
    wifi: { type: wifiSchema, default: () => ({}) },
    crm: { type: crmSchema, default: () => ({}) },
    overtime: { type: overtimeSchema, default: () => ({}) },
    review: { type: reviewSchema, default: () => ({}) },

    // true once the day has been closed out by the nightly job
    finalized: { type: Boolean, default: false },

    // audit trail for manual edits / regularizations
    edits: { type: [editSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

// One attendance record per user per day
attendanceSchema.index(
  { userId: 1, date: 1 },
  { unique: true }
);
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ "wifi.state": 1 });

module.exports = mongoose.model(
  "Attendance",
  attendanceSchema
);
