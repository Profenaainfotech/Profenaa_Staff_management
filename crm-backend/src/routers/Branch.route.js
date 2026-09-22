const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Branch.controller");

const r = express.Router();

r.get("/", anyAuth, c.list);
r.get("/rejected-networks", anyAuth.adminOnly, c.rejectedNetworks); // before /:id
r.post("/", anyAuth.adminOnly, c.create);
r.put("/:id", anyAuth.adminOnly, c.update);
r.delete("/:id", anyAuth.adminOnly, c.remove);

r.post("/:id/networks", anyAuth.adminOnly, c.addNetwork);
r.patch("/:id/networks/:networkId", anyAuth.adminOnly, c.updateNetwork);
r.delete("/:id/networks/:networkId", anyAuth.adminOnly, c.removeNetwork);

module.exports = r;
