// Where the agent keeps its files and how it finds the server.
//
//   serverUrl   config.json next to index.js  (or env ATTENDANCE_SERVER_URL)
//   device      <data dir>/device.json   { deviceId, deviceToken, ... }   <- no password, ever
//   state       <data dir>/state.json    cached server settings + last state
//   queue       <data dir>/queue.jsonl   readings waiting to be sent
//
// data dir:  %APPDATA%\ProfenaaAttendance  (Windows)   ~/.profenaa-attendance  (others)
//            override with env ATTENDANCE_DATA_DIR
const fs = require("fs");
const os = require("os");
const path = require("path");

function dataDir() {
  let dir = process.env.ATTENDANCE_DATA_DIR;
  if (!dir) {
    dir =
      process.platform === "win32"
        ? path.join(process.env.APPDATA || os.homedir(), "ProfenaaAttendance")
        : path.join(os.homedir(), ".profenaa-attendance");
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

// write-then-rename so a power cut never leaves a half-written file
function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const files = () => {
  const d = dataDir();
  return {
    device: path.join(d, "device.json"),
    state: path.join(d, "state.json"),
    queue: path.join(d, "queue.jsonl"),
  };
};

function serverUrl() {
  if (process.env.ATTENDANCE_SERVER_URL) return process.env.ATTENDANCE_SERVER_URL.replace(/\/+$/, "");
  const cfg = readJson(path.join(__dirname, "..", "config.json"), {});
  return String(cfg.serverUrl || "http://localhost:8000").replace(/\/+$/, "");
}

module.exports = {
  dataDir,
  files,
  serverUrl,
  loadDevice: () => readJson(files().device, null),
  saveDevice: (d) => writeJson(files().device, d),
  loadState: () => readJson(files().state, {}),
  saveState: (s) => writeJson(files().state, s),
};
