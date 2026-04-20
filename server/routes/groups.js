// ============================================================
// groups.js — User Groups Routes
// ============================================================
// Handles creating groups, joining via invite code, and leaving.
//
// ENDPOINTS:
//   POST   /api/groups/create        → Create a new group
//   GET    /api/groups/list          → List groups the user is in
//   POST   /api/groups/join          → Join a group via invite code
//   DELETE /api/groups/:id/leave     → Leave a group
// ============================================================

const express = require('express');
const crypto  = require('crypto'); // Built-in Node.js module for generating random codes
const db      = require('../db');
const router  = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next();
}

// Helper: generate a short random invite code (e.g. "A3B9KX")
function generateInviteCode() {
  // crypto.randomBytes gives us cryptographically secure random bytes.
  // .toString('hex') converts them to letters and numbers.
  // .toUpperCase().slice(0, 8) trims it to 8 characters.
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ── POST /api/groups/create ──────────────────────────────
// Creates a new group and automatically adds the creator as a member.
router.post('/create', requireLogin, async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  const inviteCode = generateInviteCode();

  try {
    // Create the group
    const groupResult = await db.query(
      `INSERT INTO groups (name, created_by, invite_code)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), req.session.userId, inviteCode]
    );

    const group = groupResult.rows[0];

    // Automatically add the creator as the first member
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.session.userId]
    );

    return res.status(201).json({
      message: `Group "${group.name}" created!`,
      group,
      invite_code: inviteCode
    });

  } catch (error) {
    // Handle the case where the group name already exists
    if (error.code === '23505') { // PostgreSQL unique violation error code
      return res.status(409).json({ error: 'A group with that name already exists.' });
    }
    console.error('Group create error:', error.message);
    return res.status(500).json({ error: 'Failed to create group.' });
  }
});

// ── GET /api/groups/list ─────────────────────────────────
// Returns all groups the logged-in user is a member of.
router.get('/list', requireLogin, async (req, res) => {
  try {
    // JOIN combines data from two tables.
    // Here: get group info + member count for each group the user belongs to.
    const result = await db.query(
      `SELECT g.*, COUNT(gm2.user_id) AS member_count
       FROM groups g
       JOIN group_members gm  ON gm.group_id = g.id AND gm.user_id = $1
       JOIN group_members gm2 ON gm2.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name ASC`,
      [req.session.userId]
    );

    return res.status(200).json({ groups: result.rows });

  } catch (error) {
    console.error('Groups list error:', error.message);
    return res.status(500).json({ error: 'Failed to load groups.' });
  }
});

// ── POST /api/groups/join ────────────────────────────────
// Lets a user join a group using an invite code.
router.post('/join', requireLogin, async (req, res) => {
  const { invite_code } = req.body;

  if (!invite_code) {
    return res.status(400).json({ error: 'Invite code is required.' });
  }

  try {
    // Find the group with this invite code
    const groupResult = await db.query(
      'SELECT * FROM groups WHERE invite_code = $1',
      [invite_code.toUpperCase().trim()]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite code. Group not found.' });
    }

    const group = groupResult.rows[0];

    // Check if the user is already a member
    const memberCheck = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, req.session.userId]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(409).json({ error: 'You are already a member of this group.' });
    }

    // Add the user as a member
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.session.userId]
    );

    return res.status(200).json({
      message: `You've joined "${group.name}"!`,
      group
    });

  } catch (error) {
    console.error('Group join error:', error.message);
    return res.status(500).json({ error: 'Failed to join group.' });
  }
});

// ── DELETE /api/groups/:id/leave ─────────────────────────
// Removes the user from a specific group.
router.delete('/:id/leave', requireLogin, async (req, res) => {
  const groupId = parseInt(req.params.id);

  try {
    const result = await db.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING group_id',
      [groupId, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'You are not a member of this group.' });
    }

    return res.status(200).json({ message: 'You have left the group.' });

  } catch (error) {
    console.error('Group leave error:', error.message);
    return res.status(500).json({ error: 'Failed to leave group.' });
  }
});

module.exports = router;
