// =====================================================
// SOCKET.IO - real-time delivery
// =====================================================
// Rooms:  user:<id>   one per employee
//         admins      every admin (admin:<id> also joined)
// Clients authenticate with the SAME JWT they already use for REST calls
// (employee token or admin token) via  io(url, { auth: { token } }).
// =====================================================
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { USER_SECRET, ADMIN_SECRET } = require("../Utils/secrets");

let io = null;

function identify(token) {
  if (!token) return null;
  try {
    const d = jwt.verify(token, USER_SECRET);
    const id = d.id || d.userId;
    if (id) return { type: "user", id: String(id) };
  } catch (_) {
    /* not a user token */
  }
  try {
    const d = jwt.verify(token, ADMIN_SECRET);
    if (d.id && d.role === "admin") return { type: "admin", id: String(d.id) };
  } catch (_) {
    /* not an admin token */
  }
  return null;
}

function init(httpServer) {
  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : true;

  io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  io.use((socket, next) => {
    const who = identify(socket.handshake.auth?.token || socket.handshake.query?.token);
    if (!who) return next(new Error("unauthorized"));
    socket.data.who = who;
    next();
  });

  io.on("connection", (socket) => {
    const { type, id } = socket.data.who;
    if (type === "admin") {
      socket.join("admins");
      socket.join(`admin:${id}`);
    } else {
      socket.join(`user:${id}`);
    }
  });

  console.log("[Socket] Real-time notifications ready");
  return io;
}

const emitToUser = (userId, event, payload) => io && io.to(`user:${userId}`).emit(event, payload);
const emitToAdmin = (adminId, event, payload) => io && io.to(`admin:${adminId}`).emit(event, payload);
const emitToAdmins = (event, payload) => io && io.to("admins").emit(event, payload);

module.exports = { init, identify, emitToUser, emitToAdmin, emitToAdmins, getIO: () => io };
