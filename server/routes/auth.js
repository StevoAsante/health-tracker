// ============================================================
// auth.js — Authentication Routes (Register & Login)
// ============================================================
// This file handles two things:
//   POST /api/auth/register — create a new user account
//   POST /api/auth/login    — log an existing user in
//   POST /api/auth/logout   — log the current user out
//   GET  /api/auth/me       — get the currently logged-in user's info
//
// Security principle used here: we NEVER store plain-text passwords.
// We use bcrypt to "hash" a password into an unreadable string.
// When someone logs in, we compare their input to the stored hash.
// ============================================================

const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db'); // Our PostgreSQL connection

// express.Router() creates a mini-app that handles a subset of routes.
// In index.js we attach it to '/api/auth', so every route here
// is automatically prefixed with /api/auth.
const router = express.Router();

// ── HELPER: Email format validator ─────────────────────────
// A simple function that checks if an email looks valid.
// It uses a "regular expression" (regex) — a pattern-matching rule.
// This checks for the basic pattern: something@something.something
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ── POST /api/auth/register ─────────────────────────────────
// Handles new user registration.
// The browser sends: { username, real_name, email, password, height_cm, weight_kg, age }
router.post('/register', async (req, res) => {
  // Destructure: pull individual values out of the request body object.
  // This is the same as writing:  const username = req.body.username; etc.
  const { username, real_name, email, password, height_cm, weight_kg, age } = req.body;

  // ── Step 1: Validate inputs ───────────────────────────────
  // Check that all required fields are present and not empty.
  if (!username || !real_name || !email || !password) {
    // HTTP status 400 = "Bad Request" — the user sent incomplete data.
    return res.status(400).json({ error: 'Username, name, email and password are all required.' });
  }

  // Check the email is in a valid format (e.g. alex@gmail.com)
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Enforce a minimum password length for basic security.
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // ── Step 2: Check username and email are unique ───────────
  try {
    // Query the database to see if the username or email already exists.
    // $1 and $2 are placeholders — pg replaces them with the actual values.
    // This prevents SQL injection attacks (a common security vulnerability).
    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.toLowerCase(), email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      // rows is an array of matching database records.
      // If it's not empty, a user with that username/email already exists.
      return res.status(409).json({ error: 'Username or email is already taken.' });
    }

    // ── Step 3: Hash the password ─────────────────────────────
    // bcrypt.hash() scrambles the password using a one-way algorithm.
    // The '12' is the "salt rounds" — higher = more secure but slower.
    // 12 is a good balance for a real app.
    // 'await' pauses here until hashing is done (it takes a moment).
    const hashedPassword = await bcrypt.hash(password, 12);

    // ── Step 4: Insert the new user into the database ─────────
    // We store the hashed password, NOT the original one.
    // RETURNING id means the query gives back the new user's ID immediately.
    const result = await db.query(
      `INSERT INTO users (username, real_name, email, password, height_cm, weight_kg, age)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, real_name, email`,
      [
        username.toLowerCase(),
        real_name,
        email.toLowerCase(),
        hashedPassword,
        height_cm || null,   // null if not provided — these fields are optional
        weight_kg || null,
        age || null
      ]
    );

    // result.rows[0] is the first (and only) row returned by the INSERT.
    const newUser = result.rows[0];

    // ── Step 5: Automatically log the user in ─────────────────
    // After registering, we set the session so the user is immediately logged in.
    // req.session is an object we can attach any data to.
    // It gets saved to the 'sessions' table in the database automatically.
    req.session.userId = newUser.id;
    req.session.username = newUser.username;

    // HTTP status 201 = "Created" — a new resource was successfully created.
    res.status(201).json({
      message: 'Registration successful! Welcome to Health Tracker.',
      user: {
        id: newUser.id,
        username: newUser.username,
        real_name: newUser.real_name,
        email: newUser.email
      }
    });

  } catch (error) {
    // If anything unexpected goes wrong, log it on the server and
    // send a generic error back to the browser (don't reveal technical details).
    console.error('Registration error:', error.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────
// Handles user login.
// The browser sends: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Validate that both fields were provided
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Look up the user by email in the database.
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // If no user found with that email
    if (result.rows.length === 0) {
      // We use the same message for "wrong email" and "wrong password"
      // to avoid telling attackers which part was wrong.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0]; // The matching user row from the database

    // Compare the entered password against the stored hash.
    // bcrypt.compare() hashes the input and checks if it matches.
    // It returns true or false.
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Password is correct — create a session for this user.
    req.session.userId = user.id;
    req.session.username = user.username;

    // HTTP 200 = "OK" — success
    res.status(200).json({
      message: 'Login successful!',
      user: {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ───────────────────────────────────
// Destroys the user's session, effectively logging them out.
router.post('/logout', (req, res) => {
  // req.session.destroy() removes the session from the database.
  // The callback runs when it's done.
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: 'Logout failed.' });
    }
    // Clear the session cookie from the browser too
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logged out successfully.' });
  });
});

// ── GET /api/auth/me ────────────────────────────────────────
// Returns the currently logged-in user's profile data.
// The dashboard calls this on load to know who is logged in.
router.get('/me', async (req, res) => {
  // Check if there's an active session
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  try {
    // Fetch the user's profile — note we DON'T select the password column.
    const result = await db.query(
      'SELECT id, username, real_name, email, height_cm, weight_kg, age, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({ user: result.rows[0] });

  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ error: 'Could not retrieve user data.' });
  }
});

// Export the router so index.js can use it
module.exports = router;