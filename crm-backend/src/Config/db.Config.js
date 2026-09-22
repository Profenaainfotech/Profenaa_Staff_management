const mongoose = require("mongoose");

async function connectWithDB() {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI);

    console.log(`DB CONNECTED: ${connection.connection.host}`);
  } catch (error) {
    console.error("DB CONNECTION FAILED:", error.message);
    process.exit(1);
  }
}
// connectWithDB();
module.exports = connectWithDB;