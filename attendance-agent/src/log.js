// Tiny logger: console + a size-capped file in the data folder.
const fs = require("fs");
const path = require("path");
const { dataDir } = require("./config");

const FILE = path.join(dataDir(), "agent.log");
const MAX_BYTES = 1024 * 1024;

function write(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  console.log(line);
  try {
    if (fs.existsSync(FILE) && fs.statSync(FILE).size > MAX_BYTES) fs.renameSync(FILE, FILE + ".old");
    fs.appendFileSync(FILE, line + "\n");
  } catch (_) {
    /* logging must never crash the agent */
  }
}

module.exports = {
  info: (m) => write("INFO", m),
  warn: (m) => write("WARN", m),
  error: (m) => write("ERROR", m),
  file: FILE,
};
