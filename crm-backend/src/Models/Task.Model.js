const mongoose = require("mongoose");

// =====================================================
// COMMENT SCHEMA
// =====================================================

const commentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
      ref: "User",
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
        ref: "User",
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

module.exports = mongoose.model(
  "Task",
  taskSchema
);