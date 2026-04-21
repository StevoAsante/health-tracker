const express = require('express');
const router = express.Router();
const db = require('../db');

// ── GET /api/records/list ──
// Get all personal records for the current user
router.get('/list', async (req, res) => {
  try {
    const userId = req.session.userId;

    const query = `
      SELECT
        pr.id,
        pr.exercise_id,
        pr.custom_exercise,
        pr.record_type,
        pr.value,
        pr.achieved_at,
        COALESCE(el.name, pr.custom_exercise) as exercise_name,
        el.muscle_group
      FROM personal_records pr
      LEFT JOIN exercise_library el ON pr.exercise_id = el.id
      WHERE pr.user_id = $1
      ORDER BY pr.achieved_at DESC
    `;

    const result = await db.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching personal records:', error);
    res.status(500).json({ error: 'Failed to load personal records' });
  }
});

// ── GET /api/records/exercise/:exerciseId ──
// Get PRs for a specific exercise
router.get('/exercise/:exerciseId', async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const userId = req.session.userId;

    const query = `
      SELECT
        pr.id,
        pr.record_type,
        pr.value,
        pr.achieved_at,
        pr.exercise_entry_id,
        ee.activity_name,
        ee.logged_at
      FROM personal_records pr
      LEFT JOIN exercise_entries ee ON pr.exercise_entry_id = ee.id
      WHERE pr.user_id = $1 AND pr.exercise_id = $2
      ORDER BY pr.record_type, pr.achieved_at DESC
    `;

    const result = await db.query(query, [userId, exerciseId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching exercise records:', error);
    res.status(500).json({ error: 'Failed to load exercise records' });
  }
});

// ── GET /api/records/stats ──
// Get PR statistics for the user
router.get('/stats', async (req, res) => {
  try {
    const userId = req.session.userId;

    const query = `
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT exercise_id) as unique_exercises,
        MAX(achieved_at) as latest_record_date,
        COUNT(CASE WHEN record_type = 'one_rep_max' THEN 1 END) as one_rep_max_records,
        COUNT(CASE WHEN record_type = 'weight' THEN 1 END) as weight_records,
        COUNT(CASE WHEN record_type = 'volume' THEN 1 END) as volume_records
      FROM personal_records
      WHERE user_id = $1
    `;

    const result = await db.query(query, [userId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching record stats:', error);
    res.status(500).json({ error: 'Failed to load record statistics' });
  }
});

// ── DELETE /api/records/:id ──
// Delete a personal record (admin/debugging only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Verify ownership
    const ownerQuery = 'SELECT user_id FROM personal_records WHERE id = $1';
    const ownerResult = await db.query(ownerQuery, [id]);
    if (ownerResult.rows.length === 0 || ownerResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this record' });
    }

    await db.query('DELETE FROM personal_records WHERE id = $1', [id]);
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

module.exports = router;