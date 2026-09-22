const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Setting.controller");

const r = express.Router();
r.get("/", anyAuth, c.get);
r.put("/", anyAuth.adminOnly, c.update);

module.exports = r;
