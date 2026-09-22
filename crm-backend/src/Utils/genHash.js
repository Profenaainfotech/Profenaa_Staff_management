const bcrypt = require("bcrypt");

const genHashData = async (password) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    return {
      isError: false,
      data: hashedPassword
    };
  } catch (error) {
    return {
      isError: true,
      message: error.message
    };
  }
};

const comparePassword = async (plainPassword, hashedPassword) => {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    console.error("Password comparison error:", error);
    return false;
  }
};

module.exports = {
  genHashData,
  comparePassword
};