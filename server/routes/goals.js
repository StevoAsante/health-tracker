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

async function getWeeklyGoalValues(userId) {
  const result = await db.query(
    `SELECT
       COALESCE(SUM(calories_burned), 0)      AS total_calories_burned,
       COUNT(*)                              AS total_sessions,
       COALESCE(SUM(CASE WHEN LOWER(activity_type) IN ('run', 'running') THEN distance_km ELSE 0 END), 0) AS run_distance
     FROM exercise_entries
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '7 days'`,
    [userId]
  );

  return result.rows[0] || {
    total_calories_burned: 0,
    total_sessions: 0,
    run_distance: 0
  };
}

function getGoalTargetConfig(goalType) {
  switch (goalType) {
    case 'weight': return { min: 1, max: 200, requiresDate: true };
    case 'run_distance': return { min: 0.1, max: 100, requiresDate: true };
    case 'calories_burned': return { min: 100, max: 30000, requiresDate: true };
    case 'steps': return { min: 100, max: 20000, requiresDate: false };
    case 'workout_sessions': return { min: 1, max: 14, requiresDate: true };
    default: return { min: 0, max: 999999, requiresDate: false };
  }
}

// ── POST /api/goals/create ───────────────────────────────
// Creates a new goal for the logged-in user.
// Example goal: { goal_type: 'weight', target_value: 70, target_date: '2026-06-01' }
router.post('/create', requireLogin, async (req, res) => {
  const { goal_type, description, target_value, target_date } = req.body;
  const targetValue = Number(target_value);
  const config = getGoalTargetConfig(goal_type);

  if (!goal_type || !target_value || Number.isNaN(targetValue) || targetValue <= 0) {
    return res.status(400).json({ error: 'Goal type and a valid target value are required.' });
  }

  if (targetValue < config.min || targetValue > config.max) {
    return res.status(400).json({ error: `Target value for ${goal_type} must be between ${config.min} and ${config.max}.` });
  }

  if (config.requiresDate && !target_date) {
    return res.status(400).json({ error: 'Target date is required for this goal type.' });
  }

  try {
    const createQuery = `INSERT INTO goals (user_id, goal_type, description, target_value, target_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`;
    const values = [req.session.userId, goal_type, description || null, targetValue, config.requiresDate ? target_date : null];
    const result = await db.query(createQuery, values);

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

    const weeklyValues = await getWeeklyGoalValues(req.session.userId);
    const goals = result.rows.map(goal => {
      let currentValue = Number(goal.current_value) || 0;
      switch (goal.goal_type) {
        case 'calories_burned':
          currentValue = Number(weeklyValues.total_calories_burned);
          break;
        case 'workout_sessions':
          currentValue = Number(weeklyValues.total_sessions);
          break;
        case 'run_distance':
          currentValue = Number(weeklyValues.run_distance);
          break;
        case 'weight':
        case 'steps':
          currentValue = Number(goal.current_value) || 0;
          break;
        default:
          currentValue = Number(goal.current_value) || 0;
      }

      const isMet = Number(goal.target_value) > 0 && currentValue >= Number(goal.target_value);

      return {
        ...goal,
        current_value: currentValue,
        is_met: isMet,
        unit: {
          calories_burned: 'kcal',
          workout_sessions: 'sessions',
          run_distance: 'km',
          weight: 'kg',
          steps: 'steps'
        }[goal.goal_type] || ''
      };
    });

    return res.status(200).json({ goals });

  } catch (error) {
    console.error('Goals list error:', error.message);
    return res.status(500).json({ error: 'Failed to load goals.' });
  }
});

// ── PUT /api/goals/:id ───────────────────────────────────
// Updates a goal. Can update progress (current_value) or full goal details.
// :id is a URL parameter — e.g. PUT /api/goals/5 updates goal with id=5
router.put('/:id', requireLogin, async (req, res) => {
  const goalId = parseInt(req.params.id);
  const { current_value, goal_type, target_value, description, target_date } = req.body;

  if (isNaN(goalId)) {
    return res.status(400).json({ error: 'Valid goal ID is required.' });
  }

  try {
    // Fetch the goal first to check ownership
    const goalResult = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, req.session.userId]
    );

    if (goalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    const goal = goalResult.rows[0];

    // If only current_value is provided, it's a progress update
    if (current_value !== undefined && !goal_type && !target_value && !description && target_date === undefined) {
      // Check if the goal has now been met
      const isNowMet = Number(current_value) >= Number(goal.target_value);

      // Update the goal's progress
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
    }

    // Otherwise, it's a full goal update
    const targetValue = target_value !== undefined ? Number(target_value) : goal.target_value;
    const config = goal_type ? getGoalTargetConfig(goal_type) : getGoalTargetConfig(goal.goal_type);

    if (target_value !== undefined && (targetValue <= 0 || targetValue < config.min || targetValue > config.max)) {
      return res.status(400).json({ error: `Target value must be between ${config.min} and ${config.max}.` });
    }

    if ((goal_type || goal.goal_type) && config.requiresDate && !target_date && target_date !== null) {
      return res.status(400).json({ error: 'Target date is required for this goal type.' });
    }

    // Update the goal
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (goal_type !== undefined) {
      updateFields.push(`goal_type = $${paramCount++}`);
      updateValues.push(goal_type);
    }
    if (target_value !== undefined) {
      updateFields.push(`target_value = $${paramCount++}`);
      updateValues.push(targetValue);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramCount++}`);
      updateValues.push(description || null);
    }
    if (target_date !== undefined) {
      updateFields.push(`target_date = $${paramCount++}`);
      updateValues.push(config.requiresDate ? target_date : null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    updateValues.push(goalId, req.session.userId);

    const updateResult = await db.query(
      `UPDATE goals
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING *`,
      updateValues
    );

    return res.status(200).json({
      message: 'Goal updated successfully!',
      goal: updateResult.rows[0]
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
