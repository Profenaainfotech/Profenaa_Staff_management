const Task = require("../Models/Task.Model");
const notify = require("../Services/notification.service");

// =====================================================
// CREATE TASK
// =====================================================

const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      assignedTo,
      assignedToName,
      assignedBy,
      dueDate,
      status,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Task title is required.",
      });
    }

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: "Assigned user is required.",
      });
    }

    const task = await Task.create({
      title: title.trim(),

      description:
        description?.trim() || "",

      assignedTo,

      assignedToName:
        assignedToName || "",

      assignedBy:
        assignedBy || "Admin",

      assignedAt: new Date(),

      dueDate:
        dueDate || null,

      status:
        status || "Pending",

      content: "",

      taskUrl: "",

      submittedAt: null,

      submittedBy: {
        userId: null,
        userName: "",
      },

      comments: [],
    });

    // Let the employee know (fire-and-forget; never blocks or breaks task creation)
    notify.notifyUser(assignedTo, {
      category: "task",
      type: "TASK_ASSIGNED",
      severity: "info",
      title: "New task assigned",
      message: `${task.title}${task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}`,
      link: "My Tasks",
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      task,
    });
  } catch (error) {
    console.error(
      "CREATE TASK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to create task.",
    });
  }
};

// =====================================================
// GET ALL TASKS
// =====================================================

const getAllTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error(
      "GET ALL TASKS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get tasks.",
    });
  }
};

// =====================================================
// GET TASK BY ID
// =====================================================

const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(
      taskId
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    return res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error(
      "GET TASK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get task.",
    });
  }
};

// =====================================================
// GET TASKS BY USER
// =====================================================

const getTasksByUser = async (
  req,
  res
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    const tasks = await Task.find({
      assignedTo: userId,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error(
      "GET USER TASKS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get user tasks.",
    });
  }
};

// =====================================================
// UPDATE TASK STATUS
// =====================================================

const updateTaskStatus = async (
  req,
  res
) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "Pending",
      "In Progress",
      "Completed",
    ];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid task status.",
      });
    }

    const task =
      await Task.findByIdAndUpdate(
        taskId,
        {
          status,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Task status updated successfully.",
      task,
    });
  } catch (error) {
    console.error(
      "UPDATE STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update task status.",
    });
  }
};

// =====================================================
// SUBMIT TASK WORK
// =====================================================

const submitTaskWork = async (
  req,
  res
) => {
  try {
    const { taskId } = req.params;

    const {
      userId,
      userName,
      content,
      taskUrl,
    } = req.body;

    console.log(
      "================================="
    );

    console.log(
      "TASK SUBMISSION"
    );

    console.log(
      "Task ID:",
      taskId
    );

    console.log(
      "User ID:",
      userId
    );

    console.log(
      "User Name:",
      userName
    );

    console.log(
      "Content:",
      content
    );

    console.log(
      "Task URL:",
      taskUrl
    );

    console.log(
      "================================="
    );

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (!userId) {
      return res.status(400).json({
        success: false,
        message:
          "User ID is required.",
      });
    }

    if (!content?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Completed work content is required.",
      });
    }

    if (!taskUrl?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Task URL is required.",
      });
    }

    // -------------------------------------------------
    // FIND TASK
    // -------------------------------------------------

    const task =
      await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    // -------------------------------------------------
    // CHECK USER
    // -------------------------------------------------

    if (
      task.assignedTo.toString() !==
      userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not assigned to this task.",
      });
    }

    // -------------------------------------------------
    // SAVE SUBMISSION
    // -------------------------------------------------

    task.content =
      content.trim();

    task.taskUrl =
      taskUrl.trim();

    task.submittedAt =
      new Date();

    task.submittedBy = {
      userId: userId,

      userName:
        userName || "User",
    };

    // Automatically mark completed
    task.status = "Completed";

    await task.save();

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Task work submitted successfully.",

      task,
    });
  } catch (error) {
    console.error(
      "SUBMIT TASK WORK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to submit task work.",
    });
  }
};

// =====================================================
// ADD COMMENT
// =====================================================

const addTaskComment = async (
  req,
  res
) => {
  try {
    const { taskId } =
      req.params;

    const {
      userId,
      userName,
      comment,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message:
          "User ID is required.",
      });
    }

    if (!comment?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Comment is required.",
      });
    }

    const task =
      await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    task.comments.push({
      userId,

      userName:
        userName || "User",

      comment:
        comment.trim(),
    });

    await task.save();

    return res.status(200).json({
      success: true,

      message:
        "Comment added successfully.",

      task,
    });
  } catch (error) {
    console.error(
      "ADD COMMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to add comment.",
    });
  }
};

// =====================================================
// DELETE COMMENT
// =====================================================

const deleteTaskComment = async (
  req,
  res
) => {
  try {
    const {
      taskId,
      commentId,
    } = req.params;

    const task =
      await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    task.comments =
      task.comments.filter(
        (comment) =>
          comment._id.toString() !==
          commentId.toString()
      );

    await task.save();

    return res.status(200).json({
      success: true,

      message:
        "Comment deleted successfully.",

      task,
    });
  } catch (error) {
    console.error(
      "DELETE COMMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to delete comment.",
    });
  }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createTask,
  getTasksByUser,
  getAllTasks,
  getTaskById,
  updateTaskStatus,
  addTaskComment,
  deleteTaskComment,
  submitTaskWork,
};