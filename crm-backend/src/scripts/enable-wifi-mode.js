// =====================================================
// ENABLE WI-FI ATTENDANCE FOR EXISTING STAFF
//
//   node src/scripts/enable-wifi-mode.js --branch "Pollachi" --all
//   node src/scripts/enable-wifi-mode.js --branch "Pollachi" --users "Yokesh,Praveen"
//   node src/scripts/enable-wifi-mode.js --branch "Pollachi" --all --dry-run
//
// Existing staff stay on CRM-login attendance until you run this (or use the
// bulk action in Staff Directory), so nobody suddenly shows as absent.
// =====================================================
require("dotenv").config();
const connectWithDB = require("../Config/db.Config");
const Branch = require("../Models/Branch.Model");
const User = require("../Models/User.Model");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

async function run() {
  const branchName = val("branch");
  if (!branchName || (!flag("all") && !val("users"))) {
    console.log('Usage: node src/scripts/enable-wifi-mode.js --branch "<name>" (--all | --users "A,B") [--dry-run]');
    process.exit(1);
  }

  await connectWithDB();
  const branch = await Branch.findOne({ name: branchName });
  if (!branch) {
    const names = (await Branch.find({}).select("name").lean()).map((b) => b.name).join(", ");
    console.error(`Branch "${branchName}" not found. Existing branches: ${names || "(none - run npm run seed)"}`);
    process.exit(1);
  }

  const query = { isActive: { $ne: false } };
  if (val("users")) query.name = { $in: val("users").split(",").map((s) => s.trim()) };
  const users = await User.find(query).select("name attendanceMode branchId");

  for (const u of users) {
    console.log(`${flag("dry-run") ? "[dry-run] " : ""}${u.name}: ${u.attendanceMode || "CRM_LOGIN"} -> WIFI @ ${branch.name}`);
    if (!flag("dry-run")) {
      u.attendanceMode = "WIFI";
      u.branchId = branch._id;
      await u.save();
    }
  }
  console.log(`\n${users.length} staff ${flag("dry-run") ? "would be" : "were"} switched to Wi-Fi attendance.`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
