require("dotenv").config();

const http = require("http");

const app = require("../app");
const connectWithDB = require("./Config/db.Config");
const socket = require("./Services/socket");
const monitor = require("./Services/attendanceMonitor");
const birthdayReminder = require("./Services/birthdayReminder.service");

const PORT = process.env.PORT || 8000;

// Express runs inside a plain HTTP server so Socket.IO (real-time notifications)
// can share the same port.
const httpServer = http.createServer(app);
socket.init(httpServer);

// Never let one bad request or background task take the whole API down.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

httpServer.listen(PORT, async () => {
  await connectWithDB();
  console.log(`Server started on port ${PORT}`);
  monitor.start();
  birthdayReminder.start();
});
