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

// ---------------- admin ----------------
router.post("/create-project", anyAuth.adminOnly, uploadImages, c.createProject);
router.get("/get-all-projects", anyAuth.adminOnly, c.getAllProjects);

// ---------------- staff (and admin) ----------------
// IMPORTANT: fixed paths must come BEFORE "/:projectId"
router.get("/pool", anyAuth, c.getProjectPool);
router.get("/leaderboard", anyAuth, c.getLeaderboard);
router.get("/user/:userId", anyAuth, c.getUserProjects);
router.get("/stats/:userId", anyAuth, c.getUserProjectStats);

// staff take a project from the pool (optionally starting it), start it, submit it for review
router.put("/self-assign/:projectId", anyAuth.userOnly, c.selfAssignProject);
router.put("/start/:projectId", anyAuth.userOnly, c.startProject);
router.put("/submit/:projectId", anyAuth.userOnly, c.submitProject);
// the person who holds it moves it forward (never straight to Completed); an admin can correct any status
router.put("/update-status/:projectId", anyAuth, c.updateProjectStatus);

// ---------------- admin: edit / delete one project ----------------
router.put("/:projectId", anyAuth.adminOnly, uploadImages, c.updateProject);
router.delete("/:projectId", anyAuth.adminOnly, c.deleteProject);

module.exports = router;