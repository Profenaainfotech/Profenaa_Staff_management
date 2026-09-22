const AdminAccount = require("../Models/Admin.Model");
const { verifyAccessToken } = require("../Utils/token");

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization header
    if (!authHeader) {
      return res.status(401).json({
        error: true,
        message: "No authorization header provided.",
      });
    }

    // Check Bearer format
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: true,
        message: "Invalid authorization format.",
      });
    }

    // Get token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: true,
        message: "No token provided. Please login again.",
      });
    }

    // Verify token using the SAME secret used by genAccessToken()
    const decoded = verifyAccessToken(token);

    console.log("Decoded Admin JWT:", decoded);

    // verifyAccessToken() returns an Error object if verification fails
    if (!decoded || decoded instanceof Error) {
      return res.status(401).json({
        error: true,
        message: "Invalid or expired admin token. Please login again.",
      });
    }

    const adminId = decoded.id;

    if (!adminId) {
      return res.status(401).json({
        error: true,
        message: "Invalid admin token.",
      });
    }

    // Find admin
    const admin = await AdminAccount.findById(adminId);

    if (!admin) {
      return res.status(404).json({
        error: true,
        message: "Admin account not found.",
      });
    }

    // Check admin role
    if (admin.role !== "admin") {
      return res.status(403).json({
        error: true,
        message: "Admin access required.",
      });
    }

    // Attach admin information to request
    req.payload = {
      id: admin._id,
      name: admin.name,
      role: admin.role,
    };

    req.admin = {
      id: admin._id,
      name: admin.name,
      role: admin.role,
    };

    next();
  } catch (error) {
    console.error("Admin authentication error:", error);

    return res.status(401).json({
      error: true,
      message: "Unauthorized admin. Please login again.",
    });
  }
};

module.exports = adminAuth;