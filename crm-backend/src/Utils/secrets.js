// Single place that knows the two JWT secrets.
// They mirror the defaults already used in requireAuth.js / User.controller.js
// (users) and token.js (admins), so existing tokens keep working.
// Set JWT_SECRET and ADMIN_JWT_SECRET in .env for production.
const { ADMIN_SECRET } = require("./token");

module.exports = {
  USER_SECRET: process.env.JWT_SECRET || "mysecretkey",
  ADMIN_SECRET,
};
