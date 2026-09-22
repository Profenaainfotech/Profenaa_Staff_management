const mongoose = require("mongoose");

// Persistent notification. Delivered in real time over Socket.IO and also kept
// here so nothing is lost when the person was offline.
const notificationSchema = new mongoose.Schema(
  {
    // Users and admins live in different collections, so the recipient is
    // identified by type + id.
    recipientType: { type: String, enum: ["user", "admin"], required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },

    category: {
      type: String,
      enum: ["attendance", "leave", "device", "task", "project", "staff", "report", "system"],
      default: "system",
    },
    type: { type: String, required: true },
    severity: {
      type: String,
      enum: ["info", "success", "warning", "critical"],
      default: "info",
    },

    title: { type: String, required: true, trim: true },
    message: { type: String, default: "", trim: true },

    // Tab / screen the notification should open in the dashboard
    link: { type: String, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Prevents the same alert firing twice (e.g. "late today")
    dedupeKey: { type: String, default: null },

    readAt: { type: Date, default: null },

    // Set when the person deletes it. An alert that has a dedupeKey is only HIDDEN (not erased),
    // otherwise the next attendance check would simply create the same alert again.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientType: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientType: 1, recipientId: 1, readAt: 1 });
notificationSchema.index({ recipientId: 1, dedupeKey: 1 });
// keep 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", notificationSchema);
