const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Holiday.controller");

const r = express.Router();
r.get("/", anyAuth, c.list);
r.post("/", anyAuth.adminOnly, c.create);
r.delete("/:id", anyAuth.adminOnly, c.remove);

module.exports = r;
