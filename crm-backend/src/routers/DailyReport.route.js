const express = require("express");
const requireAuth = require("../Middleware/requireAuth");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/DailyReport.controller");

const r = express.Router();

// EMPLOYEE
r.get("/my", requireAuth, c.myReport);
r.put("/my", requireAuth, c.saveDraft);
r.post("/my/submit", requireAuth, c.submit);
r.get("/my/list", requireAuth, c.myList);

// ADMIN (fixed paths first, then :id)
r.get("/summary", anyAuth.adminOnly, c.summary);
r.get("/", anyAuth.adminOnly, c.adminList);
r.get("/:id", anyAuth.adminOnly, c.getOne);
r.patch("/:id/reopen", anyAuth.adminOnly, c.reopen);

module.exports = r;
