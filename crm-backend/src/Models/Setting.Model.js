const mongoose = require("mongoose");

// Single document (key = "attendance") holding company-wide attendance rules.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },

    // 0 = Sunday ... 6 = Saturday
    weeklyOffDays: { type: [Number], default: [0] },

    // Worked minutes needed for a full / half day
    fullDayMinutes: { type: Number, default: 480 },
    halfDayMinutes: { type: Number, default: 240 },

    // Minutes after shift start before someone is flagged "late" in alerts
    lateGraceMinutes: { type: Number, default: 10 },

    // Close a still-open session this long after shift end (forgotten laptop).
    // 0 = never auto close.
    autoCheckoutAfterShiftMinutes: { type: Number, default: 240 },

    // Wi-Fi presence earlier than this many minutes before shift start does not
    // open a session (stops a laptop left on overnight from "checking in").
    earliestCheckInBeforeShiftMinutes: { type: Number, default: 120 },

    // Remind an employee who has not been detected this long after shift start
    noShowReminderMinutes: { type: Number, default: 30 },

    // Admin morning summary (IST, HH:MM). Empty = off.
    morningDigestTime: { type: String, default: "11:00" },

    // First device of an employee is approved automatically; later ones wait
    autoApproveFirstDevice: { type: Boolean, default: true },
    maxActiveDevicesPerUser: { type: Number, default: 1 },

    // Wi-Fi staff can only sign in to the CRM from the office network
    requireOfficeWifiLogin: { type: Boolean, default: true },
    // Extra office addresses (for example a fixed public IP), besides the ones learned from the agents
    extraOfficeIps: { type: [String], default: [] },

    // "Are you still working?" after shift end
    overtimePromptMinutes: { type: Number, default: 10 }, // time allowed to reply
    overtimeRecheckMinutes: { type: Number, default: 60 }, // asked again this often during overtime
    // No reply: HALF_DAY = half day until explained + approved, FLAG_ONLY = just flag it
    noResponseAction: { type: String, enum: ["HALF_DAY", "FLAG_ONLY"], default: "HALF_DAY" },

    // Reminder to submit the Daily Report this long after shift end (0 = off)
    dailyReportReminderMinutes: { type: Number, default: 15 },

    // Yearly leave allowance per type (informational balance)
    leaveQuotas: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        "Casual Leave": 12,
        "Sick Leave": 12,
        "Earned Leave": 0,
      }),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", settingSchema);
