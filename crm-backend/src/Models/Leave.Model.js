const mongoose = require("mongoose");

const LEAVE_TYPES = [
  "Casual Leave",
  "Sick Leave",
  "Earned Leave",
  "Work From Home",
  "Loss of Pay",
];

const leaveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true },
    userName: { type: String, required: true, trim: true },

    type: { type: String, enum: LEAVE_TYPES, required: true },

    fromDate: { type: String, required: true }, // YYYY-MM-DD
    toDate: { type: String, required: true },
    halfDay: { type: Boolean, default: false }, // only for a single-day request

    // working days actually consumed (weekly offs / holidays are not counted)
    days: { type: Number, default: 0 },

    reason: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
    },
    decidedBy: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    adminNote: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

leaveSchema.index({ userId: 1, fromDate: 1 });
leaveSchema.index({ status: 1, fromDate: 1 });

const Leave = mongoose.model("Leave", leaveSchema);
Leave.LEAVE_TYPES = LEAVE_TYPES;
module.exports = Leave;
