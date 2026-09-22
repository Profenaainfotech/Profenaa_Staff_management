const express = require("express");

const {
  createUser,
  LoginUser,
  LogoutUser,
  getProfile,
  getAllProfiles,
  updatePasswordById,
  updateLastActive,
} = require("../Controllers/User.controller");

const userAuth = require("../Middleware/requireAuth");
const adminAuth = require("../Middleware/adminAuth");
const {
  updateAccountByAdmin,
  deleteAccount,
} = require("../Controllers/Staff.controller");

const Userrouter = express.Router();

// =====================================================
// CREATE USER
// =====================================================

// Admin only (the admin dashboard already sends its admin token)
Userrouter.post("/create-Account", adminAuth, createUser);

// =====================================================
// USER LOGIN
// =====================================================

Userrouter.post("/Log-in", LoginUser);

// =====================================================
// USER LOGOUT
// =====================================================

Userrouter.post("/logout", userAuth, LogoutUser);

// =====================================================
// GET LOGGED-IN USER PROFILE
// =====================================================

Userrouter.get("/get-profile", userAuth, getProfile);

// =====================================================
// GET ALL USERS
// =====================================================

Userrouter.get("/get-All-Profiles", getAllProfiles);

// =====================================================
// UPDATE PASSWORD
// =====================================================

// Admin only. Now also saves name / mobile (the edit form always sent them but
// the old handler only read the password). A blank password is left unchanged.
Userrouter.put("/update-PasswordById/:id", adminAuth, updateAccountByAdmin);

// =====================================================
// DELETE USER (admin) - the admin screen already calls this
// =====================================================

Userrouter.delete("/delete-Account/:id", adminAuth, deleteAccount);

// =====================================================
// UPDATE USER ACTIVITY
// =====================================================

Userrouter.put("/update-last-active", userAuth, updateLastActive);

module.exports = Userrouter;
