const mongoose = require("mongoose");

// One row per project that somebody is taking from the pool.
// The unique index on projectId is what makes "two people click at the same moment"
// safe: the database lets exactly ONE insert through, whatever database engine is used.
const projectClaimSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Projects", required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccounts", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("ProjectClaim", projectClaimSchema);
