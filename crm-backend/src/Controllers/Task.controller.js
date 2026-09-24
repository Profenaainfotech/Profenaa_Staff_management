// =====================================================================
// TASKS
//
// The single place any assigned work is actually tracked - whether the admin typed it in
// directly here, or it came from a Project someone was assigned to or self-assigned (see
// Project.controller). A task with a projectId is completed exactly the same way as any
// other: submit a link, or have an admin change its status. The only difference is that
// completing (or un-completing) a task with a projectId also mirrors the result back onto
// that project, so the Projects screens and the staff leaderboard stay accurate without
// running their own, separate evaluation logic.
// =====================================================================
const Task = require("../Models/Task.Model");
const Project = require("../Models/Project.Model");
const notify = require("../Services/notification.service");
const { ok, handle, isObjectId, httpError } = require("../Utils/http");
const { releaseSlot } = require("./Project.controller");

const STATUSES = ["Pending", "In Progress", "Completed"];
const isAdmin = (req) => req.actor?.type === "admin";
const holds = (req, task) => task.assignedTo && String(task.assignedTo) === String(req.actor.id);

/**
 * Mirror a task's outcome back onto the project it came from (if any), so the Projects
 * screens and the leaderboard read it without their own copy of this logic.
 *   completed = true  -> the task just finished: copy the result across, release the
 *                        staff member's project slot so they can take another one
 *   completed = false -> the task was moved away from Completed: clear the mirrored result
 */
async function syncProjectFromTask(task, completed) {
  if (!task.projectId) return;
  const project = await Project.findById(task.projectId);
  if (!project) return;

  if (completed) {
    const finishedAt = task.submittedAt || new Date();
    project.status = "Completed";
    project.completedAt = finishedAt;
    project.completedOnTime = project.dueDate ? finishedAt.getTime() <= new Date(project.dueDate).getTime() : null;
    project.completionMinutes = Math.max(0, Math.round((finishedAt.getTime() - new Date(task.assignedAt).getTime()) / 60000));
    await project.save();
    await releaseSlot(project.assignedTo);
  } else {
    project.status = "Assigned";
    project.completedAt = null;
    project.completedOnTime = null;
    project.completionMinutes = null;
    await project.save();
  }
}

// =====================================================================
// CREATE TASK  (admin)
// =====================================================================
const createTask = handle(async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) throw httpError(400, "Task title is required.");
  const { assignedTo } = req.body;
  if (!assignedTo) throw httpError(400, "Assigned user is required.");

  const task = await Task.create({
    title,
    description: String(req.body.description || "").trim(),
    assignedTo,
    assignedToName: req.body.assignedToName || "",
    assignedBy: req.admin?.name || "Admin",
    assignedAt: new Date(),
    dueDate: req.body.dueDate || null,
    status: STATUSES.includes(req.body.status) ? req.body.status : "Pending",
  });

  notify.notifyUser(assignedTo, {
    category: "task",
    type: "TASK_ASSIGNED",
    severity: "info",
    title: "New task assigned",
    message: `${task.title}${task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}`,
    link: "My Tasks",
  });

  return ok(res, { message: "Task created successfully.", task }, 201);
});

// =====================================================================
// EDIT  (admin) - title, description, due date
// =====================================================================
const updateTask = handle(async (req, res) => {
  if (!isObjectId(req.params.taskId)) throw httpError(400, "Invalid task.");
  const task = await Task.findById(req.params.taskId);
  if (!task) throw httpError(404, "Task not found.");

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) throw httpError(400, "Task title is required.");
    task.title = title;
  }
  if (req.body.description !== undefined) task.description = String(req.body.description).trim();
  if (req.body.dueDate !== undefined) {
    if (req.body.dueDate === "" || req.body.dueDate === null) {
      task.dueDate = null;
    } else {
      const d = new Date(req.body.dueDate);
      if (Number.isNaN(d.getTime())) throw httpError(400, "The due date is not a valid date.");
      task.dueDate = d;
    }
  }
  await task.save();

  // keep the project this task came from showing the same due date
  if (task.projectId) await Project.updateOne({ _id: task.projectId }, { $set: { dueDate: task.dueDate } });

  return ok(res, { message: "Task updated successfully.", task });
});

// =====================================================================
// LISTS
// =====================================================================
const getAllTasks = handle(async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  return ok(res, { tasks });
});

const getTaskById = handle(async (req, res) => {
  if (!isObjectId(req.params.taskId)) throw httpError(400, "Invalid task.");
  const task = await Task.findById(req.params.taskId);
  if (!task) throw httpError(404, "Task not found.");
  if (!isAdmin(req) && !holds(req, task)) throw httpError(403, "You can only see your own tasks.");
  return ok(res, { task });
});

