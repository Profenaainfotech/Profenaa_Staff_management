const mongoose = require("mongoose");

// One row per person who is currently taking a project from the pool.
// The unique index on userId guarantees that if somebody clicks two projects at the same
// moment, only ONE of the two requests can proceed ("one project at a time").
const projectSlotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("ProjectSlot", projectSlotSchema);
