const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Device.controller");

const r = express.Router();

// employee
r.post("/register", anyAuth.userOnly, c.register);
r.get("/mine", anyAuth.userOnly, c.mine);
r.delete("/mine/:id", anyAuth.userOnly, c.removeMine);

// admin
r.get("/", anyAuth.adminOnly, c.listAll);
r.patch("/:id/approve", anyAuth.adminOnly, c.approve);
r.patch("/:id/revoke", anyAuth.adminOnly, c.revoke);
r.delete("/:id", anyAuth.adminOnly, c.removeAny);

module.exports = r;
