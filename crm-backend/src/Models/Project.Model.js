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
      enum: ["Internal", "External"],
      default: "Internal",
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

    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "Pending",
    },

    // Filled in when the project is completed (used by the staff competition)
    completedOnTime: {
      type: Boolean,
      default: null,
    },

    // Minutes from "started" to "completed"
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