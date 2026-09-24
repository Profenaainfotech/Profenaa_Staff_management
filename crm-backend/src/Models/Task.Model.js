const mongoose = require("mongoose");

// =====================================================
// COMMENT SCHEMA
// =====================================================

const commentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAccounts",
      required: true,
    },

    userName: {
      type: String,
      required: true,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// TASK SCHEMA
// =====================================================

const taskSchema = new mongoose.Schema(
  {
    // -------------------------------------------------
    // TASK DETAILS
    // -------------------------------------------------

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // -------------------------------------------------
    // ASSIGNED USER
    // -------------------------------------------------

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAccounts",
      required: true,
    },

    assignedToName: {
      type: String,
      default: "",
    },

    // -------------------------------------------------
    // ADMIN
    // -------------------------------------------------

    assignedBy: {
      type: String,
      default: "Admin",
    },

    // -------------------------------------------------
    // ORIGIN
    // -------------------------------------------------

    // Set when this task was created automatically because a Project was assigned to
    // someone (by the admin, or self-assigned by the staff member). Null for a task the
    // admin created directly - the two are tracked and evaluated exactly the same way from
    // this point on, there is no separate "project tracking" once a task exists.
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Projects",
      default: null,
    },

    // Copied from the project at the moment it became a task (Internal / External), so the
    // Tasks screens can show it without an extra lookup. Null for a task with no project.
    projectType: {
      type: String,
      enum: ["Internal", "External", null],
      default: null,
    },

    // -------------------------------------------------
    // DATE
    // -------------------------------------------------

    assignedAt: {
      type: Date,
      default: Date.now,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    // -------------------------------------------------
    // STATUS
    // -------------------------------------------------

    status: {
      type: String,
      enum: [
        "Pending",
        "In Progress",
        "Completed",
      ],
      default: "Pending",
    },

    // =================================================
    // SUBMITTED WORK
    // =================================================

    // Completed work/content submitted by user
    content: {
      type: String,
      default: "",
      trim: true,
    },

    // Google Drive / GitHub / Website URL
    taskUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // Submission date
    submittedAt: {
      type: Date,
      default: null,
    },

    // User who submitted
    submittedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UserAccounts",
        default: null,
      },

      userName: {
        type: String,
        default: "",
      },
    },

    // -------------------------------------------------
    // COMMENTS
    // -------------------------------------------------

    comments: {
      type: [commentSchema],
      default: [],
    },
  },

  {
    timestamps: true,
  }
);

taskSchema.index({ projectId: 1 });

module.exports = mongoose.model(
  "Task",
  taskSchema
);