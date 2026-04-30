// ============================================================
// stats.js — Performance Dashboard Routes
// ============================================================
// Handles fetching comprehensive stats data for different
// time periods (day, week, month, year, all-time).
//
// ENDPOINTS:
//   GET /api/stats/summary/:period  → Get stats for a specific period
//   GET /api/stats/goals/:period    → Get goals for a specific period
//   GET /api/stats/chart/:type/:period → Get chart data
// ============================================================

const express = require('express');
const db      = require('../db');
const router  = express.Router();

// ── MIDDLEWARE: Require Login ────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next();
}

// ── HELPER: Get interval SQL based on period ─────────────
function getIntervalSQL(period) {
  switch(period) {
    case 'day':      return "NOW() - INTERVAL '1 day'";
    case 'week':     return "NOW() - INTERVAL '7 days'";
    case 'month':    return "NOW() - INTERVAL '30 days'";
    case 'year':     return "NOW() - INTERVAL '365 days'";
    case 'allTime':  return "NOW() - INTERVAL '100 years'";
    default:         return "NOW() - INTERVAL '7 days'";
  }
}

// ── GET /api/stats/summary/:period ──────────────────────
// Returns comprehensive stats summary for the given period
router.get('/summary/:period', requireLogin, async (req, res) => {
  const { period } = req.params;
  const interval = getIntervalSQL(period);

  try {
    const result = await db.query(
      `SELECT
         COUNT(*) AS workouts_count,
         COALESCE(SUM(duration_mins), 0) AS total_workout_minutes,
         COALESCE(SUM(calories_burned), 0) AS total_calories_burned,
         COALESCE(SUM(CASE WHEN sets > 0 AND reps > 0 AND weight_kg_used > 0
                            THEN sets * reps * weight_kg_used ELSE 0 END), 0) AS volume_kg,
         CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(duration_mins), 0)::numeric / COUNT(*), 2)
              ELSE 0 END AS average_workout_minutes
       FROM exercise_entries
       WHERE user_id = $1
         AND logged_at >= ${interval}`,
      [req.session.userId]
    );

    const row = result.rows[0] || {};
    const exerciseStats = {
      workoutsCount: parseInt(row.workouts_count, 10) || 0,
      totalWorkoutMinutes: parseInt(row.total_workout_minutes, 10) || 0,
      totalCaloriesBurned: parseInt(row.total_calories_burned, 10) || 0,
      volumeKg: parseFloat(row.volume_kg) || 0,
      averageWorkoutMinutes: parseFloat(row.average_workout_minutes) || 0
    };

    // Fetch diet stats
    const dietResult = await db.query(
      `SELECT
         COALESCE(SUM(calories), 0) AS total_calories_consumed
       FROM diet_entries
       WHERE user_id = $1
         AND logged_at >= ${interval}`,
      [req.session.userId]
    );

    const dietRow = dietResult.rows[0] || {};

    return res.status(200).json({
      period,
      stats: {
        ...exerciseStats,
        totalCaloriesConsumed: parseInt(dietRow.total_calories_consumed, 10) || 0
      }
    });

  } catch (error) {
    console.error('Stats summary error:', error.message);
    return res.status(500).json({ error: 'Failed to load stats summary.' });
  }
});

