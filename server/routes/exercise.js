// ============================================================
// exercise.js — Exercise Logging Routes
// ============================================================
// Handles recording exercise sessions and retrieving history.
//
// ENDPOINTS:
//   POST /api/exercise/log      → Log a new exercise session
//   GET  /api/exercise/history  → Get the user's exercise history
//   GET  /api/exercise/today    → Get today's exercises only
//
// IMPORTANT DESIGN NOTE — Cardio vs Strength:
//   Cardio exercises (running, cycling) need duration/distance.
//   Strength exercises (bench press, squats) need sets/reps/weight.
//   We store ALL fields in one table, but only the relevant ones
//   will be filled — the rest stay as NULL.
//   The 'exercise_category' column tells us which type it is.
// ============================================================

const express = require('express');
const db      = require('../db');
const router  = express.Router();

// ── MIDDLEWARE: Require Login ────────────────────────────
// This function checks that the user is logged in before
// allowing access to any exercise route.
// We use it as middleware on each route that needs protection.
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    // 401 = Unauthorized — not logged in
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  // next() tells Express to continue to the actual route handler
  next();
}

// ── POST /api/exercise/log ───────────────────────────────
// Logs a new exercise session for the currently logged-in user.
//
// For CARDIO:  send { activity_type, activity_name, exercise_category: 'cardio', duration_mins, distance_km, calories_burned }
// For STRENGTH: send { activity_type, activity_name, exercise_category: 'strength', sets, reps, weight_kg_used, calories_burned }
router.post('/log', requireLogin, async (req, res) => {
  const {
    activity_type,
    activity_name,
    exercise_category, // 'cardio' or 'strength'
    duration_mins,
    distance_km,
    sets,
    reps,
    weight_kg_used,    // weight used for the exercise (e.g. 80kg bench press)
    calories_burned
  } = req.body;

  // Validate required fields — every exercise needs at minimum a type and name
  if (!activity_type || !activity_name || !exercise_category) {
    return res.status(400).json({
      error: 'Activity type, name and category (cardio/strength) are required.'
    });
  }

  // Make sure exercise_category is one of the two valid options
  if (!['cardio', 'strength'].includes(exercise_category)) {
    return res.status(400).json({
      error: "Exercise category must be 'cardio' or 'strength'."
    });
  }

  try {
    // Insert the exercise entry into the database.
    // Fields that don't apply (e.g. weight_kg_used for a cardio run) will be null.
    // This is fine — PostgreSQL stores null for optional columns.
    const result = await db.query(
      `INSERT INTO exercise_entries
         (user_id, activity_type, activity_name, exercise_category,
          duration_mins, distance_km, sets, reps, weight_kg_used, calories_burned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.session.userId,
        activity_type,
        activity_name,
        exercise_category,
        duration_mins  || null,
        distance_km    || null,
        sets           || null,
        reps           || null,
        weight_kg_used || null,
        calories_burned|| null
      ]
    );

    const newEntry = result.rows[0];

    return res.status(201).json({
      message: 'Exercise logged successfully!',
      entry: newEntry
    });

  } catch (error) {
    console.error('Exercise log error:', error.message);
    return res.status(500).json({ error: 'Failed to save exercise. Please try again.' });
  }
});

// ── GET /api/exercise/history ────────────────────────────
// Returns all exercise entries for the logged-in user,
// most recent first, with a default limit of 50.
router.get('/history', requireLogin, async (req, res) => {
  // Allow the client to request a different number of records
  // via a URL parameter, e.g. /api/exercise/history?limit=10
  const limit = parseInt(req.query.limit) || 50;

  try {
    const result = await db.query(
      `SELECT * FROM exercise_entries
       WHERE user_id = $1
       ORDER BY logged_at DESC
       LIMIT $2`,
      [req.session.userId, limit]
    );

    return res.status(200).json({ entries: result.rows });

  } catch (error) {
    console.error('Exercise history error:', error.message);
    return res.status(500).json({ error: 'Failed to load exercise history.' });
  }
});

// ── GET /api/exercise/today ──────────────────────────────
// Returns only today's exercise entries for the logged-in user.
// Used by the dashboard to show what the user has done today.
router.get('/today', requireLogin, async (req, res) => {
  try {
    // DATE(logged_at) compares only the date part (ignoring time).
    // CURRENT_DATE is a PostgreSQL function that returns today's date.
    const result = await db.query(
      `SELECT * FROM exercise_entries
       WHERE user_id = $1
         AND DATE(logged_at) = CURRENT_DATE
       ORDER BY logged_at DESC`,
      [req.session.userId]
    );

    return res.status(200).json({ entries: result.rows });

  } catch (error) {
    console.error('Today exercise error:', error.message);
    return res.status(500).json({ error: 'Failed to load today\'s exercises.' });
  }
});

// ── GET /api/exercise/weekly-summary ────────────────────
// Returns total calories burned and exercise count for the past 7 days.
// Used by the statistics/summary section of the dashboard.
router.get('/weekly-summary', requireLogin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) AS total_sessions,
         COALESCE(SUM(calories_burned), 0) AS total_calories_burned,
         COALESCE(SUM(duration_mins), 0)   AS total_minutes
       FROM exercise_entries
       WHERE user_id = $1
         AND logged_at >= NOW() - INTERVAL '7 days'`,
      [req.session.userId]
    );

    return res.status(200).json({ summary: result.rows[0] });

  } catch (error) {
    console.error('Weekly summary error:', error.message);
    return res.status(500).json({ error: 'Failed to load weekly summary.' });
  }
});

module.exports = router;
