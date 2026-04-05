// src/middleware/subscriptionGuard.js
// Standalone subscription enforcement middleware.
// DRIVER role: blocked if subscription is INACTIVE or EXPIRED.
// MECHANIC and HELPER roles: always bypassed.
//
// Usage in routes:
//   const { subscriptionGuard } = require('../middleware/subscriptionGuard');
//   router.post('/jobs', requireAuth, subscriptionGuard, createJobHandler);

const db = require('../db');

async function subscriptionGuard(req, res, next) {
  if (req.user.role !== 'DRIVER') return next();

  let sub;
  try {
    const { rows } = await db.query(
      `SELECT tier, status, expires_at FROM subscriptions WHERE user_id = $1 LIMIT 1`,
      [req.user.userId]
    );
    sub = rows[0] || null;
  } catch (err) {
    console.error('[subscriptionGuard] DB error:', err.message);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Could not verify subscription' });
  }

  if (!sub) {
    return res.status(402).json({
      error: 'NO_SUBSCRIPTION',
      message: 'Subscribe to create job requests',
      action: '/subscription',
    });
  }

  const notExpired = sub.expires_at === null || new Date(sub.expires_at) > new Date();
  const isActive   = sub.status === 'ACTIVE' && notExpired;

  if (!isActive) {
    return res.status(402).json({
      error: 'SUBSCRIPTION_EXPIRED',
      message: 'Your subscription has expired. Please renew to continue.',
      action: '/subscription',
      currentStatus: sub.status,
      expiresAt: sub.expires_at,
    });
  }

  req.subscription = { tier: sub.tier, status: sub.status, expiresAt: sub.expires_at };
  next();
}

module.exports = { subscriptionGuard };
