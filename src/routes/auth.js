// src/routes/auth.js
// Flutter calls:
//   POST /api/v1/auth/verify-firebase  → login/register
//   GET  /api/v1/auth/me               → session restore on app restart

const router = require('express').Router();
const { admin } = require('../services/firebase');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

// ── POST /auth/verify-firebase ────────────────────────────────
// Called after Firebase OTP or Google sign-in
// Returns: { user, role, isNewUser, redirectTo }
// Flutter's auth_provider.dart → _verifyWithBackend()

router.post('/verify-firebase', async (req, res) => {
  const { idToken, role: requestedRole = 'DRIVER' } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'MISSING_TOKEN', message: 'idToken required' });
  }

  // Verify Firebase token
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken, true);
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Firebase token invalid' });
  }

  const phone = decoded.phone_number || null;
  const email = decoded.email || null;
  const firebaseUid = decoded.uid;

  // Check if user exists
  const { rows: existing } = await db.query(
    'SELECT id, role, status, name FROM users WHERE firebase_uid = $1',
    [firebaseUid]
  );

  let user;
  let isNewUser = false;

  if (existing.length === 0) {
    // New user — create account
    isNewUser = true;
    const validRole = ['DRIVER', 'MECHANIC', 'HELPER'].includes(requestedRole)
      ? requestedRole
      : 'DRIVER';

    const { rows } = await db.query(
      `INSERT INTO users (firebase_uid, phone, email, role, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, firebase_uid, phone, email, name, profile_photo,
                 vehicle_type, vehicle_reg, role, rating_avg, total_helps,
                 wallet_balance, language, is_verified, status`,
      [firebaseUid, phone, email, validRole]
    );
    user = rows[0];

    // Create empty subscription record for drivers
    if (validRole === 'DRIVER') {
      await db.query(
        `INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, 'NONE', 'INACTIVE')
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      );
    }

    // Create empty streak record
    await db.query(
      `INSERT INTO daily_streaks (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );
  } else {
    // Existing user — update last_seen
    await db.query(
      `UPDATE users SET last_seen_at = NOW() WHERE firebase_uid = $1`,
      [firebaseUid]
    );

    const { rows } = await db.query(
      `SELECT id, firebase_uid, phone, email, name, profile_photo,
              vehicle_type, vehicle_reg, role, rating_avg, total_helps,
              wallet_balance, language, is_verified, status
       FROM users WHERE firebase_uid = $1`,
      [firebaseUid]
    );
    user = rows[0];
  }

  // Determine redirect based on role + new user status
  const redirectTo = isNewUser
    ? '/profile-setup'
    : _redirectForRole(user.role);

  res.json({
    user: _formatUser(user),
    role: user.role,
    isNewUser,
    redirectTo,
  });
});

// ── GET /auth/me ──────────────────────────────────────────────
// Called on app restart to restore session
// Flutter's auth_provider.dart → _restoreSession()

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.firebase_uid, u.phone, u.email, u.name, u.profile_photo,
            u.vehicle_type, u.vehicle_reg, u.role, u.rating_avg, u.total_helps,
            u.wallet_balance, u.language, u.is_verified, u.status,
            s.tier as sub_tier, s.status as sub_status, s.expires_at as sub_expires
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = $1`,
    [req.user.userId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const user = rows[0];

  res.json({
    user: _formatUser(user),
    role: user.role,
    subscription: {
      tier: user.sub_tier || 'NONE',
      status: user.sub_status || 'INACTIVE',
      expiresAt: user.sub_expires,
    },
    redirectTo: _redirectForRole(user.role),
  });
});

// ── PUT /auth/profile ─────────────────────────────────────────
// Profile setup after registration
router.put('/profile', requireAuth, async (req, res) => {
  const { name, vehicle_type, vehicle_reg, language } = req.body;

  const { rows } = await db.query(
    `UPDATE users SET name = $1, vehicle_type = $2, vehicle_reg = $3,
                      language = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, vehicle_type, vehicle_reg, language, role`,
    [name, vehicle_type, vehicle_reg, language || 'hi', req.user.userId]
  );

  res.json({ user: rows[0] });
});

// ─── Helpers ──────────────────────────────────────────────────

function _formatUser(u) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    name: u.name,
    profile_photo: u.profile_photo,
    vehicle_type: u.vehicle_type,
    vehicle_reg: u.vehicle_reg,
    role: u.role,
    rating_avg: parseFloat(u.rating_avg) || 0,
    total_helps: u.total_helps || 0,
    wallet_balance: parseFloat(u.wallet_balance) || 0,
    language: u.language || 'hi',
    is_verified: u.is_verified || false,
    status: u.status,
  };
}

function _redirectForRole(role) {
  switch (role) {
    case 'MECHANIC': return '/mechanic-dashboard';
    case 'HELPER':   return '/job-offers';
    default:         return '/home';
  }
}

module.exports = router;
