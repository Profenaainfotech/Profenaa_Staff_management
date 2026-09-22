const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Regularization.controller");

const r = express.Router();

r.post("/", anyAuth.userOnly, c.create);
r.get("/mine", anyAuth.userOnly, c.mine);
r.patch("/:id/cancel", anyAuth.userOnly, c.cancel);

r.get("/", anyAuth.adminOnly, c.listAll);
r.patch("/:id/decide", anyAuth.adminOnly, c.decide);

module.exports = r;
