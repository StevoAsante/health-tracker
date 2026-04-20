// ============================================================
// goals.js — Goal Management Routes
// ============================================================
// Handles creating, tracking, and completing health goals.
//
// ENDPOINTS:
//   POST /api/goals/create    → Create a new goal
//   GET  /api/goals/list      → List all goals for the user
//   PUT  /api/goals/:id       → Update progress on a goal
//   DELETE /api/goals/:id     → Remove a goal
// ============================================================

const express = require('express');
const db      = require('../db');
const router  = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next();
}

// ── POST /api/goals/create ───────────────────────────────
// Creates a new goal for the logged-in user.
// Example goal: { goal_type: 'weight', target_value: 70, target_date: '2026-06-01' }
router.post('/create', requireLogin, async (req, res) => {
  const { goal_type, description, target_value, target_date } = req.body;

  if (!goal_type || !target_value || !target_date) {
    return res.status(400).json({
      error: 'Goal type, target value and target date are all required.'
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO goals (user_id, goal_type, description, target_value, target_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.session.userId, goal_type, description || null, target_value, target_date]
    );

    return res.status(201).json({
      message: 'Goal created! You\'ve got this.',
      goal: result.rows[0]
    });

  } catch (error) {
    console.error('Goal create error:', error.message);
    return res.status(500).json({ error: 'Failed to create goal.' });
  }
});

// ── GET /api/goals/list ──────────────────────────────────
// Returns all goals for the current user, checking if any
// have passed their target date so we can flag them.
router.get('/list', requireLogin, async (req, res) => {
  try {
    // We also check if any goals have exceeded their target date
    // and mark them as overdue if they're not met yet.
    const result = await db.query(
      `SELECT *,
         CASE
           WHEN is_met = FALSE AND target_date < CURRENT_DATE THEN TRUE
           ELSE FALSE
         END AS is_overdue
       FROM goals
       WHERE user_id = $1
       ORDER BY is_met ASC, target_date ASC`,
      [req.session.userId]
    );

    return res.status(200).json({ goals: result.rows });

  } catch (error) {
    console.error('Goals list error:', error.message);
    return res.status(500).json({ error: 'Failed to load goals.' });
  }
});

// ── PUT /api/goals/:id ───────────────────────────────────
// Updates the current_value of a goal (tracking progress).
// :id is a URL parameter — e.g. PUT /api/goals/5 updates goal with id=5
router.put('/:id', requireLogin, async (req, res) => {
  const goalId       = parseInt(req.params.id);
  const { current_value } = req.body;

  if (isNaN(goalId) || current_value === undefined) {
    return res.status(400).json({ error: 'Valid goal ID and current value are required.' });
  }

  try {
    // Fetch the goal first to check ownership and get the target
    const goalResult = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, req.session.userId]
    );

    if (goalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    const goal = goalResult.rows[0];

    // Check if the goal has now been met
    // (current value has reached or passed the target value)
    const isNowMet = Number(current_value) >= Number(goal.target_value);

    // Update the goal's progress (and mark as met if applicable)
    const updateResult = await db.query(
      `UPDATE goals
       SET current_value = $1, is_met = $2
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [current_value, isNowMet, goalId, req.session.userId]
    );

    return res.status(200).json({
      message: isNowMet ? '🎉 Goal achieved! Great work!' : 'Progress updated!',
      goal: updateResult.rows[0],
      goal_met: isNowMet
    });

  } catch (error) {
    console.error('Goal update error:', error.message);
    return res.status(500).json({ error: 'Failed to update goal.' });
  }
});

// ── DELETE /api/goals/:id ────────────────────────────────
// Removes a goal. Only the owner can delete their own goals.
router.delete('/:id', requireLogin, async (req, res) => {
  const goalId = parseInt(req.params.id);

  try {
    const result = await db.query(
      'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id',
      [goalId, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    return res.status(200).json({ message: 'Goal removed.' });

  } catch (error) {
    console.error('Goal delete error:', error.message);
    return res.status(500).json({ error: 'Failed to delete goal.' });
  }
});

module.exports = router;
