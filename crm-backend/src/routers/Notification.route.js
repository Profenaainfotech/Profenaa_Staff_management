const express = require("express");
const anyAuth = require("../Middleware/anyAuth");
const c = require("../Controllers/Notification.controller");

const r = express.Router();

r.get("/", anyAuth, c.list);
r.get("/unread-count", anyAuth, c.unreadCount);
r.get("/counts", anyAuth, c.counts);
r.post("/read-all", anyAuth, c.markAllRead);
r.post("/broadcast", anyAuth.adminOnly, c.broadcast);
r.delete("/", anyAuth, c.clear);
r.delete("/read", anyAuth, c.clearRead);
r.patch("/:id/read", anyAuth, c.markRead);
r.delete("/:id", anyAuth, c.remove);

module.exports = r;
