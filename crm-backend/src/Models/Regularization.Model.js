const mongoose = require("mongoose");

// "I was in the office but the Wi-Fi/agent failed" - the employee asks for the
// day's times to be corrected; an admin approves or rejects.
const regularizationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true },
    userName: { type: String, required: true, trim: true },

    date: { type: String, required: true }, // YYYY-MM-DD
    requestedCheckIn: { type: Date, required: true },
    requestedCheckOut: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },

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

regularizationSchema.index({ userId: 1, date: 1 });
regularizationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Regularization", regularizationSchema);
