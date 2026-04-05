// src/routes/dashboard.js
// Flutter screen: home_screen.dart

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

// ── GET /dashboard ────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.userId;

  // Parallel queries
  const [userRes, streakRes, jobsRes, subRes] = await Promise.all([
    db.query(
      `SELECT id, name, profile_photo, role, rating_avg, total_helps,
              wallet_balance, vehicle_type, is_verified
       FROM users WHERE id = $1`,
      [userId]
    ),
    db.query(
      `SELECT current_streak, longest_streak, total_checkins, last_checkin
       FROM daily_streaks WHERE user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT COUNT(*) as active_jobs FROM jobs
       WHERE requester_id = $1 AND status IN ('pending','matched','in_progress')`,
      [userId]
    ),
    db.query(
      `SELECT tier, status, expires_at FROM subscriptions WHERE user_id = $1`,
      [userId]
    ),
  ]);

  const user = userRes.rows[0];
  const streak = streakRes.rows[0] || { current_streak: 0, longest_streak: 0, total_checkins: 0 };
  const activeJobs = parseInt(jobsRes.rows[0]?.active_jobs || 0);
  const subscription = subRes.rows[0] || { tier: 'NONE', status: 'INACTIVE' };

  res.json({
    user,
    streak,
    active_jobs: activeJobs,
    subscription,
    tips: _getDailyTip(),
  });
});

function _getDailyTip() {
  const tips = [
    { title: 'Tyre Pressure', body: 'Har 15 din mein tyre pressure check karo. Sahi pressure se 3% fuel bachta hai.' },
    { title: 'Engine Oil', body: 'Engine oil ki colour check karo. Kaala matlab change karna hai.' },
    { title: 'Battery', body: 'Terminals pe white powder matlab corrosion — isse saaf karo warna start nahi hogi.' },
    { title: 'Coolant', body: 'Coolant level low mat hone do — engine overheat ka sabse bada reason yahi hai.' },
    { title: 'Brake Fluid', body: 'Brake fluid dark ho toh change karwao — brake response better hoga.' },
  ];
  const idx = new Date().getDate() % tips.length;
  return tips[idx];
}

module.exports = router;
