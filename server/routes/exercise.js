// exercise.js — handles everything to do with exercise logging
//
// Routes in here:
//   POST /api/exercise       — save a new session
//   GET  /api/exercise       — fetch all past sessions for the logged-in user
//   GET  /api/exercise/today — just today's sessions (for the dashboard card)
//   DELETE /api/exercise/:id — remove a session the user logged by mistake

const express = require('express');
const db      = require('../db');

const router = express.Router();

// Every route in this file requires the user to be logged in.
// Rather than repeating that check in each handler, we do it once
// with middleware — a function that runs before the real handler.
//
// If req.session.userId is missing, the user isn't logged in.
// We stop here and return 401 (Unauthorised) instead of continuing.
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next(); // all good — move on to the actual route handler
}

// Apply the middleware to every route in this file.
// The '*' means "match any path handled by this router".
router.use('*', requireLogin);


// ── POST /api/exercise ─────────────────────────────────────────────────────
// Saves one exercise session to the database.
// The body should contain: activity_type, activity_name, duration_mins,
// distance_km (optional), calories_burned (optional).

router.post('/', async (req, res) => {
  const { activity_type, activity_name, duration_mins, distance_km, calories_burned } = req.body;

  // Both type and name are required — reject if either is missing.
  if (!activity_type || !activity_name) {
    return res.status(400).json({ error: 'Activity type and name are required.' });
  }

  // duration_mins must be a positive number. parseFloat handles "45.5" etc.
  if (!duration_mins || parseFloat(duration_mins) <= 0) {
    return res.status(400).json({ error: 'Duration must be a positive number.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO exercise_entries
         (user_id, activity_type, activity_name, duration_mins, distance_km, calories_burned)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.session.userId,
        activity_type,
        activity_name,
        parseInt(duration_mins),
        distance_km  ? parseFloat(distance_km)  : null,
        calories_burned ? parseInt(calories_burned) : null
      ]
    );

    res.status(201).json({
      message: 'Exercise logged successfully.',
      exercise: result.rows[0]
    });

  } catch (error) {
    console.error('Exercise log error:', error.message);
    res.status(500).json({ error: 'Could not save exercise. Try again.' });
  }
});


// ── GET /api/exercise ──────────────────────────────────────────────────────
// Returns all exercise sessions for the current user, newest first.
// The dashboard history tab calls this.

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM exercise_entries
       WHERE user_id = $1
       ORDER BY logged_at DESC`,
      [req.session.userId]
    );

    res.status(200).json({ exercises: result.rows });

  } catch (error) {
    console.error('Fetch exercises error:', error.message);
    res.status(500).json({ error: 'Could not retrieve exercise history.' });
  }
});


// ── GET /api/exercise/today ────────────────────────────────────────────────
// Returns only today's exercise entries — used on the main dashboard card.
// We filter by date using PostgreSQL's DATE() cast so time is ignored.

router.get('/today', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM exercise_entries
       WHERE user_id = $1
         AND DATE(logged_at) = CURRENT_DATE
       ORDER BY logged_at DESC`,
      [req.session.userId]
    );

    // Also return a total for the day so the frontend doesn't have to add it up.
    const totalMinutes = result.rows.reduce((sum, e) => sum + (e.duration_mins || 0), 0);
    const totalCalories = result.rows.reduce((sum, e) => sum + (e.calories_burned || 0), 0);

    res.status(200).json({
      exercises: result.rows,
      totals: { minutes: totalMinutes, calories: totalCalories }
    });

  } catch (error) {
    console.error('Fetch today exercise error:', error.message);
    res.status(500).json({ error: 'Could not retrieve today\'s exercise.' });
  }
});


// ── DELETE /api/exercise/:id ───────────────────────────────────────────────
// Deletes a specific exercise entry.
// :id is a URL parameter — e.g. DELETE /api/exercise/42 deletes entry 42.
//
// We check the entry belongs to the logged-in user before deleting.
// Without that check, any logged-in user could delete anyone else's data.

router.delete('/:id', async (req, res) => {
  const entryId = parseInt(req.params.id);

  if (isNaN(entryId)) {
    return res.status(400).json({ error: 'Invalid entry ID.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM exercise_entries
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [entryId, req.session.userId]
    );

    if (result.rows.length === 0) {
      // Either the entry doesn't exist, or it belongs to someone else.
      // We return 404 either way — no need to reveal the difference.
      return res.status(404).json({ error: 'Entry not found.' });
    }

    res.status(200).json({ message: 'Exercise entry deleted.' });

  } catch (error) {
    console.error('Delete exercise error:', error.message);
    res.status(500).json({ error: 'Could not delete entry.' });
  }
});

module.exports = router;