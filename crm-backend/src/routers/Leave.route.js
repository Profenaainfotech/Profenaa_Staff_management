const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Leave.controller");

const r = express.Router();

// employee
r.post("/", anyAuth.userOnly, c.apply);
r.get("/mine", anyAuth.userOnly, c.mine);
r.get("/balance", anyAuth.userOnly, c.balance);
r.patch("/:id/cancel", anyAuth.userOnly, c.cancel);

// admin
r.get("/", anyAuth.adminOnly, c.listAll);
r.patch("/:id/decide", anyAuth.adminOnly, c.decide);

module.exports = r;
