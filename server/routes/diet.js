// ============================================================
// diet.js — Diet / Meal Logging Routes
// ============================================================
// Handles logging food entries and retrieving dietary history.
//
// ENDPOINTS:
//   POST /api/diet/log          → Log a food/meal entry
//   GET  /api/diet/history      → Get full diet history
//   GET  /api/diet/today        → Get today's food entries + calorie total
//   GET  /api/diet/foods        → Search the food items list
//   POST /api/diet/foods/custom → Add a custom food item
// ============================================================

const express = require('express');
const db      = require('../db');
const router  = express.Router();

// Reusable auth check — same pattern as exercise.js
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next();
}

// ── POST /api/diet/log ───────────────────────────────────
// Logs a single food entry for the current user.
// The browser sends: { food_name, meal_type, calories, quantity, food_item_id (optional) }
router.post('/log', requireLogin, async (req, res) => {
  const {
    food_name,
    meal_type,
    calories,
    quantity,
    food_item_id // optional — links to the food_items lookup table
  } = req.body;

  // Validate required fields
  if (!food_name || !meal_type || calories === undefined) {
    return res.status(400).json({
      error: 'Food name, meal type and calories are required.'
    });
  }

  // Validate meal type is one of our defined set
  const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  if (!validMealTypes.includes(meal_type.toLowerCase())) {
    return res.status(400).json({
      error: `Meal type must be one of: ${validMealTypes.join(', ')}.`
    });
  }

  // Calories must be a non-negative number
  if (isNaN(calories) || Number(calories) < 0) {
    return res.status(400).json({ error: 'Calories must be a valid positive number.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO diet_entries (user_id, food_item_id, food_name, meal_type, calories, quantity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.session.userId,
        food_item_id || null,
        food_name,
        meal_type.toLowerCase(),
        Math.round(Number(calories)),       // Round to a whole number
        quantity ? Number(quantity) : 1     // Default portion size is 1 if not specified
      ]
    );

    return res.status(201).json({
      message: 'Meal logged successfully!',
      entry: result.rows[0]
    });

  } catch (error) {
    console.error('Diet log error:', error.message);
    return res.status(500).json({ error: 'Failed to save meal. Please try again.' });
  }
});

// ── GET /api/diet/today ──────────────────────────────────
// Returns all food entries logged today, plus the running calorie total.
// The Miro wireframe shows this with a "goal comparison" message —
// we return enough data for the frontend to calculate that.
router.get('/today', requireLogin, async (req, res) => {
  try {
    // Get today's individual entries
    const entriesResult = await db.query(
      `SELECT * FROM diet_entries
       WHERE user_id = $1
         AND DATE(logged_at) = CURRENT_DATE
       ORDER BY logged_at DESC`,
      [req.session.userId]
    );

    // Also get the total calories for today in one query
    const totalResult = await db.query(
      `SELECT COALESCE(SUM(calories), 0) AS total_calories_today
       FROM diet_entries
       WHERE user_id = $1
         AND DATE(logged_at) = CURRENT_DATE`,
      [req.session.userId]
    );

    return res.status(200).json({
      entries:              entriesResult.rows,
      total_calories_today: Number(totalResult.rows[0].total_calories_today)
    });

  } catch (error) {
    console.error('Today diet error:', error.message);
    return res.status(500).json({ error: 'Failed to load today\'s meals.' });
  }
});

// ── GET /api/diet/history ────────────────────────────────
// Returns diet entries for the user, most recent first.
// Optional limit parameter (default 50).
router.get('/history', requireLogin, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const result = await db.query(
      `SELECT * FROM diet_entries
       WHERE user_id = $1
       ORDER BY logged_at DESC
       LIMIT $2`,
      [req.session.userId, limit]
    );

    return res.status(200).json({ entries: result.rows });

  } catch (error) {
    console.error('Diet history error:', error.message);
    return res.status(500).json({ error: 'Failed to load diet history.' });
  }
});

