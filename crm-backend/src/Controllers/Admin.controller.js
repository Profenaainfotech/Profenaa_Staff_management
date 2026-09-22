const AdminAccount = require("../Models/Admin.Model");
const { genHashData, comparePassword } = require("../Utils/genHash");
const { genAccessToken } = require("../Utils/token");
const loginGate = require("../Services/loginGate.service");

// ================= 1. CREATE ADMIN ACCOUNT =================
const createAdminAccount = async (req, res) => {
  try {
    const { name, password, role } = req.body;

    // Check required fields
    if (!name || !password) {
      return res.status(400).json({
        error: true,
        message: "Name and Password are required fields.",
      });
    }

    // Check if admin already exists using name
    const existingAdmin = await AdminAccount.findOne({ name });

    if (existingAdmin) {
      return res.status(400).json({
        error: true,
        message: "An admin account with this name already exists.",
      });
    }

    // Hash password
    const hashData = await genHashData(password);

    if (hashData.isError) {
      return res.status(500).json({
        error: true,
        message: "Failed to secure password hash.",
      });
    }

    // Create admin account
    const newAdmin = await AdminAccount.create({
      name: name.trim(),
      password: hashData.data,
      role: role || "admin",
    });

    return res.status(201).json({
      error: false,
      message: "Admin account created successfully!",
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error("Create Admin Error:", error);

    return res.status(500).json({
      error: true,
      message: "Internal Server Error during admin registration.",
      details: error.message,
    });
  }
};

// ================= 2. LOGIN ADMIN ACCOUNT =================
const LoginAdmin = async (req, res) => {
  try {
    const { name, password } = req.body;

    // Check required fields
    if (!name || !password) {
      return res.status(400).json({
        error: true,
        message: "Name and Password are required for admin login.",
      });
    }

    // Find admin using name
    const adminUser = await AdminAccount.findOne({
      name: name.trim(),
    });

    if (!adminUser) {
      return res.status(401).json({
        error: true,
        message: "Invalid admin name or account not found.",
      });
    }

    // Compare password
    const isPasswordValid = await comparePassword(
      password,
      adminUser.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        error: true,
        message: "Invalid password. Please try again.",
      });
    }

    // Generate JWT token
    const tokenResult = genAccessToken({
      id: adminUser._id,
      name: adminUser.name,
      role: adminUser.role,
    });

    if (tokenResult.isError) {
      return res.status(500).json({
        error: true,
        message: "Failed to generate security token.",
      });
    }

    // Successful login (recorded in the login activity log)
    await loginGate.record({
      role: "admin",
      user: adminUser,
      req,
      kind: "LOGIN",
      result: "ALLOWED",
    });

    return res.status(200).json({
      error: false,
      message: "Admin Login successful",
      token: tokenResult.token,
      admin: {
        id: adminUser._id,
        name: adminUser.name,
        role: adminUser.role,
      },
    });
  } catch (error) {
    console.error("Admin Login Processing Error:", error);

    return res.status(500).json({
      error: true,
      message: "Internal Server Error during admin login.",
      details: error.message,
    });
  }
};

// ================= EXPORT =================
module.exports = {
  createAdminAccount,
  LoginAdmin,
};