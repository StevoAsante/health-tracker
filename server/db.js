// ============================================================
// db.js — Database Connection
// ============================================================
// This file creates ONE connection to your PostgreSQL database
// and makes it available to every other file that needs it.
//
// Think of this like plugging in a phone charger once —
// every room (file) in the house can now use that power source
// by importing this file.
// ============================================================

// 'pg' is the PostgreSQL library for Node.js.
// We pull out just the 'Pool' class from it.
// A Pool manages multiple database connections efficiently —
// instead of opening and closing a new connection for every
// request, it keeps a small group (pool) of connections ready.
const { Pool } = require('pg');

// Create a new connection pool.
// These settings tell pg HOW to connect to your PostgreSQL database.
// ⚠️ Replace the values below with your actual UEA pgAdmin credentials.
const pool = new Pool({
  host: 'localhost',        // Where the database is running (your own machine)
  port: 5432,               // The default PostgreSQL port number
  database: 'health_tracker', // The name of the database you created in pgAdmin
  user: 'postgres',         // Your pgAdmin username (usually 'postgres' by default)
  password: 'your_password_here', // Your pgAdmin password — change this!
  max: 10,                  // Maximum number of simultaneous connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Fail if a connection takes longer than 2 seconds
});

// Test that the connection works when the server starts.
// pool.connect() tries to grab a connection from the pool.
// If it works, we release it immediately (we were just checking).
// If it fails, we log the error so you know what went wrong.
pool.connect((error, client, release) => {
  if (error) {
    // This will print in your terminal if the DB connection fails.
    // Common causes: wrong password, database doesn't exist, pgAdmin not running.
    console.error('❌ Failed to connect to the database:', error.message);
  } else {
    // This will print when your server starts and the DB is reachable.
    console.log('✅ Connected to PostgreSQL database successfully!');
    release(); // Return the test connection back to the pool
  }
});

// Export the pool so other files can use it.
// Any file that does:  const db = require('./db');
// ...can then call:    db.query('SELECT * FROM users')
module.exports = pool;