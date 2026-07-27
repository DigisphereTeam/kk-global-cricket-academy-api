require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});


pool.query("SET TIMEZONE = 'Asia/Kolkata'")
  .then(() => {
    console.log("Database timezone set to Asia/Kolkata");
  })
  .catch((error) => {
    console.error("Error setting database timezone:", error.message);
  });


module.exports = pool;