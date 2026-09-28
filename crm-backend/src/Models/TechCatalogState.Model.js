const mongoose = require("mongoose");

// =====================================================================
// TECHNOLOGIES CATALOG - what the admin has changed in it
//
// The built-in list of projects (domains) and work items still lives in
// Utils/technologyCatalog.js. This single document (key = "technologies")
// remembers what the admin changed from the Create Technologies form:
//
//   removedDomains / removedItemIds  built-in ones the admin deleted
//   customDomains                    projects added with "+ Add new"
//   customItems                      work items added with "+ Add new"
//   renamedItems                     new names the admin gave to built-in work items
//   customIdCounter                  hands out ids for custom items (1001, 1002, ...)
//                                    so they can never clash with a built-in id
//
// Projects that already used any of these keep their own stored copy and are
// not touched when the catalog changes.
// =====================================================================
const customItemSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    domain: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const renamedItemSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const techCatalogStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "technologies" },
    removedDomains: { type: [String], default: [] },
    removedItemIds: { type: [Number], default: [] },
    customDomains: { type: [String], default: [] },
    customItems: { type: [customItemSchema], default: [] },
    renamedItems: { type: [renamedItemSchema], default: [] },
    customIdCounter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TechCatalogState", techCatalogStateSchema);