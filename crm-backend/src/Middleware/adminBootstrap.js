// POST /api/admin/register used to be open to the whole internet (anyone could
// create an admin). It now works without a token ONLY while no admin exists yet
// (first-time setup); after that an existing admin's token is required.
const AdminAccount = require("../Models/Admin.Model");
const adminAuth = require("./adminAuth");

async function bootstrapOrAdmin(req, res, next) {
  try {
    const count = await AdminAccount.countDocuments();
    if (count === 0) return next();
    return adminAuth(req, res, next);
  } catch (err) {
    return res.status(500).json({ error: true, message: "Could not verify admin setup state." });
  }
}

module.exports = bootstrapOrAdmin;
