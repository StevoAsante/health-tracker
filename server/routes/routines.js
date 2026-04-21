const express = require('express');
const router = express.Router();
const db = require('../db');

// ── GET /api/routines/list ──
// Get all routines (user's own + public ones)
router.get('/list', async (req, res) => {
  try {
    const userId = req.session.userId;

    const query = `
      SELECT
        r.id,
        r.name,
        r.description,
        r.difficulty,
        r.estimated_time,
        r.is_public,
        r.created_at,
        COUNT(re.id) as exercise_count,
        r.user_id = $1 as is_owner
      FROM workout_routines r
      LEFT JOIN routine_exercises re ON r.id = re.routine_id
      WHERE r.user_id = $1 OR r.is_public = true
      GROUP BY r.id, r.name, r.description, r.difficulty, r.estimated_time, r.is_public, r.created_at, r.user_id
      ORDER BY r.created_at DESC
    `;

    const result = await db.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching routines:', error);
    res.status(500).json({ error: 'Failed to load routines' });
  }
});

// ── GET /api/routines/:id ──
// Get a specific routine with all its exercises
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // First check if user can access this routine
    const accessQuery = `
      SELECT id FROM workout_routines
      WHERE id = $1 AND (user_id = $2 OR is_public = true)
    `;

    const accessResult = await db.query(accessQuery, [id, userId]);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Get routine details
    const routineQuery = `
      SELECT id, name, description, difficulty, estimated_time, is_public, created_at
      FROM workout_routines
      WHERE id = $1
    `;

    const routineResult = await db.query(routineQuery, [id]);

    // Get exercises
    const exercisesQuery = `
      SELECT
        re.id,
        re.exercise_id,
        re.custom_exercise,
        re.sets,
        re.reps,
        re.rest_seconds,
        re.notes,
        re.order_position,
        el.name as exercise_name,
        el.muscle_group,
        el.equipment
      FROM routine_exercises re
      LEFT JOIN exercise_library el ON re.exercise_id = el.id
      WHERE re.routine_id = $1
      ORDER BY re.order_position
    `;

    const exercisesResult = await db.query(exercisesQuery, [id]);

    res.json({
      ...routineResult.rows[0],
      exercises: exercisesResult.rows
    });
  } catch (error) {
    console.error('Error fetching routine:', error);
    res.status(500).json({ error: 'Failed to load routine' });
  }
});

// ── POST /api/routines ──
// Create a new workout routine
router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { name, description, difficulty, estimated_time, is_public, exercises } = req.body;

    // Start transaction
    await db.query('BEGIN');

    // Create routine
    const routineQuery = `
      INSERT INTO workout_routines (user_id, name, description, difficulty, estimated_time, is_public)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, description, difficulty, estimated_time, is_public, created_at
    `;

    const routineResult = await db.query(routineQuery, [userId, name, description, difficulty, estimated_time, is_public]);
    const routine = routineResult.rows[0];

    // Add exercises
    if (exercises && exercises.length > 0) {
      for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i];
        const exerciseQuery = `
          INSERT INTO routine_exercises (routine_id, exercise_id, custom_exercise, sets, reps, rest_seconds, notes, order_position)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await db.query(exerciseQuery, [
          routine.id,
          exercise.exercise_id || null,
          exercise.custom_exercise || null,
          exercise.sets,
          exercise.reps,
          exercise.rest_seconds || 90,
          exercise.notes || null,
          i + 1
        ]);
      }
    }

    await db.query('COMMIT');
    res.status(201).json(routine);
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error creating routine:', error);
    res.status(500).json({ error: 'Failed to create routine' });
  }
});

// ── PUT /api/routines/:id ──
// Update a routine (owner only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;
    const { name, description, difficulty, estimated_time, is_public, exercises } = req.body;

    // Check ownership
    const ownerQuery = 'SELECT user_id FROM workout_routines WHERE id = $1';
    const ownerResult = await db.query(ownerQuery, [id]);
    if (ownerResult.rows.length === 0 || ownerResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this routine' });
    }

    // Start transaction
    await db.query('BEGIN');

    // Update routine
    const updateQuery = `
      UPDATE workout_routines
      SET name = $1, description = $2, difficulty = $3, estimated_time = $4, is_public = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING id, name, description, difficulty, estimated_time, is_public, updated_at
    `;

    const routineResult = await db.query(updateQuery, [name, description, difficulty, estimated_time, is_public, id]);
    const routine = routineResult.rows[0];

    // Delete existing exercises
    await db.query('DELETE FROM routine_exercises WHERE routine_id = $1', [id]);

    // Add new exercises
    if (exercises && exercises.length > 0) {
      for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i];
        const exerciseQuery = `
          INSERT INTO routine_exercises (routine_id, exercise_id, custom_exercise, sets, reps, rest_seconds, notes, order_position)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await db.query(exerciseQuery, [
          id,
          exercise.exercise_id || null,
          exercise.custom_exercise || null,
          exercise.sets,
          exercise.reps,
          exercise.rest_seconds || 90,
          exercise.notes || null,
          i + 1
        ]);
      }
    }

    await db.query('COMMIT');
    res.json(routine);
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error updating routine:', error);
    res.status(500).json({ error: 'Failed to update routine' });
  }
});

// ── DELETE /api/routines/:id ──
// Delete a routine (owner only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Check ownership
    const ownerQuery = 'SELECT user_id FROM workout_routines WHERE id = $1';
    const ownerResult = await db.query(ownerQuery, [id]);
    if (ownerResult.rows.length === 0 || ownerResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this routine' });
    }

    await db.query('DELETE FROM workout_routines WHERE id = $1', [id]);
    res.json({ message: 'Routine deleted successfully' });
  } catch (error) {
    console.error('Error deleting routine:', error);
    res.status(500).json({ error: 'Failed to delete routine' });
  }
});

module.exports = router;