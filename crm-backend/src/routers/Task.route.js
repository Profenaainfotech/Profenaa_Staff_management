const express = require("express");
const anyAuth = require("../Middleware/anyAuth");

const {
  createTask,
  updateTask,
  getTasksByUser,
  getAllTasks,
  getTaskById,
  updateTaskStatus,
  addTaskComment,
  deleteTaskComment,
  submitTaskWork,
} = require("../Controllers/Task.controller");

const Taskrouter = express.Router();

// =====================================================
// ADMIN
// =====================================================

Taskrouter.post("/create-task", anyAuth.adminOnly, createTask);
Taskrouter.get("/get-all-tasks", anyAuth.adminOnly, getAllTasks);
Taskrouter.put("/update-task/:taskId", anyAuth.adminOnly, updateTask);

// =====================================================
// STAFF (and admin)
// =====================================================
// IMPORTANT: fixed paths must come before "/:taskId"

Taskrouter.get("/user/:userId", anyAuth, getTasksByUser);
Taskrouter.get("/get-task/:taskId", anyAuth, getTaskById);

// the person who holds it moves it forward; an admin can correct any status
Taskrouter.put("/update-status/:taskId", anyAuth, updateTaskStatus);

// =====================================================
// SUBMISSION
// =====================================================

Taskrouter.post("/submission/:taskId", anyAuth.userOnly, submitTaskWork);

// =====================================================
// COMMENTS
// =====================================================

Taskrouter.post("/comment/:taskId", anyAuth, addTaskComment);
Taskrouter.delete("/comment/:taskId/:commentId", anyAuth, deleteTaskComment);

module.exports = Taskrouter;