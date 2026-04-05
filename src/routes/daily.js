// src/routes/daily.js
// Flutter screens: streak_screen.dart, highway_alerts_screen.dart
// GET  /api/v1/daily/streak
// POST /api/v1/daily/streak/checkin
// GET  /api/v1/daily/alerts
// POST /api/v1/daily/alerts
// POST /api/v1/daily/alerts/:id/vote

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const dayjs = require('dayjs');

// ── GET /daily/streak ─────────────────────────────────────────
router.get('/streak', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT current_streak, longest_streak, total_checkins, last_checkin
     FROM daily_streaks WHERE user_id = $1`,
    [req.user.userId]
  );

  if (rows.length === 0) {
    return res.json({
      current_streak: 0, longest_streak: 0,
      total_checkins: 0, last_checkin: null, can_checkin: true,
    });
  }

  const streak = rows[0];
  const today = dayjs().format('YYYY-MM-DD');
  const canCheckin = !streak.last_checkin ||
    dayjs(streak.last_checkin).format('YYYY-MM-DD') !== today;

  res.json({ ...streak, can_checkin: canCheckin });
});

// ── POST /daily/streak/checkin ────────────────────────────────
router.post('/streak/checkin', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const today = dayjs().format('YYYY-MM-DD');

  const { rows } = await db.query(
    `SELECT current_streak, longest_streak, total_checkins, last_checkin
     FROM daily_streaks WHERE user_id = $1`,
    [userId]
  );

  let streak = rows[0] || { current_streak: 0, longest_streak: 0, total_checkins: 0, last_checkin: null };

  // Already checked in today
  if (streak.last_checkin && dayjs(streak.last_checkin).format('YYYY-MM-DD') === today) {
    return res.status(409).json({ error: 'ALREADY_CHECKED_IN', message: 'Aaj already check-in ho gaya' });
  }

  // Calculate new streak
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const wasYesterday = streak.last_checkin &&
    dayjs(streak.last_checkin).format('YYYY-MM-DD') === yesterday;

  const newStreak = wasYesterday ? streak.current_streak + 1 : 1;
  const newLongest = Math.max(newStreak, streak.longest_streak);
  const newTotal = streak.total_checkins + 1;

  await db.query(
    `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, total_checkins, last_checkin)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak = $2, longest_streak = $3,
       total_checkins = $4, last_checkin = $5, updated_at = NOW()`,
    [userId, newStreak, newLongest, newTotal, today]
  );

  res.json({
    current_streak: newStreak,
    longest_streak: newLongest,
    total_checkins: newTotal,
    last_checkin: today,
    reward: newStreak % 7 === 0 ? '7_day_milestone' : null,
  });
});

// ── GET /daily/alerts ─────────────────────────────────────────
router.get('/alerts', requireAuth, async (req, res) => {
  const { type, lat, lng } = req.query;

  let where = `WHERE expires_at > NOW()`;
  const params = [];

  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT a.id, a.type, a.message, a.location, a.lat, a.lng,
            a.upvotes, a.downvotes, a.created_at,
            u.name as posted_by
     FROM highway_alerts a
     JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC LIMIT 50`,
    params
  );

  res.json({ alerts: rows });
});

// ── POST /daily/alerts ────────────────────────────────────────
router.post('/alerts', requireAuth, async (req, res) => {
  const { type, message, location, lat, lng } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  const { rows } = await db.query(
    `INSERT INTO highway_alerts (user_id, type, message, location, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, type, message, created_at`,
    [req.user.userId, type, message, location, lat, lng]
  );

  res.status(201).json({ alert: rows[0] });
});

// ── POST /daily/alerts/:id/vote ───────────────────────────────
router.post('/alerts/:id/vote', requireAuth, async (req, res) => {
  const { vote } = req.body; // 'up' or 'down'
  const { id } = req.params;

  if (!['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'INVALID_VOTE' });
  }

  const col = vote === 'up' ? 'upvotes' : 'downvotes';
  await db.query(
    `UPDATE highway_alerts SET ${col} = ${col} + 1 WHERE id = $1`,
    [id]
  );

  res.json({ success: true });
});

module.exports = router;
