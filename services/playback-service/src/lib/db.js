const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 10,
});

pool.on("error", (err) => console.error("unexpected pg pool error", err.message));

module.exports = { pool };
