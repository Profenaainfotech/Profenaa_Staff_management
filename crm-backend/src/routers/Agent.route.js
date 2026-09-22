const express = require("express");
const deviceAuth = require("../Middleware/deviceAuth");
const c = require("../Controllers/Agent.controller");

const r = express.Router();
r.use(deviceAuth);
r.get("/config", c.getConfig);
r.post("/heartbeat", c.heartbeat);
r.post("/shutdown", c.shutdown);
r.post("/batch", c.batch);
r.post("/overtime", c.overtime);

module.exports = r;
