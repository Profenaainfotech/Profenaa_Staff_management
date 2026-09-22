const mongoose = require("mongoose");

// Daily Report (DHR): what an employee did during the working day, hour by hour.
const entrySchema = new mongoose.Schema(
  {
    from: { type: String, required: true }, // HH:MM
    to: { type: String, required: true }, // HH:MM
    project: { type: String, default: "", trim: true },
    category: { type: String, default: "Other", trim: true },
    task: { type: String, required: true, trim: true },
    status: { type: String, enum: ["Completed", "In Progress", "Blocked"], default: "Completed" },
    minutes: { type: Number, default: 0 },
  },
  { _id: false }
);

const dailyReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true },
    userName: { type: String, required: true, trim: true },
    role: { type: String, default: "" },
    department: { type: String, default: "" },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    date: { type: String, required: true }, // YYYY-MM-DD (IST)

    status: { type: String, enum: ["DRAFT", "SUBMITTED"], default: "DRAFT" },
    entries: { type: [entrySchema], default: [] },
    summary: {
      achievements: { type: String, default: "" },
      blockers: { type: String, default: "" },
      tomorrowPlan: { type: String, default: "" },
      notes: { type: String, default: "" },
    },

    reportedMinutes: { type: Number, default: 0 }, // sum of the entries
    attendanceMinutes: { type: Number, default: 0 }, // worked time on the attendance record when submitted
    submittedAt: { type: Date, default: null },
    reopenedBy: { type: String, default: "" },
    reopenedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
dailyReportSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyReportSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model("DailyReport", dailyReportSchema);
