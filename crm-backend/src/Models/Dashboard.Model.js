const mongoose = require("mongoose");

// Product schema creation // structure of document
const DashboardSchema = mongoose.Schema(
  {

    id: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      required: true,
    },
  
  },
  { timestamps: true },
);
// create ACCOUNT Collection Modal: Collection
const Dashboard = mongoose.model("Dashboard", DashboardSchema);

module.exports = Dashboard;
