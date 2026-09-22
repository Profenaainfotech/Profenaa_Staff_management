// =====================================================
// RESET (OR CREATE) AN ADMIN PASSWORD
//
//   node src/scripts/reset-admin-password.js --list
//   node src/scripts/reset-admin-password.js <adminName> <newPassword>
//
// Examples
//   node src/scripts/reset-admin-password.js --list
//   node src/scripts/reset-admin-password.js Admin MyNewPass123
//
// * Uses the same MONGO_URI as the server (.env).
// * If <adminName> exists, only its password changes.
// * If NO admin exists at all, the admin is created (first-time setup).
// * If other admins exist but this name is not one of them, nothing is changed.
// * Employee accounts are separate (use Staff Directory > key icon).
// =====================================================
require("dotenv").config();
const mongoose = require("mongoose");
const connectWithDB = require("../Config/db.Config");
const Admin = require("../Models/Admin.Model");
const { genHashData } = require("../Utils/genHash");

const [a, b] = process.argv.slice(2);

async function main() {
  await connectWithDB();

  const admins = await Admin.find().select("name role createdAt").sort({ createdAt: 1 }).lean();

  if (a === "--list" || !a) {
    if (!admins.length) console.log("[Admin] No admin account exists yet.");
    else {
      console.log("[Admin] Admin accounts (login name / role):");
      admins.forEach((x) => console.log(`  - ${x.name}  (${x.role})`));
    }
    if (!a) console.log('\nUsage: node src/scripts/reset-admin-password.js <adminName> <newPassword>');
    return 0;
  }

  const name = String(a).trim();
  const password = String(b ?? "");
  if (password.length < 6) {
    console.error("[Admin] Give a new password of at least 6 characters:");
    console.error("        node src/scripts/reset-admin-password.js <adminName> <newPassword>");
    return 1;
  }

  const hashed = await genHashData(password);
  if (hashed.isError) {
    console.error("[Admin] Could not hash the password:", hashed.message);
    return 1;
  }

  const existing = await Admin.findOne({ name });
  if (existing) {
    existing.password = hashed.data;
    await existing.save();
    console.log(`[Admin] Password updated for "${existing.name}". Log in at /adminlogin with the new password.`);
    return 0;
  }

  if (admins.length === 0) {
    await Admin.create({ name, password: hashed.data, role: "admin" });
    console.log(`[Admin] No admin existed, so "${name}" was created. Log in at /adminlogin.`);
    return 0;
  }

  console.error(`[Admin] No admin named "${name}". Existing admin names:`);
  admins.forEach((x) => console.error(`  - ${x.name}`));
  console.error("Nothing was changed. Use one of the names above (exact spelling).");
  return 1;
}

main()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[Admin] Failed:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
