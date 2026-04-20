// ============================================================
// index.js — Main Express Server (Entry Point)
// ============================================================
// This is the first file Node.js runs when you do 'npm run dev'.
// It sets up the web server, connects all the route files,
// and starts listening for browser requests on port 3000.
//
// Think of Express as the receptionist of a large building:
//   - The browser makes a request (visitor arrives)
//   - Express checks which route handles it (receptionist checks directory)
//   - The right route handler deals with it (visitor goes to the right office)
// ============================================================

// Load environment variables from .env FIRST, before anything else.
require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
const PgSession      = require('connect-pg-simple')(session);
const path           = require('path');
const db             = require('./db');

// Create the Express app — this is the object that manages everything.
const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────
// Middleware are functions that run on EVERY request, in order,
// before reaching your specific route handlers.
// Think of them as a series of checkpoints every visitor passes through.

// Parse JSON bodies — when the browser sends data as JSON, this
// makes it available on req.body so route handlers can read it.
app.use(express.json());

// Parse form data — handles classic HTML form submissions.
app.use(express.urlencoded({ extended: true }));

// Serve everything in the 'public' folder as static files.
// public/css/style.css becomes accessible at /css/style.css
// public/index.html becomes accessible at /index.html
// The browser can load these directly without going through a route handler.
app.use(express.static(path.join(__dirname, '../public')));

// ── SESSION SETUP ─────────────────────────────────────────
// Sessions are how the server "remembers" that you're logged in
// across multiple requests. HTTP is stateless by nature (each
// request is independent), so sessions solve this by:
//   1. Giving the browser a unique cookie (the session ID)
//   2. Storing the session data (e.g. your user ID) in the database
//   3. On each request, reading the cookie and loading your data
app.use(session({
  // Store sessions in PostgreSQL instead of in memory.
  // Memory storage would lose all sessions if the server restarts.
  store: new PgSession({
    pool:      db,          // Use our existing database connection
    tableName: 'sessions'   // The table we created in the SQL schema
  }),

  // The secret signs the session cookie so it can't be tampered with.
  // Loaded from .env so it's never hardcoded in shared code.
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret',

  resave:            false, // Don't re-save the session if nothing changed
  saveUninitialized: false, // Don't create a session until something is stored

  cookie: {
    maxAge:   1000 * 60 * 60 * 24, // Session lasts 24 hours (in milliseconds)
    httpOnly: true,                 // JavaScript in the browser can't read this cookie
    secure:   false                 // Set to true only when using HTTPS
  }
}));

// ── ROUTES ───────────────────────────────────────────────
// Each group of related endpoints lives in its own file.
// We import them here and mount them at a URL prefix.
// For example, everything in auth.js is available under /api/auth

const authRoutes     = require('./routes/auth');
const exerciseRoutes = require('./routes/exercise');
const dietRoutes     = require('./routes/diet');
const goalRoutes     = require('./routes/goals');
const groupRoutes    = require('./routes/groups');

app.use('/api/auth',     authRoutes);      // /api/auth/login, /api/auth/register, etc.
app.use('/api/exercise', exerciseRoutes);  // /api/exercise/log, /api/exercise/history, etc.
app.use('/api/diet',     dietRoutes);      // /api/diet/log, /api/diet/history, etc.
app.use('/api/goals',    goalRoutes);      // /api/goals/create, /api/goals/list, etc.
app.use('/api/groups',   groupRoutes);     // /api/groups/create, /api/groups/join, etc.

// ── PAGE ROUTES ──────────────────────────────────────────
// These routes serve the actual HTML pages.
// The static middleware above handles CSS/JS files automatically,
// but we need these explicit routes for pages that need auth checks.

// Root URL serves the login/register page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Dashboard is protected — if not logged in, redirect to login.
// req.session.userId is set when the user successfully logs in (in auth.js).
// If it's not there, the user isn't logged in.
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// ── 404 HANDLER ──────────────────────────────────────────
// If no route above matched the request, send a 404 error.
// This MUST be the last app.use() because Express checks routes in order.
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── START THE SERVER ─────────────────────────────────────
// Tell Express to start listening for requests.
// process.env.PORT lets deployment platforms set the port externally.
// Falls back to 3000 for local development.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Health Tracker running at http://localhost:${PORT}`);
});

// Export 'app' so our test files can import it and make requests
// without actually starting a server (supertest handles that internally).
module.exports = app;
