const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Setting.controller");

const r = express.Router();
r.get("/", anyAuth, c.get);
r.put("/", anyAuth.adminOnly, c.update);
r.post("/test-notification", anyAuth.adminOnly, c.testNotification);

module.exports = r;