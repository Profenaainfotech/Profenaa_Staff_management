const express = require("express");
const DashboardRouter = express.Router();

console.log("Dashboard request received......");

// Import Controller
const DashboardController = require("../Controllers/Dashboard.controller");


// CREATE PROFILE
// POST
// http://localhost:8000/api/Dashboard/create-profile
DashboardRouter.post(
  "/create-profile",
  DashboardController.createProfile
);


// FIND PROFILE BY ID
// GET
// http://localhost:8000/api/Dashboard/findProfileById/1
DashboardRouter.get(
  "/findProfileById/:id",
  DashboardController.findProfileById
);


// UPDATE PROFILE
// PUT
// http://localhost:8000/api/Dashboard/update-ProfileById/1
DashboardRouter.put(
  "/update-ProfileById/:id",
  DashboardController.updateProfileById
);


// DELETE PROFILE
// DELETE
// http://localhost:8000/api/Dashboard/deleteProfileById/1
DashboardRouter.delete(
  "/deleteProfileById/:id",
  DashboardController.deleteProfileById
);


// GET ALL PROFILES
// GET
// http://localhost:8000/api/Dashboard/get-All-Profile
DashboardRouter.get(
  "/get-All-Profile",
  DashboardController.findProfileById
);


module.exports = DashboardRouter;