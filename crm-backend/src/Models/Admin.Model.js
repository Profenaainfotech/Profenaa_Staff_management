const mongoose = require("mongoose");

const AdminAccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
   
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      default: "admin",
    },
  },
  { timestamps: true }
);

const Admin = mongoose.model("AdminAccount", AdminAccountSchema);

module.exports = Admin;