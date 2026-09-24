const mongoose = require("mongoose");

// =====================================================
// TECHNOLOGIES TASK (allocated work)
//
// The admin creates a technologies task - or picks a piece of PAST WORK the company has
// already done - and allocates it to particular staff. One document = one task for one
// staff member (allocating to 3 people creates 3 documents), so each person's list can be
// ticked, removed or ended on its own.
//
// Only staff who have at least one active allocation see the "Technologies Task" card in
// their Daily Report (DHR). Every other staff member's DHR is unchanged.
// =====================================================
const techTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // Task     = a technologies task created by the admin
    // PastWork = work the company has already done, allocated to the staff member to study / redo
    kind: { type: String, enum: ["Task", "PastWork"], default: "Task" },

    // e.g. "React", "Node.js", "MongoDB"
    technology: { type: String, default: "", trim: true },

    // Optional link to the past work / reference material
    referenceUrl: { type: String, default: "", trim: true },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true },
    assignedToName: { type: String, default: "", trim: true },
    assignedBy: { type: String, default: "Admin", trim: true },

    // The task appears in the DHR from startDate until endDate (blank = until the admin removes it).
    startDate: { type: String, required: true }, // YYYY-MM-DD (IST)
    endDate: { type: String, default: "" }, // YYYY-MM-DD or ""

    // false = the admin stopped this allocation (it no longer shows in new reports;
    // reports already submitted keep their own copy)
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

techTaskSchema.index({ assignedTo: 1, isActive: 1 });
techTaskSchema.index({ startDate: 1 });

module.exports = mongoose.model("TechTask", techTaskSchema);