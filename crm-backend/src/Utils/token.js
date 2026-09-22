const jwt = require("jsonwebtoken");

// Set ADMIN_JWT_SECRET in .env for production. The old value stays as the
// default so tokens already issued keep working.
const key = process.env.ADMIN_JWT_SECRET || "system@2026";

function genAccessToken(payload = {}) {
  try {
    const accessToken = jwt.sign(payload, key);

    return {
      message: "Token Generated",
      isError: false,
      token: accessToken,
    };
  } catch (error) {
    console.error("Token generation error:", error);

    return {
      message: "Failed to generate token",
      isError: true,
      token: null,
    };
  }
}

function verifyAccessToken(accessToken) {
  try {
    return jwt.verify(accessToken, key);
  } catch (error) {
    console.error("Token verification error:", error);

    return null;
  }
}

module.exports = {
  genAccessToken,
  verifyAccessToken,
  ADMIN_SECRET: key,
};