// ── GET /api/stats/goals/:period ────────────────────────
// Returns goals filtered by period
router.get('/goals/:period', requireLogin, async (req, res) => {
  const { period } = req.params;
  const periodMap = {
    workout_sessions: ['week', 'allTime'],
    calories_burned: ['week', 'allTime'],
    run_distance: ['week', 'allTime'],
    volume: ['week', 'allTime'],
    steps: ['day', 'allTime'],
    weight: ['month', 'year', 'allTime']
  };

  try {
    const result = await db.query(
      `SELECT *
       FROM goals
       WHERE user_id = $1
         AND is_met = FALSE
       ORDER BY target_date ASC`,
      [req.session.userId]
    );

    const goals = result.rows
      .filter(goal => {
        const allowedPeriods = periodMap[goal.goal_type] || ['allTime'];
        return period === 'allTime' || allowedPeriods.includes(period);
      })
      .map(goal => {
        const targetValue = Number(goal.target_value) || 0;
        const currentValue = Number(goal.current_value) || 0;
        const progressPercentage = targetValue > 0 ? Math.round((currentValue / targetValue) * 100) : 0;

        return {
          ...goal,
          progressPercentage: Math.min(progressPercentage, 100),
          status: progressPercentage >= 100 ? 'ACHIEVED' : 'IN_PROGRESS',
          unit: {
            calories_burned: 'kcal',
            workout_sessions: 'sessions',
            run_distance: 'km',
            weight: 'kg',
            steps: 'steps'
          }[goal.goal_type] || ''
        };
      });

    return res.status(200).json({ period, goals });

  } catch (error) {
    console.error('Stats goals error:', error.message);
    return res.status(500).json({ error: 'Failed to load goals.' });
  }
});

// ── GET /api/stats/chart/workouts/:period ───────────────
// Returns weekly workout counts for a chart over the period
router.get('/chart/workouts/:period', requireLogin, async (req, res) => {
  const { period } = req.params;
  let intervalSql = "NOW() - INTERVAL '8 weeks'";
  let truncation = "DATE_TRUNC('week', logged_at)";

  if (period === 'day') {
    intervalSql = "NOW() - INTERVAL '7 days'";
    truncation = "DATE_TRUNC('day', logged_at)";
  } else if (period === 'week') {
    intervalSql = "NOW() - INTERVAL '8 weeks'";
    truncation = "DATE_TRUNC('week', logged_at)";
  } else if (period === 'month') {
    intervalSql = "NOW() - INTERVAL '12 weeks'";
    truncation = "DATE_TRUNC('week', logged_at)";
  } else if (period === 'year') {
    intervalSql = "NOW() - INTERVAL '52 weeks'";
    truncation = "DATE_TRUNC('week', logged_at)";
  } else if (period === 'allTime') {
    intervalSql = "NOW() - INTERVAL '10 years'";
    truncation = "DATE_TRUNC('month', logged_at)";
  }

  try {
    const result = await db.query(
      `SELECT
         ${truncation}::date AS period_start,
         COUNT(*) AS workout_count
       FROM exercise_entries
       WHERE user_id = $1
         AND logged_at >= ${intervalSql}
       GROUP BY ${truncation}
       ORDER BY ${truncation} ASC`,
      [req.session.userId]
    );

    const data = result.rows.map(row => ({
      periodStart: row.period_start,
      workoutCount: parseInt(row.workout_count, 10)
    }));

    return res.status(200).json({ period, chartData: data });

  } catch (error) {
    console.error('Workouts chart error:', error.message);
    return res.status(500).json({ error: 'Failed to load chart data.' });
  }
});

