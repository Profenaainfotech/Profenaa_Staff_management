const mongoose = require("mongoose");

// =====================================================================
// TECHNOLOGIES CATALOG - what the admin has deleted from it
//
// The full list of projects (domains) and work items still lives in
// Utils/technologyCatalog.js. This single document (key = "technologies")
// only remembers which of them the admin deleted from the Create / Edit
// Technologies form, so they stop being offered. Projects that already
// used them keep their own stored copy and are not touched.
// =====================================================================
const techCatalogStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "technologies" },
    removedDomains: { type: [String], default: [] },
    removedItemIds: { type: [Number], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TechCatalogState", techCatalogStateSchema);
