const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/TechTask.controller");

const r = express.Router();

// STAFF - only their own allocated work (fixed path, before "/:id")
r.get("/my", anyAuth.userOnly, c.mine);

// ADMIN
r.get("/performance", anyAuth.adminOnly, c.performance);
r.get("/", anyAuth.adminOnly, c.list);
r.post("/", anyAuth.adminOnly, c.create);
r.put("/:id", anyAuth.adminOnly, c.update);
r.delete("/:id", anyAuth.adminOnly, c.remove);

module.exports = r;