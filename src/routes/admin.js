// src/routes/admin.js
// Flutter screen: selfie_review_screen.dart
// Uses x-admin-secret header (ApiService().getWithAdminSecret / putWithAdminSecret)

const router = require('express').Router();
const db = require('../db');

// Simple admin secret middleware (no Firebase needed for admin panel)
function adminOnly(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid admin secret' });
  }
  next();
}

// ── GET /admin/selfies/pending ────────────────────────────────
router.get('/selfies/pending', adminOnly, async (req, res) => {
  const { rows } = await db.query(
    `SELECT sv.id, sv.selfie_url, sv.score, sv.status, sv.created_at,
            u.id as user_id, u.name, u.phone, u.vehicle_type
     FROM selfie_verifications sv
     JOIN users u ON u.id = sv.user_id
     WHERE sv.status = 'pending'
     ORDER BY sv.created_at ASC LIMIT 50`,
    []
  );
  res.json({ selfies: rows });
});

// ── PUT /admin/selfies/:id/review ─────────────────────────────
router.put('/selfies/:id/review', adminOnly, async (req, res) => {
  const { status, score } = req.body; // status: 'approved' | 'rejected'
  const { id } = req.params;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'INVALID_STATUS' });
  }

  const { rows } = await db.query(
    `UPDATE selfie_verifications
     SET status = $1, score = $2, reviewed_at = NOW()
     WHERE id = $3 RETURNING user_id, status`,
    [status, score || 0, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  // Update user is_verified if approved
  if (status === 'approved') {
    await db.query(
      `UPDATE users SET is_verified = true WHERE id = $1`,
      [rows[0].user_id]
    );
  }

  res.json({ success: true, status });
});

// ── GET /admin/stats ──────────────────────────────────────────
router.get('/stats', adminOnly, async (req, res) => {
  const [usersRes, jobsRes, sosRes] = await Promise.all([
    db.query(`SELECT COUNT(*) as total, role FROM users GROUP BY role`),
    db.query(`SELECT COUNT(*) as total, status FROM jobs GROUP BY status`),
    db.query(`SELECT COUNT(*) as total FROM sos_events WHERE created_at > NOW() - INTERVAL '24 hours'`),
  ]);

  res.json({
    users: usersRes.rows,
    jobs: jobsRes.rows,
    sos_last_24h: sosRes.rows[0]?.total || 0,
  });
});

module.exports = router;
