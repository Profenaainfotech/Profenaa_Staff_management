const express = require("express");
const AdminRouter = express.Router();
const { createAdminAccount, LoginAdmin } = require("../Controllers/Admin.controller");
const bootstrapOrAdmin = require("../Middleware/adminBootstrap");

// POST route to register/create admin account first
// Open only while no admin exists (first-time setup); afterwards needs an admin token
AdminRouter.post("/register", bootstrapOrAdmin, createAdminAccount);

// POST route to login to the account afterward
AdminRouter.post("/login", LoginAdmin);

module.exports = AdminRouter;