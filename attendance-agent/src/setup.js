// One-time pairing. The employee signs in with their CRM credentials ONCE; the
// server issues a random DEVICE TOKEN and that is all the agent keeps.
// The password is never written to disk.
const crypto = require("crypto");
const readline = require("readline");
const os = require("os");
const cfg = require("./config");
const api = require("./api");
const wifi = require("./wifi");
const { VERSION } = require("./agent");

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => rl.output.write(s.startsWith(q) ? s : "*");
    }
    rl.question(q, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}

async function setup() {
  console.log(`\nProfenaa attendance agent ${VERSION} - setup`);
  console.log(`Server: ${cfg.serverUrl()}\n`);

  const name = process.env.AGENT_CRM_USER || (await ask("CRM username: "));
  const password = process.env.AGENT_CRM_PASSWORD || (await ask("CRM password (not stored): ", true));
  if (!name || !password) throw new Error("Username and password are required.");

  const login = await api.request("POST", "/api/UserAccounts/Log-in", { body: { name, password } });
  if (login.status !== 200) throw new Error(login.body?.message || `Sign-in failed (${login.status})`);
  const jwt = login.body.accessToken || login.body.token;
  if (!jwt) throw new Error("The server did not return a session token.");

  const existing = cfg.loadDevice();
  const deviceId = existing?.deviceId || `DEV-${crypto.randomUUID()}`;

  const reg = await api.request("POST", "/api/devices/register", {
    token: jwt,
    body: { deviceId, hostname: os.hostname(), platform: process.platform, agentVersion: VERSION },
  });
  if (reg.status !== 200 && reg.status !== 201) throw new Error(reg.body?.message || `Registration failed (${reg.status})`);

  cfg.saveDevice({
    serverUrl: cfg.serverUrl(),
    deviceId,
    deviceToken: reg.body.deviceToken,
    userName: name,
    status: reg.body.status,
    registeredAt: new Date().toISOString(),
  });

  console.log(`\nThis computer is registered (${reg.body.status}).`);
  if (reg.body.status === "PENDING") {
    console.log("An administrator has to approve it before attendance starts. You can start the agent now;");
    console.log("readings are saved and sent once it is approved.");
  } else {
    console.log("You are ready. Start the agent with:  node index.js");
  }

  const w = await wifi.current();
  console.log(`\nWi-Fi right now: ${w.connected ? `${w.ssid || "(name hidden)"}  ${w.bssid || "(BSSID hidden)"}` : "not connected"}`);
  if (w.hidden) console.log("Windows is hiding the Wi-Fi details. Turn on Settings > Privacy & security > Location.");
}

module.exports = { setup };
