const mongoose = require("mongoose");

// Audit trail of everything that changed an attendance state.
// Routine heartbeats are NOT stored (the live state on the Attendance document
// is enough); only a throttled sample is kept for troubleshooting.
const attendanceEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true },
    userName: { type: String, default: "" },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: "Attendance", default: null },
    date: { type: String, default: "" },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Device", default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },

    type: {
      type: String,
      required: true,
      enum: [
        "CHECK_IN",
        "RETURN",
        "HEARTBEAT",
        "WIFI_CHANGED",
        "DISCONNECTED",
        "WARNING",
        "WIFI_RECONNECTED",
        "CHECK_OUT",
        "AUTO_CHECK_OUT",
        "SESSION_RESTORED",
        "MANUAL_EDIT",
        "DEVICE_REGISTERED",
        "DEVICE_APPROVED",
        "DEVICE_REVOKED",
        "REJECTED_NETWORK",
        "CRM_LOGIN",
        "CRM_LOGOUT",
        "OVERTIME_ASKED",
        "OVERTIME_CONFIRMED",
        "OVERTIME_DECLINED",
        "OVERTIME_NO_RESPONSE",
        "REVIEW_EXPLAINED",
        "REVIEW_DECIDED",
      ],
    },

    ssid: { type: String, default: "" },
    bssid: { type: String, default: "" },
    message: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    // when it really happened on the device (offline queue replays keep the
    // original time) vs. when the server learned about it (createdAt)
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

attendanceEventSchema.index({ userId: 1, occurredAt: -1 });
attendanceEventSchema.index({ date: 1, type: 1 });
attendanceEventSchema.index({ occurredAt: -1 });
// keep 180 days of audit history
attendanceEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model("AttendanceEvent", attendanceEventSchema);
