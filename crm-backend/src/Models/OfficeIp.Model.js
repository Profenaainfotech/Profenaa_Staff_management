const mongoose = require("mongoose");

// Public/LAN addresses the office agents have connected from while on the
// registered office Wi-Fi. A CRM login from one of these counts as "in the office".
const officeIpSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
    ip: { type: String, required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
officeIpSchema.index({ branchId: 1, ip: 1 }, { unique: true });

module.exports = mongoose.model("OfficeIp", officeIpSchema);
