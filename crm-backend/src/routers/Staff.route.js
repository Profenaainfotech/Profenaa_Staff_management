const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Staff.controller");

const r = express.Router();
r.use(anyAuth.adminOnly);

r.get("/", c.list);
r.post("/", c.create);
r.post("/bulk", c.bulk); // before /:id
r.get("/:id", c.getOne);
r.put("/:id", c.update);
r.post("/:id/reset-password", c.resetPassword);
r.delete("/:id", c.remove);

module.exports = r;
