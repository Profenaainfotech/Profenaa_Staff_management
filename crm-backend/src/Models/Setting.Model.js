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
    overtimePromptMinutes: { type: Number, default: 10 }, // time allowed to reply, first ask
    overtimeRepeatMinutes: { type: Number, default: 5 }, // if still no reply, ask again this often
    overtimeMaxAsks: { type: Number, default: 3 }, // give up (and act on noResponseAction) after this many unanswered asks
    overtimeRecheckMinutes: { type: Number, default: 60 }, // asked again this often during overtime
    // No reply after every repeat ask is exhausted:
    //   HALF_DAY    = half day until explained + approved (attendance session ends)
    //   FLAG_ONLY   = just flag it, no half-day penalty (attendance session ends)
    //   AUTO_LOGOUT = the above, AND the staff member's CRM session is signed out
    noResponseAction: { type: String, enum: ["HALF_DAY", "FLAG_ONLY", "AUTO_LOGOUT"], default: "HALF_DAY" },

    // The alert sound played when "Are you still working?" appears (synthesised in the
    // browser - no audio files to host). One of these presets, and it repeats on every
    // repeat-ask, not just the first. mandatorySound cannot be muted by the browser tab
    // alone; the tab must be actively closed/backgrounded to stop it.
    overtimeSound: { type: String, enum: ["ALARM", "URGENT_BEEPS", "SIREN"], default: "ALARM" },
    overtimeSoundSeconds: { type: Number, default: 5 }, // how long the alert sound plays each time

    // Absolute last resort, regardless of the overtime question's state: no session is
    // ever allowed to stay open longer than this, measured from check-in. Prevents a
    // stuck sweep or an unanswered question from ever showing a runaway timer.
    absoluteMaxSessionHours: { type: Number, default: 16 },

    // Sunday / a holiday is normally leave: nothing is counted unless the person
    // confirms they are actually working. Asked once, at the very first check-in of the
    // day; this many minutes to answer before it defaults to "not working" (nothing
    // counted, and it is not asked again that day).
    offDayAskMinutes: { type: Number, default: 10 },

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
