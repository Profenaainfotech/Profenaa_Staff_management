// =====================================================
// SEED  -  npm run seed
// Adds (never overwrites):
//   * the default attendance rules
//   * your three branches with the access points captured from
//     `netsh wlan show interfaces` during the Wi-Fi MVP
// Safe to run again: it only adds access points that are missing.
// =====================================================
require("dotenv").config();
const connectWithDB = require("../Config/db.Config");
const Branch = require("../Models/Branch.Model");
const { getSettings } = require("../Services/settings.service");
const { normalizeBssid, normalizeSsid } = require("../Utils/wifi");

const BRANCHES = [
  {
    name: "Kinathukadavu",
    networks: [
      { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70", band: "5 GHz" },
      { ssid: "PROFENAA-2G", bssid: "8C:C7:C3:09:1D:74", band: "2.4 GHz" },
    ],
  },
  {
    name: "Pollachi",
    networks: [
      // This SSID genuinely has a space after the hyphen. Keep it exactly as broadcast.
      { ssid: "PROFENAA- 2G", bssid: "14:A7:2B:EA:2E:51", band: "2.4 GHz" },
      { ssid: "PROFENAA-5G", bssid: "14:A7:2B:EA:2E:4D", band: "5 GHz" },
    ],
  },
  {
    name: "Udumalpet",
    networks: [{ ssid: "PROFENAA-2.4G", bssid: "8C:C7:C3:43:32:AC", band: "2.4 GHz" }],
  },
];

async function run() {
  await connectWithDB();
  await getSettings();
  console.log("[Seed] Attendance rules ready");

  for (const b of BRANCHES) {
    let branch = await Branch.findOne({ name: b.name });
    if (!branch) {
      branch = await Branch.create({ name: b.name, networks: b.networks });
      console.log(`[Seed] Created branch "${b.name}" with ${b.networks.length} access point(s)`);
      continue;
    }
    let added = 0;
    for (const n of b.networks) {
      const exists = branch.networks.some(
        (x) => normalizeSsid(x.ssid) === normalizeSsid(n.ssid) && normalizeBssid(x.bssid) === normalizeBssid(n.bssid)
      );
      if (!exists) {
        branch.networks.push(n);
        added += 1;
      }
    }
    if (added) await branch.save();
    console.log(`[Seed] Branch "${b.name}": ${added ? `added ${added} access point(s)` : "already up to date"}`);
  }

  console.log("\n[Seed] Done.");
  console.log("[Seed] Udumalpet only has its 2.4 GHz access point. If that router also broadcasts 5 GHz,");
  console.log("[Seed] add its BSSID in the app (Wi-Fi Setup > Branches) or staff on 5 GHz will look absent.");
  process.exit(0);
}

run().catch((err) => {
  console.error("[Seed] Failed:", err);
  process.exit(1);
});
