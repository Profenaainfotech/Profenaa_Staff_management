const express = require("express");

const {
  createTask,
  getTasksByUser,
  getAllTasks,
  getTaskById,
  updateTaskStatus,
  addTaskComment,
  deleteTaskComment,
  submitTaskWork,
} = require("../Controllers/Task.controller");

const Taskrouter =
  express.Router();

// =====================================================
// ADMIN
// =====================================================

// Create / assign task
Taskrouter.post(
  "/create-task",
  createTask
);

// Get all tasks
Taskrouter.get(
  "/get-all-tasks",
  getAllTasks
);

// Get task by ID
Taskrouter.get(
  "/get-task/:taskId",
  getTaskById
);

// =====================================================
// USER
// =====================================================

// Get tasks assigned to user
Taskrouter.get(
  "/user/:userId",
  getTasksByUser
);

// Update task status
Taskrouter.put(
  "/update-status/:taskId",
  updateTaskStatus
);

// =====================================================
// SUBMISSION
// =====================================================

Taskrouter.post(
  "/submission/:taskId",
  submitTaskWork
);

// =====================================================
// COMMENTS
// =====================================================

Taskrouter.post(
  "/comment/:taskId",
  addTaskComment
);

Taskrouter.delete(
  "/comment/:taskId/:commentId",
  deleteTaskComment
);

module.exports = Taskrouter;