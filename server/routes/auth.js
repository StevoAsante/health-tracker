// ============================================================
// auth.js — Authentication Routes
// ============================================================
// Handles user registration, login, logout, and fetching the
// current logged-in user's profile.
//
// ENDPOINTS:
//   POST /api/auth/register  → Create a new account
//   POST /api/auth/login     → Log in to an existing account
//   POST /api/auth/logout    → End the current session
//   GET  /api/auth/me        → Get logged-in user's profile data
//
// SECURITY NOTE:
//   Passwords are NEVER stored as plain text. We use bcrypt to
//   hash them into an irreversible scrambled string. When someone
//   logs in, bcrypt compares their input against the stored hash.
// ============================================================

const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');

// Router creates a mini Express app for just these routes.
// In index.js we mount this at '/api/auth', so every route
// defined here is automatically prefixed with /api/auth.
const router = express.Router();

// ── HELPER: Email Format Validator ──────────────────────
// Checks whether a string looks like a valid email address.
// Uses a regular expression — a pattern that describes what
// a valid email should look like: something@something.something
function isValidEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

// ── POST /api/auth/register ──────────────────────────────
// Creates a new user account.
// The browser sends a JSON body with all registration fields.
router.post('/register', async (req, res) => {
  // Pull values out of the request body.
  // 'async' and 'await' let us write asynchronous code (like DB queries)
  // that reads like normal top-to-bottom code. Without them, we'd need
  // nested callback functions, which get hard to follow quickly.
  const {
    username,
    real_name,
    email,
    password,
    height_cm,
    weight_kg,
    age
  } = req.body;

  // ── Step 1: Validate required fields ─────────────────
  if (!username || !real_name || !email || !password) {
    // HTTP 400 = Bad Request — the client sent incomplete data
    return res.status(400).json({ error: 'Username, name, email and password are all required.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  // ── Step 2: Check uniqueness ──────────────────────────
  // We wrap everything in try/catch so database errors don't crash the server.
  // try = "attempt this code", catch = "if anything goes wrong, do this instead"
  try {
    // $1 and $2 are placeholders — pg replaces them with the actual values.
    // This is called a "parameterised query" and it prevents SQL injection,
    // which is a common attack where malicious input breaks your SQL code.
    const existing = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.toLowerCase(), email.toLowerCase()]
    );

    // rows is an array of matching database records.
    // If it has any entries, the username or email is already taken.
    if (existing.rows.length > 0) {
      // HTTP 409 = Conflict — the resource already exists
      return res.status(409).json({ error: 'Username or email is already taken.' });
    }

    // ── Step 3: Hash the password ─────────────────────
    // bcrypt.hash() takes a plain password and runs it through a
    // one-way mathematical function 2^12 (4096) times.
    // The result is a long scrambled string we store in the database.
    // Even if someone stole the database, they couldn't reverse the hash.
    // 'await' pauses here until hashing finishes (it takes ~200ms intentionally).
    const hashedPassword = await bcrypt.hash(password, 12);

    // ── Step 4: Insert the new user ───────────────────
    // RETURNING means PostgreSQL immediately gives us back the new row's data.
    // We use || null so optional fields default to null if not provided.
    const result = await db.query(
      `INSERT INTO users (username, real_name, email, password, height_cm, weight_kg, age)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, real_name, email`,
      [
        username.toLowerCase(),
        real_name,
        email.toLowerCase(),
        hashedPassword,
        height_cm || null,
        weight_kg || null,
        age || null
      ]
    );

    const newUser = result.rows[0]; // The newly created user row

    // ── Step 5: Log the user in automatically ─────────
    // We attach data to req.session — this object is automatically saved
    // to the 'sessions' table in the database. The browser gets a cookie
    // with the session ID, and on future requests the server reads it
    // to know who is making the request.
    req.session.userId   = newUser.id;
    req.session.username = newUser.username;

    // HTTP 201 = Created — a new resource was successfully made
    return res.status(201).json({
      message: 'Account created successfully! Welcome to Health Tracker.',
      user: {
        id:        newUser.id,
        username:  newUser.username,
        real_name: newUser.real_name,
        email:     newUser.email
      }
    });

  } catch (error) {
    // Log the full technical error server-side for debugging.
    // Send only a generic message to the browser — never expose internal errors.
    console.error('Registration error:', error.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────
// Verifies credentials and starts a session for the user.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Look up the user by email address
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // If no user found — we use the same error message as wrong password.
    // This prevents attackers from knowing which part was wrong.
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' }); // 401 = Unauthorized
    }

    const user = result.rows[0];

    // bcrypt.compare() hashes the typed password and checks if it matches
    // the stored hash. Returns true or false.
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Credentials are correct — create the session
    req.session.userId   = user.id;
    req.session.username = user.username;

    return res.status(200).json({
      message: 'Login successful!',
      user: {
        id:        user.id,
        username:  user.username,
        real_name: user.real_name,
        email:     user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────
// Destroys the current session, effectively logging the user out.
router.post('/logout', (req, res) => {
  // session.destroy() removes the session from the database.
  // The callback runs once it's done.
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: 'Logout failed. Please try again.' });
    }
    // Also clear the cookie from the browser
    res.clearCookie('connect.sid');
    return res.status(200).json({ message: 'Logged out successfully.' });
  });
});

// ── GET /api/auth/me ─────────────────────────────────────
// Returns the logged-in user's profile.
// The dashboard calls this on load to display the user's name, stats, etc.
router.get('/me', async (req, res) => {
  // Check if there's an active session with a userId
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  try {
    // Fetch user data — note we DO NOT select the password column
    const result = await db.query(
      `SELECT id, username, real_name, email, height_cm, weight_kg, age, created_at
       FROM users WHERE id = $1`,
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({ user: result.rows[0] });

  } catch (error) {
    console.error('Get profile error:', error.message);
    return res.status(500).json({ error: 'Could not load profile.' });
  }
});

// Export the router so index.js can mount it
module.exports = router;
