const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Internal = company's own project (title, description, image all mandatory)
    // External = client / outside project
    projectType: {
      type: String,
      enum: ["Internal", "External", "Technologies"],
      default: "Internal",
    },

    // Technologies projects only: which domains (Sales, HR, ...) the work belongs to, and the
    // exact work items the admin ticked (from Utils/technologyCatalog). Empty for the other types.
    domains: {
      type: [String],
      default: [],
    },
    workItems: {
      type: [
        {
          _id: false,
          itemId: { type: Number, required: true },
          title: { type: String, required: true },
          domain: { type: String, required: true },
        },
      ],
      default: [],
    },

    // The particular error / change that has to be fixed in this project
    issueDetails: {
      type: String,
      default: "",
      trim: true,
    },

    // Who created it (admin name)
    createdBy: {
      type: String,
      default: "",
      trim: true,
    },

    // Main image for project card
    cardImage: {
      type: String,
      default: "",
    },

    // Additional images
    images: [
      {
        type: String,
      },
    ],

    // The Task now tracking this project's actual work, once someone is assigned (by the
    // admin, or by self-assigning). Everything after assignment - starting, submitting,
    // being marked complete - happens on that task, not here, so there is one evaluation
    // flow instead of two.
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    // Technologies projects only: one TechTask per selected work item, for the assigned
    // person. These are what actually show up as tick boxes in their Daily Report and feed
    // the daily percentage - deleting the project removes them too, so nothing is left behind.
    techTaskIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "TechTask" }],
      default: [],
    },

    dueDate: {
      type: Date,
      default: null,
    },

    // Admin = Admin assigned
    // Self = User self-assigned
    // Pool = Available for self-assignment
    assignmentType: {
      type: String,
      enum: ["Admin", "Self", "Pool"],
      default: "Pool",
    },

    // Null when project is in Project Pool
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAccounts",
      default: null,
    },

    // Stored for easy display
    assignedToName: {
      type: String,
      default: "",
      trim: true,
    },

    assignedAt: {
      type: Date,
      default: null,
    },

    assignedBy: {
      type: String,
      default: "",
      trim: true,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // Pending = in the pool, nobody assigned yet
    // Assigned = handed off to a Task (see taskId) - that task tracks the real progress
    // Completed = mirrors the linked task's completion, for reporting and the leaderboard
    status: {
      type: String,
      enum: ["Pending", "Assigned", "Completed"],
      default: "Pending",
    },

    // Filled in when the linked task is completed (used by the staff competition)
    completedOnTime: {
      type: Boolean,
      default: null,
    },

    // Minutes from "assigned" to "completed"
    completionMinutes: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Useful indexes
ProjectSchema.index({ assignedTo: 1 });
ProjectSchema.index({ assignmentType: 1 });
ProjectSchema.index({ projectType: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ dueDate: 1 });
ProjectSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model("Projects", ProjectSchema);