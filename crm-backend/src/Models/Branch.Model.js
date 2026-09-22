const mongoose = require("mongoose");
const { normalizeBssid, isValidBssidPattern } = require("../Utils/wifi");

// One access point / SSID that counts as "in the office".
// Register EVERY radio (2.4 GHz and 5 GHz have different BSSIDs) and every
// access point of the branch, otherwise staff who roam are marked absent.
const networkSchema = new mongoose.Schema(
  {
    ssid: { type: String, required: true, trim: true },
    bssid: {
      type: String,
      required: true,
      trim: true,
      set: normalizeBssid,
      validate: {
        validator: isValidBssidPattern,
        message: "BSSID must look like 8C:C7:C3:09:1D:70 (or end with :* for a router prefix).",
      },
    },
    band: { type: String, enum: ["2.4 GHz", "5 GHz", "Other"], default: "Other" },
    label: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { _id: true }
);

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    address: { type: String, default: "", trim: true },
    networks: { type: [networkSchema], default: [] },

    // seconds. Heartbeat = how often the agent reports.
    // Grace = how long an employee may be off the office network before the
    // session is closed.
    heartbeatInterval: { type: Number, default: 90, min: 15, max: 900 },
    gracePeriod: { type: Number, default: 300, min: 30, max: 3600 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Branch", branchSchema);