const getTasksByUser = handle(async (req, res) => {
  const { userId } = req.params;
  if (!isObjectId(userId)) throw httpError(400, "Invalid user.");
  if (!isAdmin(req) && String(req.actor.id) !== userId) throw httpError(403, "You can only see your own tasks.");
  const tasks = await Task.find({ assignedTo: userId }).sort({ createdAt: -1 });
  return ok(res, { tasks });
});

// =====================================================================
// UPDATE STATUS  (the person who holds it, or an admin correcting it)
// =====================================================================
const updateTaskStatus = handle(async (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;
  if (!isObjectId(taskId)) throw httpError(400, "Invalid task.");
  if (!STATUSES.includes(status)) throw httpError(400, "Invalid task status.");

  const task = await Task.findById(taskId);
  if (!task) throw httpError(404, "Task not found.");
  if (!isAdmin(req) && !holds(req, task)) throw httpError(403, "You are not authorized to update this task.");

  const was = task.status;
  if (was === status) return ok(res, { message: "Task status updated successfully.", task });

  if (!isAdmin(req)) {
    if (status === "Completed") throw httpError(400, "Submit your work (with a link) to complete this task.");
    const forward = was === "Pending" && status === "In Progress";
    if (!forward) throw httpError(400, `A task cannot go back from ${was} to ${status}. Ask an administrator.`);
  }

  task.status = status;
  await task.save();
  if (status === "Completed" && was !== "Completed") await syncProjectFromTask(task, true);
  else if (was === "Completed" && status !== "Completed") await syncProjectFromTask(task, false);

  return ok(res, { message: "Task status updated successfully.", task });
});

// =====================================================================
// SUBMIT TASK WORK  (the person who holds it)
// =====================================================================
const submitTaskWork = handle(async (req, res) => {
  const { taskId } = req.params;
  const content = String(req.body.content || "").trim();
  const taskUrl = String(req.body.taskUrl || "").trim();
  if (!content) throw httpError(400, "Completed work content is required.");
  if (!taskUrl) throw httpError(400, "Task URL is required.");

  const task = await Task.findById(taskId);
  if (!task) throw httpError(404, "Task not found.");
  if (!holds(req, task)) throw httpError(403, "You are not assigned to this task.");

  const was = task.status;
  task.content = content;
  task.taskUrl = taskUrl;
  task.submittedAt = new Date();
  task.submittedBy = { userId: req.actor.id, userName: req.actor.name };
  task.status = "Completed"; // submitting work is what finishes a task
  await task.save();
  if (was !== "Completed") await syncProjectFromTask(task, true);

  notify.notifyAdmins({
    category: "task",
    type: "TASK_SUBMITTED",
    severity: "info",
    title: `${req.actor.name} submitted work`,
    message: task.title,
    link: "Tasks",
  });

  return ok(res, { message: "Task work submitted successfully.", task });
});

// =====================================================================
// COMMENTS  (the person who holds the task, or an admin)
// =====================================================================
const addTaskComment = handle(async (req, res) => {
  const { taskId } = req.params;
  const comment = String(req.body.comment || "").trim();
  if (!isObjectId(taskId)) throw httpError(400, "Invalid task.");
  if (!comment) throw httpError(400, "Comment is required.");

  const task = await Task.findById(taskId);
  if (!task) throw httpError(404, "Task not found.");
  if (!isAdmin(req) && !holds(req, task)) throw httpError(403, "You can only comment on your own tasks.");

  task.comments.push({ userId: req.actor.id, userName: req.actor.name, comment });
  await task.save();

  if (isAdmin(req)) {
    notify.notifyUser(task.assignedTo, {
      category: "task",
      type: "TASK_COMMENT",
      severity: "info",
      title: "New comment on your task",
      message: `${task.title}: ${comment.slice(0, 120)}`,
      link: "My Tasks",
    });
  } else {
    notify.notifyAdmins({
      category: "task",
      type: "TASK_COMMENT",
      severity: "info",
      title: `${req.actor.name} commented on a task`,
      message: `${task.title}: ${comment.slice(0, 120)}`,
      link: "Tasks",
    });
  }

  return ok(res, { message: "Comment added successfully.", task });
});

const deleteTaskComment = handle(async (req, res) => {
  const { taskId, commentId } = req.params;
  if (!isObjectId(taskId)) throw httpError(400, "Invalid task.");

  const task = await Task.findById(taskId);
  if (!task) throw httpError(404, "Task not found.");

  const comment = task.comments.id(commentId);
  if (!comment) throw httpError(404, "Comment not found.");
  if (!isAdmin(req) && String(comment.userId) !== String(req.actor.id)) throw httpError(403, "You can only delete your own comments.");

  task.comments = task.comments.filter((c) => String(c._id) !== String(commentId));
  await task.save();
  return ok(res, { message: "Comment deleted successfully.", task });
});

module.exports = {
  createTask,
  updateTask,
  getTasksByUser,
  getAllTasks,
  getTaskById,
  updateTaskStatus,
  addTaskComment,
  deleteTaskComment,
  submitTaskWork,
  syncProjectFromTask,
};