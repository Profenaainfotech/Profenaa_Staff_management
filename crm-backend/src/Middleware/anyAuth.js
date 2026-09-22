// Accepts EITHER an employee token or an admin token.
// Sets req.actor = { type: "user" | "admin", id, name }
// (also req.payload / req.user for employees, req.admin for admins, so it can sit
//  next to the existing middleware without surprises)
const jwt = require("jsonwebtoken");
const User = require("../Models/User.Model");
const AdminAccount = require("../Models/Admin.Model");
const { USER_SECRET, ADMIN_SECRET } = require("../Utils/secrets");

async function anyAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Please log in." });
  // the browser had no saved login and sent the word "null" / "undefined" as the token
  if (token === "null" || token === "undefined") {
    return res.status(401).json({ success: false, message: "You are not logged in on this browser. Please log in again." });
  }

  try {
    let decoded = null;
    let type = null;
    try {
      decoded = jwt.verify(token, USER_SECRET);
      type = "user";
    } catch (_) {
      decoded = jwt.verify(token, ADMIN_SECRET);
      type = "admin";
    }

    const id = decoded.id || decoded.userId;
    if (!id) return res.status(401).json({ success: false, message: "Invalid token." });

    if (type === "user") {
      const user = await User.findById(id).select("name mobile role isActive branchId attendanceMode");
      if (!user) return res.status(401).json({ success: false, message: "Account not found. Please log in again." });
      if (user.isActive === false) return res.status(403).json({ success: false, message: "This account is deactivated." });
      req.actor = { type, id: String(user._id), name: user.name, doc: user };
      req.payload = { id: user._id, userId: user._id, name: user.name, mobile: user.mobile, role: user.role };
      req.user = { ...req.payload };
    } else {
      const admin = await AdminAccount.findById(id);
      if (!admin || admin.role !== "admin") return res.status(403).json({ success: false, message: "Admin access required." });
      req.actor = { type, id: String(admin._id), name: admin.name, doc: admin };
      req.admin = { id: admin._id, name: admin.name, role: admin.role };
    }
    return next();
  } catch (err) {
    // A bad or old token is the person's problem (401). Anything else - for example the
    // database not answering - is a server problem and must not be shown as "session expired".
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(err?.name)) {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }
    if (err?.name === "CastError") {
      return res.status(401).json({ success: false, message: "Invalid token. Please log in again." });
    }
    console.error("[auth] could not check the login:", err?.message || err);
    return res.status(503).json({ success: false, message: "Could not check your login right now: the server or database is not responding. Please try again in a moment." });
  }
}

// Role guards:  router.get("/x", anyAuth.userOnly, handler)  /  anyAuth.adminOnly
const onlyType = (type, message) => [
  anyAuth,
  (req, res, next) => (req.actor?.type === type ? next() : res.status(403).json({ success: false, message })),
];

module.exports = anyAuth;
module.exports.userOnly = onlyType("user", "This action is for staff accounts.");
module.exports.adminOnly = onlyType("admin", "Admin access required.");
