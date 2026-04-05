// src/middleware/auth.js
const { admin } = require('../services/firebase');
const db = require('../db');

// Attaches req.user = { uid, userId, role, phone } on success
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'No token provided' });
  }

  const token = header.split(' ')[1];

  try {
    // Verify Firebase ID token
    const decoded = await admin.auth().verifyIdToken(token, true);

    // Get user from our DB (needed for role, status check)
    const { rows } = await db.query(
      'SELECT id, role, status, phone FROM users WHERE firebase_uid = $1',
      [decoded.uid]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not registered' });
    }

    const user = rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Account suspended' });
    }

    req.user = {
      uid: decoded.uid,
      userId: user.id,
      role: user.role,
      phone: user.phone,
    };

    // Update last_seen_at (fire and forget — don't block request)
    db.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]).catch(() => {});

    next();
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Session expired' });
    }
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid token' });
    }
    console.error('[Auth Middleware]', err.message);
    return res.status(401).json({ error: 'AUTH_ERROR', message: 'Authentication failed' });
  }
}

// Blocks unpaid drivers from certain routes
// Flutter catches 402 → shows subscription screen
async function requireSubscription(req, res, next) {
  if (req.user.role !== 'DRIVER') return next(); // Mechanics/Helpers bypass

  const { rows } = await db.query(
    `SELECT status, expires_at FROM subscriptions WHERE user_id = $1`,
    [req.user.userId]
  );

  if (rows.length === 0) {
    return res.status(402).json({
      error: 'NO_SUBSCRIPTION',
      message: 'Subscribe to access this feature',
    });
  }

  const sub = rows[0];
  const isActive =
    sub.status === 'ACTIVE' &&
    (sub.expires_at === null || new Date(sub.expires_at) > new Date());

  if (!isActive) {
    return res.status(402).json({
      error: 'SUBSCRIPTION_EXPIRED',
      message: 'Your subscription has expired. Please renew to continue.',
    });
  }

  next();
}

// Role guard — usage: requireRole('ADMIN') or requireRole('MECHANIC','ADMIN')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `This route requires role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireSubscription, requireRole };
