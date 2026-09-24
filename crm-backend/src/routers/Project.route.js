const express = require("express");
const router = express.Router();

const c = require("../Controllers/Project.controller");
const anyAuth = require("../Middleware/anyAuth");
const projectUpload = require("../Middleware/projectupload");

// Up to 10 images per project (the first one becomes the card cover).
// Problems with the files are answered in plain English instead of a server error.
const upload = projectUpload.fields([
  { name: "cardImage", maxCount: 1 },
  { name: "images", maxCount: 10 },
]);
const uploadImages = (req, res, next) =>
  upload(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Each image must be 5 MB or smaller."
        : err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT"
        ? "You can add at most 10 images."
        : err.message || "The images could not be uploaded.";
    return res.status(400).json({ success: false, message });
  });

// ---------------- admin: create / edit / delete / see everything ----------------
router.post("/create-project", anyAuth.adminOnly, uploadImages, c.createProject);
// Technologies projects: plain JSON (title, assignedTo, workItemIds) - no images
router.post("/create-technology", anyAuth.adminOnly, c.createTechnologyProject);
router.get("/get-all-projects", anyAuth.adminOnly, c.getAllProjects);
router.put("/:projectId", anyAuth.adminOnly, uploadImages, c.updateProject);
router.delete("/:projectId", anyAuth.adminOnly, c.deleteProject);

// ---------------- staff (and admin) ----------------
// IMPORTANT: fixed paths must come BEFORE "/:projectId"
router.get("/pool", anyAuth, c.getProjectPool);
router.get("/technology-catalog", anyAuth, c.getTechnologycatalog);
router.get("/leaderboard", anyAuth, c.getLeaderboard);
router.get("/user/:userId", anyAuth, c.getUserProjects);
router.get("/stats/:userId", anyAuth, c.getUserProjectStats);

// Staff take a project from the pool. This immediately creates the matching task (see
// Task.route's own endpoints) - there is nothing further to do on the project itself:
// starting it, submitting a link, being marked complete all happen on that task.
router.put("/self-assign/:projectId", anyAuth.userOnly, c.selfAssignProject);

module.exports = router;