// ── GET /api/diet/foods ──────────────────────────────────
// Searches the food items list (both default and user-created).
// Used to populate the food search dropdown on the log meal form.
// Example: /api/diet/foods?search=banana
router.get('/foods', requireLogin, async (req, res) => {
  const search = req.query.search || '';

  try {
    // ILIKE is PostgreSQL's case-insensitive version of LIKE.
    // %${search}% means "contains this text anywhere".
    const result = await db.query(
      `SELECT * FROM food_items
       WHERE (name ILIKE $1 OR is_custom = false)
         AND (created_by IS NULL OR created_by = $2)
       ORDER BY is_custom ASC, name ASC
       LIMIT 20`,
      [`%${search}%`, req.session.userId]
    );

    return res.status(200).json({ foods: result.rows });

  } catch (error) {
    console.error('Food search error:', error.message);
    return res.status(500).json({ error: 'Failed to search foods.' });
  }
});

// ── POST /api/diet/foods/custom ──────────────────────────
// Lets a user add a custom food item to their personal list.
// This matches the Miro spec requirement: "ability to add custom items".
router.post('/foods/custom', requireLogin, async (req, res) => {
  const { name, calories } = req.body;

  if (!name || calories === undefined) {
    return res.status(400).json({ error: 'Food name and calories are required.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO food_items (name, calories, created_by, is_custom)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [name, Math.round(Number(calories)), req.session.userId]
    );

    return res.status(201).json({
      message: `"${name}" added to your food list!`,
      food: result.rows[0]
    });

  } catch (error) {
    console.error('Custom food error:', error.message);
    return res.status(500).json({ error: 'Failed to add custom food.' });
  }
});

// ── GET /api/diet/weekly-summary ─────────────────────────
// Returns total calories consumed in the past 7 days.
router.get('/weekly-summary', requireLogin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(calories), 0) AS total_calories_week
       FROM diet_entries
       WHERE user_id = $1
         AND logged_at >= NOW() - INTERVAL '7 days'`,
      [req.session.userId]
    );

    return res.status(200).json({ summary: result.rows[0] });

  } catch (error) {
    console.error('Diet weekly summary error:', error.message);
    return res.status(500).json({ error: 'Failed to load weekly diet summary.' });
  }
});

// ── PUT /api/diet/:id ────────────────────────────────────
// Updates an existing diet entry for the logged-in user.
router.put('/:id', requireLogin, async (req, res) => {
  const entryId = req.params.id;
  const { food_name, meal_type, calories, quantity } = req.body;

  if (!food_name || !meal_type || !calories) {
    return res.status(400).json({
      error: 'Food name, meal type, and calories are required.'
    });
  }

  try {
    // First, check that this entry belongs to the current user
    const checkResult = await db.query(
      'SELECT user_id FROM diet_entries WHERE id = $1',
      [entryId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    if (checkResult.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only edit your own entries.' });
    }

    const result = await db.query(
      `UPDATE diet_entries
       SET food_name = $1,
           meal_type = $2,
           calories = $3,
           quantity = $4
       WHERE id = $5
       RETURNING *`,
      [food_name, meal_type, Math.round(Number(calories)), quantity || 1, entryId]
    );

    return res.status(200).json({
      message: 'Meal entry updated successfully!',
      entry: result.rows[0]
    });

  } catch (error) {
    console.error('Diet update error:', error.message);
    return res.status(500).json({ error: 'Failed to update meal entry.' });
  }
});

// ── DELETE /api/diet/:id ─────────────────────────────────
// Deletes a diet entry for the logged-in user.
router.delete('/:id', requireLogin, async (req, res) => {
  const entryId = req.params.id;

  try {
    // First, check that this entry belongs to the current user
    const checkResult = await db.query(
      'SELECT user_id FROM diet_entries WHERE id = $1',
      [entryId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    if (checkResult.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only delete your own entries.' });
    }

    await db.query('DELETE FROM diet_entries WHERE id = $1', [entryId]);

    return res.status(200).json({ message: 'Meal entry deleted successfully!' });

  } catch (error) {
    console.error('Diet delete error:', error.message);
    return res.status(500).json({ error: 'Failed to delete meal entry.' });
  }
});

module.exports = router;