// ── GET /api/stats/chart/calories/:period ───────────────
// Returns daily/weekly calories (burned vs consumed) for a chart
router.get('/chart/calories/:period', requireLogin, async (req, res) => {
  const { period } = req.params;
  const interval = getIntervalSQL(period);
  let groupBy = 'day';
  let truncation = "DATE_TRUNC('day', logged_at)";

  if (period === 'day') {
    groupBy = 'hour';
    truncation = "DATE_TRUNC('hour', logged_at)";
  } else if (period === 'week' || period === 'month') {
    groupBy = 'day';
    truncation = "DATE_TRUNC('day', logged_at)";
  } else if (period === 'year') {
    groupBy = 'week';
    truncation = "DATE_TRUNC('week', logged_at)";
  }

  try {
    const exerciseRows = await db.query(
      `SELECT ${truncation} AS period_start,
              COALESCE(SUM(calories_burned), 0) AS calories_burned,
              0 AS calories_consumed
       FROM exercise_entries
       WHERE user_id = $1
         AND logged_at >= ${interval}
       GROUP BY ${truncation}
       ORDER BY ${truncation} ASC`,
      [req.session.userId]
    );

    const dietRows = await db.query(
      `SELECT ${truncation} AS period_start,
              0 AS calories_burned,
              COALESCE(SUM(calories), 0) AS calories_consumed
       FROM diet_entries
       WHERE user_id = $1
         AND logged_at >= ${interval}
       GROUP BY ${truncation}
       ORDER BY ${truncation} ASC`,
      [req.session.userId]
    );

    const merged = new Map();
    [...exerciseRows.rows, ...dietRows.rows].forEach(row => {
      const key = row.period_start.toISOString();
      const existing = merged.get(key) || { periodStart: row.period_start, caloriesBurned: 0, caloriesConsumed: 0 };
      existing.caloriesBurned += parseInt(row.calories_burned, 10) || 0;
      existing.caloriesConsumed += parseInt(row.calories_consumed, 10) || 0;
      merged.set(key, existing);
    });

    const data = Array.from(merged.values()).sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));

    return res.status(200).json({ period, chartData: data });

  } catch (error) {
    console.error('Calories chart error:', error.message);
    return res.status(500).json({ error: 'Failed to load chart data.' });
  }
});

// ── GET /api/stats/strength-highlights/:period ─────────────
router.get('/strength-highlights/:period', requireLogin, async (req, res) => {
  const { period } = req.params;
  const interval = getIntervalSQL(period);

  try {
    const totalVolumeResult = await db.query(
      `SELECT COALESCE(SUM(sets * reps * weight_kg_used), 0) AS total_volume
       FROM exercise_entries
       WHERE user_id = $1
         AND exercise_category = 'strength'
         AND logged_at >= ${interval}`,
      [req.session.userId]
    );

    const bestWeightResult = await db.query(
      `SELECT activity_name, sets, reps, weight_kg_used, logged_at
       FROM exercise_entries
       WHERE user_id = $1
         AND exercise_category = 'strength'
         AND weight_kg_used IS NOT NULL
         AND logged_at >= ${interval}
       ORDER BY weight_kg_used DESC
       LIMIT 1`,
      [req.session.userId]
    );

    const bestVolumeResult = await db.query(
      `SELECT activity_name, sets, reps, weight_kg_used, logged_at,
              (sets * reps * weight_kg_used) AS volume_kg
       FROM exercise_entries
       WHERE user_id = $1
         AND exercise_category = 'strength'
         AND sets IS NOT NULL
         AND reps IS NOT NULL
         AND weight_kg_used IS NOT NULL
         AND logged_at >= ${interval}
       ORDER BY volume_kg DESC
       LIMIT 1`,
      [req.session.userId]
    );

    const totalVolume = parseFloat(totalVolumeResult.rows[0]?.total_volume) || 0;
    const bestWeightEntry = bestWeightResult.rows[0] || null;
    const bestVolumeEntry = bestVolumeResult.rows[0] || null;

    const highlights = [
      {
        title: 'Total strength volume',
        value: `${Math.round(totalVolume)} kg`,
        detail: 'Sum of weight × reps × sets'
      }
    ];

    if (bestWeightEntry) {
      highlights.push({
        title: 'Heaviest lift',
        value: `${bestWeightEntry.weight_kg_used} kg`,
        detail: `${bestWeightEntry.activity_name} — ${bestWeightEntry.sets}×${bestWeightEntry.reps}`
      });
    }

    if (bestVolumeEntry) {
      highlights.push({
        title: 'Best volume set',
        value: `${Math.round(bestVolumeEntry.volume_kg)} kg`,
        detail: `${bestVolumeEntry.activity_name} — ${bestVolumeEntry.sets}×${bestVolumeEntry.reps}`
      });
    }

    return res.status(200).json({ period, highlights });

  } catch (error) {
    console.error('Strength highlights error:', error.message);
    return res.status(500).json({ error: 'Failed to load strength highlights.' });
  }
});

module.exports = router;
