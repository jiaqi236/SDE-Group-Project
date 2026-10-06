'use strict';
const { Pool } = require('pg');

const COLUMNS = 'id, title, done, created_at';

// Builds a connection pool from environment variables (see README)
function createPool(env) {
  const pool = new Pool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'campustask',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    // Amazon RDS PostgreSQL 15+ requires TLS
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 5000,
  });
  // Without this handler, a dropped idle connection (RDS restart / failover) would crash the process.
  // The app stays up instead and /health reports 503 until the database is back.
  pool.on('error', (err) => console.error('Database connection error:', err.message));
  return pool;
}

// `pool` is any object with a pg-compatible query() method (real Pool, or pg-mem in tests)
function createPgRepo(pool) {
  return {
    // Creates the schema if it does not exist yet (idempotent "migration")
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id         SERIAL PRIMARY KEY,
          title      VARCHAR(100) NOT NULL,
          done       BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    },
    // Succeeds only if the database is reachable AND the schema exists
    async ping() {
      await pool.query('SELECT 1 FROM tasks LIMIT 1');
    },
    async list() {
      const r = await pool.query(`SELECT ${COLUMNS} FROM tasks ORDER BY id`);
      return r.rows;
    },
    async create(title) {
      const r = await pool.query(`INSERT INTO tasks (title) VALUES ($1) RETURNING ${COLUMNS}`, [title]);
      return r.rows[0];
    },
    async setDone(id, done) {
      const r = await pool.query(`UPDATE tasks SET done = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, done]);
      return r.rows[0] || null;
    },
    async remove(id) {
      const r = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return r.rowCount > 0;
    },
    async clearCompleted() {
      const r = await pool.query('DELETE FROM tasks WHERE done = TRUE');
      return r.rowCount;
    },
    async close() {
      if (pool.end) await pool.end();
    },
  };
}

module.exports = { createPool, createPgRepo };
