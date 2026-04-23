const express = require('express');
const db = require('../db');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next();
}

// ── POST /api/workouts/start ─────────────────────────────
// Start a routine and save each exercise as a logged strength entry.
router.post('/start', requireLogin, async (req, res) => {
  const { routine_id, exercises } = req.body;
  const userId = req.session.userId;

  if (!routine_id) {
    return res.status(400).json({ error: 'Routine ID is required.' });
  }

  try {
    const accessQuery = `
      SELECT id
      FROM workout_routines
      WHERE id = $1 AND (user_id = $2 OR is_public = true)
    `;
    const accessResult = await db.query(accessQuery, [routine_id, userId]);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found or access denied.' });
    }

    const routineExercisesQuery = `
      SELECT
        re.id,
        re.exercise_id,
        re.custom_exercise,
        re.sets,
        re.reps,
        re.rest_seconds,
        re.notes,
        el.name as exercise_name,
        el.muscle_group
      FROM routine_exercises re
      LEFT JOIN exercise_library el ON re.exercise_id = el.id
      WHERE re.routine_id = $1
      ORDER BY re.order_position
    `;
    const routineExercisesResult = await db.query(routineExercisesQuery, [routine_id]);
    const routineExercises = routineExercisesResult.rows;

    if (routineExercises.length === 0) {
      return res.status(400).json({ error: 'This routine contains no exercises.' });
    }

    const entries = (exercises || []).map((exercise, index) => {
      const source = routineExercises[index] || {};
      const activityName = source.exercise_name || source.custom_exercise || 'Routine Exercise';
      const activityType = source.muscle_group || 'Strength';

      return {
        activity_type: activityType,
        activity_name: activityName,
        exercise_category: 'strength',
        sets: exercise.sets || source.sets || null,
        reps: exercise.reps || source.reps || null,
        weight_kg_used: exercise.weight || null,
        calories_burned: null,
        rpe: exercise.rpe || null,
        notes: exercise.notes || source.notes || null,
        exercise_id: source.exercise_id || null,
        routine_id: routine_id
      };
    });

    if (entries.length === 0) {
      return res.status(400).json({ error: 'No exercises were provided to start the workout.' });
    }

    await db.query('BEGIN');
    for (const entry of entries) {
      await db.query(
        `INSERT INTO exercise_entries
          (user_id, activity_type, activity_name, exercise_category,
           duration_mins, distance_km, sets, reps, weight_kg_used,
           calories_burned, rpe, notes, exercise_id, routine_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          userId,
          entry.activity_type,
          entry.activity_name,
          entry.exercise_category,
          null,
          null,
          entry.sets,
          entry.reps,
          entry.weight_kg_used,
          entry.calories_burned,
          entry.rpe,
          entry.notes,
          entry.exercise_id,
          entry.routine_id
        ]
      );
    }
    await db.query('COMMIT');

    return res.status(201).json({ message: 'Workout started successfully.' });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Failed to start workout:', error);
    return res.status(500).json({ error: 'Failed to start workout.' });
  }
});

module.exports = router;
