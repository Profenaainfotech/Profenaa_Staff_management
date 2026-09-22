const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    name: { type: String, required: true, trim: true },
    // null = every branch
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1, branchId: 1 }, { unique: true });

module.exports = mongoose.model("Holiday", holidaySchema);
