const mongoose = require("mongoose");

// One row per CRM sign-in / sign-out (employees and admins): who, when, from which
// device and network, and whether the office-Wi-Fi rule allowed it.
const loginLogSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "admin"], default: "user" },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userName: { type: String, default: "", trim: true },
    kind: { type: String, enum: ["LOGIN", "LOGOUT"], default: "LOGIN" },
    result: { type: String, enum: ["ALLOWED", "BLOCKED"], default: "ALLOWED" },
    reason: { type: String, default: "" },

    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    browser: { type: String, default: "" },
    os: { type: String, default: "" },
    deviceType: { type: String, default: "" },

    // OFFICE | OUTSIDE | UNVERIFIED (nothing learned yet) | NOT_CHECKED (rule off / not Wi-Fi mode)
    network: { type: String, default: "NOT_CHECKED" },
    // the employee's registered PC, when the address matches its last check-in
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Device", default: null },
    deviceName: { type: String, default: "" },

    mode: { type: String, default: "" },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    // logout only: was the PC confirmed on the office Wi-Fi at that moment?
    verified: { type: Boolean, default: null },

    at: { type: Date, default: Date.now },
    date: { type: String, default: "" }, // IST day
  },
  { timestamps: false }
);
loginLogSchema.index({ date: 1, at: -1 });
loginLogSchema.index({ userId: 1, at: -1 });

module.exports = mongoose.model("LoginLog", loginLogSchema);
