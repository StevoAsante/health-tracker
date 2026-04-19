// ============================================================
// index.js — The Express Server (Entry Point)
// ============================================================
// This is the heart of your backend. When you run:
//   npm run dev
// Node.js starts here and keeps the server running.
//
// Express is a framework that makes it easy to:
//   1. Listen for requests from the browser
//   2. Route them to the right handler (e.g. /login goes to auth.js)
//   3. Send responses back
// ============================================================

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const db = require('./db'); // Our database connection from db.js

// Create the Express application.
// Think of 'app' as the manager of your web server.
const app = express();

// ── MIDDLEWARE ─────────────────────────────────────────────
// Middleware runs on EVERY request before it reaches your routes.
// It's like a security checkpoint at the entrance of a building.

// Parse incoming JSON data from the browser (e.g. from form submissions).
// Without this, req.body would be undefined in your route handlers.
app.use(express.json());

// Parse URL-encoded form data (e.g. from HTML <form> elements).
app.use(express.urlencoded({ extended: true }));

// Serve all files in the 'public' folder as static files.
// This means the browser can access public/css/style.css at /css/style.css
// and public/index.html at /index.html — automatically.
app.use(express.static(path.join(__dirname, '../public')));

// ── SESSION SETUP ──────────────────────────────────────────
// Sessions let the server remember who is logged in.
// Each browser gets a unique session ID (stored as a cookie).
// The session DATA (like the user's ID) is stored in the database.
app.use(session({
  // Use PostgreSQL to store session data instead of memory.
  // This means sessions survive server restarts.
  store: new PgSession({
    pool: db,             // Use our existing database connection pool
    tableName: 'sessions' // The table we created in the schema
  }),

  // A secret key used to sign the session cookie.
  // ⚠️ Change this to a long random string in a real app!
  secret: 'health-tracker-secret-key-2026',

  resave: false,          // Don't save the session if it wasn't changed
  saveUninitialized: false, // Don't create a session until something is stored

  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // Cookie lasts 24 hours (in milliseconds)
    httpOnly: true,               // JavaScript in the browser cannot read this cookie
    secure: false                 // Set to true only if using HTTPS
  }
}));

// ── ROUTES ─────────────────────────────────────────────────
// Routes define what happens when the browser requests a specific URL.
// We keep each group of routes in its own file to stay organised.

// Import our route files
const authRoutes     = require('./routes/auth');
const exerciseRoutes = require('./routes/exercise');
const dietRoutes     = require('./routes/diet');
const goalRoutes     = require('./routes/goals');
const groupRoutes    = require('./routes/groups');

// Register routes with a URL prefix.
// e.g. authRoutes handles: /api/auth/register, /api/auth/login, etc.
// The '/api' prefix makes it clear these are data endpoints, not pages.
app.use('/api/auth',     authRoutes);
app.use('/api/exercise', exerciseRoutes);
app.use('/api/diet',     dietRoutes);
app.use('/api/goals',    goalRoutes);
app.use('/api/groups',   groupRoutes);

// ── PAGE ROUTES ────────────────────────────────────────────
// These serve the actual HTML pages of the app.

// The home/login page — served at the root URL (/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// The main dashboard — only accessible if logged in.
// This is "middleware" specific to one route: if not logged in, go back to login.
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    // req.session.userId is set when the user logs in (in auth.js).
    // If it's not there, the user isn't logged in — redirect them.
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// ── 404 HANDLER ────────────────────────────────────────────
// If no route above matched, send a friendly 404 error.
// This must be the LAST app.use() — Express checks routes in order.
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── START THE SERVER ───────────────────────────────────────
// Tell Express to start listening for requests on port 3000.
// process.env.PORT lets you change the port via an environment variable
// (useful when deploying). It falls back to 3000 locally.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Health Tracker server running at http://localhost:${PORT}`);
});

// Export 'app' so our test files can import it and make test requests.
module.exports = app;