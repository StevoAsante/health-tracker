// ============================================================
// db.js — Database Connection Pool
// ============================================================
// This file creates a single shared connection to PostgreSQL
// and exports it so every other file can use it.
//
// WHY A POOL?
// Opening and closing a fresh database connection for every
// request would be slow. A "pool" keeps a handful of connections
// open and ready to use — like keeping a few checkout lanes
// open at a supermarket rather than opening a new one for
// each customer and closing it after.
//
// HOW OTHER FILES USE THIS:
//   const db = require('./db');
//   const result = await db.query('SELECT * FROM users');
// ============================================================

// dotenv loads the values from your .env file into process.env
// so we can read DB_HOST, DB_PASSWORD, etc.
require('dotenv').config();

// Pull the Pool class out of the 'pg' (PostgreSQL) library.
const { Pool } = require('pg');

// Create the pool using values from .env
// Each team member's .env has their own credentials,
// so nobody needs to hardcode passwords in shared code.
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'health_tracker',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection when the server starts.
// We borrow one connection, log whether it worked, then give it back.
pool.connect((error, client, release) => {
  if (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('   → Check your .env file and make sure pgAdmin is running.');
  } else {
    console.log('✅ Connected to PostgreSQL successfully!');
    release(); // Return the test connection to the pool
  }
});

// Export the pool so any other file can import it and run queries.
module.exports = pool;
