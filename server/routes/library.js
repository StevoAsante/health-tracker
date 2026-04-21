const express = require('express');
const router = express.Router();
const db = require('../db');

// ── GET /api/library/exercises ──
// Get all exercises from the library
router.get('/exercises', async (req, res) => {
  try {
    const query = `
      SELECT id, name, muscle_group, equipment, instructions, image_url, difficulty, is_compound
      FROM exercise_library
      ORDER BY muscle_group, name
    `;

    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching exercise library:', error);
    res.status(500).json({ error: 'Failed to load exercise library' });
  }
});

// ── GET /api/library/exercises/:id ──
// Get a specific exercise by ID
router.get('/exercises/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT id, name, muscle_group, equipment, instructions, image_url, difficulty, is_compound
      FROM exercise_library
      WHERE id = $1
    `;

    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching exercise:', error);
    res.status(500).json({ error: 'Failed to load exercise' });
  }
});

// ── POST /api/library/exercises ──
// Add a custom exercise to the library (admin only for now)
router.post('/exercises', async (req, res) => {
  try {
    const { name, muscle_group, equipment, instructions, difficulty, is_compound } = req.body;

    const query = `
      INSERT INTO exercise_library (name, muscle_group, equipment, instructions, difficulty, is_compound)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, muscle_group, equipment, instructions, difficulty, is_compound
    `;

    const result = await db.query(query, [name, muscle_group, equipment, instructions, difficulty, is_compound]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating exercise:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'Exercise with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create exercise' });
    }
  }
});

module.exports = router;