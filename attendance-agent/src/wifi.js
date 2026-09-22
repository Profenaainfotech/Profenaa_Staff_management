// Reads which Wi-Fi network this computer is connected to.
//
//  Windows : netsh wlan show interfaces
//  Linux   : nmcli (for development)
//  Testing : ATTENDANCE_FAKE_WIFI_FILE=path.json  ->  {"connected":true,"ssid":"..","bssid":".."}
//
// Windows 11 24H2 and newer hide the SSID/BSSID unless Location services are on
// (Settings > Privacy & security > Location). We detect that case and say so.
const fs = require("fs");
const { execFile } = require("child_process");

const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout)));
  });
}

/**
 * Parse `netsh wlan show interfaces`. Exported for tests.
 * Windows 10 prints "BSSID", Windows 11 prints "AP BSSID"; both are handled.
 * Only the SSID / BSSID labels are relied on because they are not translated;
 * "Name" and "State" are localised, so they are optional.
 */
function parseNetsh(text) {
  const interfaces = [];
  let cur = null;
  const fresh = () => ({ name: "", state: "", ssid: "", bssid: "", touched: false });

  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/); // split at the FIRST colon (BSSIDs contain colons)
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2];

    if (key === "name") {
      if (!cur || cur.touched) {
        cur = fresh();
        interfaces.push(cur);
      }
      cur.name = val;
      continue;
    }
    if (!cur) {
      cur = fresh();
      interfaces.push(cur);
    }
    if (key === "state") {
      cur.state = val.toLowerCase();
      cur.touched = true;
    } else if (key === "ssid") {
      cur.ssid = val;
      cur.touched = true;
    } else if (key === "bssid" || key === "ap bssid") {
      cur.bssid = val;
      cur.touched = true;
    }
  }

  // "connected" is localised on non-English Windows, so a visible SSID also counts
  const active = interfaces.find((i) => i.state === "connected" || i.ssid);
  if (!active) return { connected: false, ssid: "", bssid: "", hidden: false };
  const bssid = MAC.test(active.bssid) ? active.bssid.replace(/-/g, ":").toUpperCase() : "";
  const isConnected = active.state === "connected" || Boolean(active.ssid);
  return {
    connected: isConnected,
    ssid: active.ssid,
    bssid,
    hidden: isConnected && !active.ssid && !bssid, // connected but the OS is hiding details
  };
}

function parseNmcli(text) {
  for (const line of String(text).split(/\r?\n/)) {
    // ACTIVE:SSID:BSSID  with escaped colons in the BSSID
    const m = line.match(/^yes:(.*):((?:[0-9A-F]{2}\\:){5}[0-9A-F]{2})$/i);
    if (m) return { connected: true, ssid: m[1].replace(/\\:/g, ":"), bssid: m[2].replace(/\\:/g, ":").toUpperCase(), hidden: false };
  }
  return { connected: false, ssid: "", bssid: "", hidden: false };
}

async function current() {
  const fake = process.env.ATTENDANCE_FAKE_WIFI_FILE;
  if (fake) {
    try {
      const j = JSON.parse(fs.readFileSync(fake, "utf8"));
      return { connected: Boolean(j.connected), ssid: j.ssid || "", bssid: j.bssid || "", hidden: false };
    } catch (_) {
      return { connected: false, ssid: "", bssid: "", hidden: false };
    }
  }
  if (process.platform === "win32") return parseNetsh(await run("netsh", ["wlan", "show", "interfaces"]));
  if (process.platform === "linux") return parseNmcli(await run("nmcli", ["-t", "-f", "ACTIVE,SSID,BSSID", "dev", "wifi"]));
  return { connected: false, ssid: "", bssid: "", hidden: false };
}

module.exports = { current, parseNetsh, parseNmcli };
