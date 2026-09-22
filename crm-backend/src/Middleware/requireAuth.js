const jwt = require("jsonwebtoken");
const Account = require("../Models/User.Model");

// =====================================================
// JWT SECRET
// =====================================================
// IMPORTANT:
// This MUST be the same secret used while creating JWT
// in User.Controller.js
// =====================================================

const JWT_SECRET =
  process.env.JWT_SECRET || "mysecretkey";

async function requireAuth(req, res, next) {
  try {
    // =================================================
    // GET AUTHORIZATION HEADER
    // =================================================

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: true,
        message: "No authorization header provided.",
      });
    }

    // =================================================
    // CHECK BEARER TOKEN
    // =================================================

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: true,
        message: "Invalid authorization format.",
      });
    }

    // =================================================
    // EXTRACT TOKEN
    // =================================================

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: true,
        message: "No token provided. Please login again.",
      });
    }

    // =================================================
    // VERIFY JWT
    // =================================================

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    console.log("Decoded JWT:", decoded);

    // =================================================
    // GET USER ID FROM JWT
    // =================================================

    const userId =
      decoded.id ||
      decoded.userId;

    if (!userId) {
      return res.status(401).json({
        error: true,
        message: "Invalid token. User ID not found.",
      });
    }

    // =================================================
    // FIND USER
    // =================================================

    const user = await Account.findById(
      userId
    );

    if (!user) {
      return res.status(404).json({
        error: true,
        message:
          "No user found. Please login again.",
      });
    }

    // =================================================
    // SET REQUEST PAYLOAD
    // =================================================

    // Deactivated staff can no longer use an old token
    if (user.isActive === false) {
      return res.status(403).json({
        error: true,
        message: "This account is deactivated. Contact your administrator.",
      });
    }

    req.payload = {
      id: user._id,
      userId: user._id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
    };

    // =================================================
    // ALSO SET req.user
    // =================================================
    // Your other controllers use req.user
    // =================================================

    req.user = {
      id: user._id,
      userId: user._id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
    };

    next();

  } catch (err) {
    console.error(
      "Authentication error:",
      err.message
    );

    return res.status(401).json({
      error: true,
      message:
        "Unauthorized. Please login again.",
    });
  }
}

module.exports = requireAuth;