const express = require('express');
const router = express.Router();
const db = require('../db');

// ── GET /api/social/feed ──
// Get social feed posts (following + own posts)
router.get('/feed', async (req, res) => {
  try {
    const userId = req.session.userId;

    const query = `
      SELECT
        p.id,
        p.content,
        p.image_url,
        p.workout_data,
        p.is_public,
        p.created_at,
        p.updated_at,
        u.username,
        u.id as user_id,
        COALESCE(like_counts.likes_count, 0) as likes_count,
        COALESCE(comment_counts.comments_count, 0) as comments_count,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as is_liked_by_user
      FROM social_posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as likes_count
        FROM post_likes
        GROUP BY post_id
      ) like_counts ON p.id = like_counts.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as comments_count
        FROM post_comments
        GROUP BY post_id
      ) comment_counts ON p.id = comment_counts.post_id
      WHERE p.is_public = true AND (
        p.user_id = $1 OR
        p.user_id IN (
          SELECT following_id
          FROM user_follows
          WHERE follower_id = $1
        )
      )
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

    const result = await db.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching social feed:', error);
    res.status(500).json({ error: 'Failed to load social feed' });
  }
});

// ── POST /api/social/posts ──
// Create a new social post
router.post('/posts', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { content, image_url, workout_data, is_public } = req.body;

    const query = `
      INSERT INTO social_posts (user_id, content, image_url, workout_data, is_public)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, content, image_url, workout_data, is_public, created_at
    `;

    const result = await db.query(query, [userId, content, image_url, workout_data, is_public !== false]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// ── DELETE /api/social/posts/:id ──
// Delete a post (owner only)
router.delete('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Check ownership
    const ownerQuery = 'SELECT user_id FROM social_posts WHERE id = $1';
    const ownerResult = await db.query(ownerQuery, [id]);
    if (ownerResult.rows.length === 0 || ownerResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await db.query('DELETE FROM social_posts WHERE id = $1', [id]);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ── POST /api/social/posts/:id/like ──
// Like or unlike a post
router.post('/posts/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Check if already liked
    const checkQuery = 'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2';
    const checkResult = await db.query(checkQuery, [id, userId]);

    if (checkResult.rows.length > 0) {
      // Unlike
      await db.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
      res.json({ liked: false });
    } else {
      // Like
      await db.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [id, userId]);
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// ── GET /api/social/posts/:id/comments ──
// Get comments for a post
router.get('/posts/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        c.id,
        c.content,
        c.created_at,
        u.username,
        u.id as user_id
      FROM post_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `;

    const result = await db.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

// ── POST /api/social/posts/:id/comments ──
// Add a comment to a post
router.post('/posts/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;
    const { content } = req.body;

    const query = `
      INSERT INTO post_comments (post_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, content, created_at
    `;

    const result = await db.query(query, [id, userId, content]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// ── GET /api/social/following ──
// Get users that the current user is following
router.get('/following', async (req, res) => {
  try {
    const userId = req.session.userId;

    const query = `
      SELECT
        u.id,
        u.username,
        u.real_name,
        u.profile_picture,
        u.bio,
        uf.created_at as followed_at
      FROM user_follows uf
      JOIN users u ON uf.following_id = u.id
      WHERE uf.follower_id = $1
      ORDER BY uf.created_at DESC
    `;

    const result = await db.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching following:', error);
    res.status(500).json({ error: 'Failed to load following list' });
  }
});

// ── GET /api/social/followers ──
// Get users that follow the current user
router.get('/followers', async (req, res) => {
  try {
    const userId = req.session.userId;

    const query = `
      SELECT
        u.id,
        u.username,
        u.real_name,
        u.profile_picture,
        u.bio,
        uf.created_at as followed_at
      FROM user_follows uf
      JOIN users u ON uf.follower_id = u.id
      WHERE uf.following_id = $1
      ORDER BY uf.created_at DESC
    `;

    const result = await db.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ error: 'Failed to load followers list' });
  }
});

// ── POST /api/social/follow/:userId ──
// Follow or unfollow a user
router.post('/follow/:userId', async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.session.userId;

    if (parseInt(targetUserId) === userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    // Check if already following
    const checkQuery = 'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2';
    const checkResult = await db.query(checkQuery, [userId, targetUserId]);

    if (checkResult.rows.length > 0) {
      // Unfollow
      await db.query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2', [userId, targetUserId]);
      res.json({ following: false });
    } else {
      // Follow
      await db.query('INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)', [userId, targetUserId]);
      res.json({ following: true });
    }
  } catch (error) {
    console.error('Error toggling follow:', error);
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

// ── GET /api/social/users/search ──
// Search for users to follow
router.get('/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.session.userId;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const query = `
      SELECT
        u.id,
        u.username,
        u.real_name,
        u.profile_picture,
        u.bio,
        EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $2 AND following_id = u.id) as is_following
      FROM users u
      WHERE (u.username ILIKE $1 OR u.real_name ILIKE $1) AND u.id != $2
      ORDER BY u.username
      LIMIT 20
    `;

    const result = await db.query(query, [`%${q}%`, userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

module.exports = router;