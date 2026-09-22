#!/usr/bin/env node
// Profenaa office Wi-Fi attendance agent
//
//   node index.js            run the agent (default)
//   node index.js --setup    register this computer (asks for your CRM login once)
//   node index.js --wifi     show the Wi-Fi network / BSSID this PC sees right now
//   node index.js --status   show device, queue and server status
const fs = require("fs");
const path = require("path");
const cfg = require("./src/config");
const wifi = require("./src/wifi");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

async function showWifi() {
  const w = await wifi.current();
  if (!w.connected) return console.log("Not connected to Wi-Fi.");
  console.log(`SSID : ${w.ssid || "(hidden)"}`);
  console.log(`BSSID: ${w.bssid || "(hidden)"}`);
  if (w.hidden) console.log("\nWindows is hiding the details. Turn on Settings > Privacy & security > Location.");
  else console.log("\nAdministrators: add this SSID + BSSID to the branch under Wi-Fi Setup.");
}

async function showStatus() {
  const queue = require("./src/queue");
  const api = require("./src/api");
  const device = cfg.loadDevice();
  console.log(`Server : ${cfg.serverUrl()}`);
  console.log(`Data   : ${cfg.dataDir()}`);
  console.log(`Device : ${device ? `${device.deviceId} (${device.status || "?"}, user ${device.userName})` : "NOT SET UP - run --setup"}`);
  console.log(`Queue  : ${queue.size()} reading(s) waiting`);
  const st = cfg.loadState();
  console.log(`Last state: ${st.lastState || "unknown"}`);
  if (!device) return;
  try {
    const res = await api.request("GET", "/api/agent/config", { device: device.deviceToken, timeoutMs: 8000 });
    console.log(`Server says: ${res.status} ${JSON.stringify(res.body)}`);
  } catch (e) {
    console.log(`Server unreachable: ${e.message}`);
  }
}

// only one agent per computer (two would fight over the same queue file)
function takeLock() {
  const lock = path.join(cfg.dataDir(), "agent.lock");
  try {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        console.error(`The agent is already running (process ${pid}).`);
        process.exit(1);
      } catch (_) {
        /* stale lock from a crashed run */
      }
    }
  } catch (_) {
    /* no lock */
  }
  fs.writeFileSync(lock, String(process.pid));
  const release = () => {
    try {
      if (Number(fs.readFileSync(lock, "utf8")) === process.pid) fs.unlinkSync(lock);
    } catch (_) {
      /* ignore */
    }
  };
  process.on("exit", release);
}

async function main() {
  if (has("--setup")) return require("./src/setup").setup();
  if (has("--wifi")) return showWifi();
  if (has("--status")) return showStatus();

  const { createAgent } = require("./src/agent");
  const agent = createAgent();
  takeLock();

  const stop = (sig) => async () => {
    await agent.shutdown(sig);
    process.exit(0);
  };
  ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"].forEach((s) => process.on(s, stop(s)));
  process.on("unhandledRejection", (e) => console.error("Unhandled:", e));

  await agent.start();
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
