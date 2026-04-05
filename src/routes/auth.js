// src/routes/auth.js
const router = require('express').Router();
const { admin } = require('../services/firebase');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const jwt = require('jsonwebtoken');

// ── POST /auth/verifyOtp ──────────────────────────────────────
// Called by Flutter after Firebase OTP sign-in succeeds.
// Receives Firebase idToken → validates → creates/fetches user → returns JWT + role.

router.post('/verifyOtp', async (req, res) => {
  const { idToken, role: requestedRole = 'DRIVER' } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'MISSING_TOKEN', message: 'idToken required' });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken, true);
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Firebase token invalid or expired' });
  }

  const { uid: firebaseUid, phone_number: phone = null, email = null } = decoded;
  const { rows: existing } = await db.query(
    'SELECT id, role, status FROM users WHERE firebase_uid = $1',
    [firebaseUid]
  );

  let user;
  let isNewUser = false;

  if (existing.length === 0) {
    isNewUser = true;
    const validRole = ['DRIVER','MECHANIC','HELPER'].includes(requestedRole) ? requestedRole : 'DRIVER';
    const { rows } = await db.query(
      `INSERT INTO users (firebase_uid, phone, email, role, status)
       VALUES ($1,$2,$3,$4,'active')
       RETURNING id,firebase_uid,phone,email,name,profile_photo,vehicle_type,
                 vehicle_reg,role,rating_avg,total_helps,wallet_balance,language,is_verified,status`,
      [firebaseUid, phone, email, validRole]
    );
    user = rows[0];
    if (validRole === 'DRIVER') {
      await db.query(
        `INSERT INTO subscriptions (user_id,tier,status) VALUES ($1,'NONE','INACTIVE') ON CONFLICT(user_id) DO NOTHING`,
        [user.id]
      );
    }
    await db.query(
      `INSERT INTO daily_streaks (user_id) VALUES ($1) ON CONFLICT(user_id) DO NOTHING`,
      [user.id]
    );
  } else {
    await db.query('UPDATE users SET last_seen_at=NOW() WHERE firebase_uid=$1', [firebaseUid]);
    const { rows } = await db.query(
      `SELECT u.id,u.firebase_uid,u.phone,u.email,u.name,u.profile_photo,u.vehicle_type,
              u.vehicle_reg,u.role,u.rating_avg,u.total_helps,u.wallet_balance,u.language,
              u.is_verified,u.status,s.tier AS sub_tier,s.status AS sub_status,s.expires_at AS sub_expires
       FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id
       WHERE u.firebase_uid=$1`,
      [firebaseUid]
    );
    user = rows[0];
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Account suspended' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: 'SERVER_CONFIG_ERROR' });

  const token = jwt.sign(
    { userId: user.id, role: user.role, phone: user.phone },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRY || '30d' }
  );

  res.json({
    token,
    is_new_user: isNewUser,
    role: user.role,
    user: _formatUser(user),
    subscription: { tier: user.sub_tier||'NONE', status: user.sub_status||'INACTIVE', expiresAt: user.sub_expires||null },
    redirectTo: isNewUser ? '/profile-setup' : _redirectForRole(user.role),
  });
});

// ── POST /auth/verify-firebase ────────────────────────────────
// Legacy alias — kept for backward compatibility

router.post('/verify-firebase', async (req, res) => {
  const { idToken, role: requestedRole = 'DRIVER' } = req.body;
  if (!idToken) return res.status(400).json({ error: 'MISSING_TOKEN', message: 'idToken required' });

  let decoded;
  try { decoded = await admin.auth().verifyIdToken(idToken, true); }
  catch { return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Firebase token invalid' }); }

  const { uid: firebaseUid, phone_number: phone = null, email = null } = decoded;
  const { rows: existing } = await db.query('SELECT id,role,status FROM users WHERE firebase_uid=$1', [firebaseUid]);

  let user; let isNewUser = false;
  if (existing.length === 0) {
    isNewUser = true;
    const validRole = ['DRIVER','MECHANIC','HELPER'].includes(requestedRole) ? requestedRole : 'DRIVER';
    const { rows } = await db.query(
      `INSERT INTO users (firebase_uid,phone,email,role,status) VALUES ($1,$2,$3,$4,'active')
       RETURNING id,firebase_uid,phone,email,name,profile_photo,vehicle_type,vehicle_reg,role,
                 rating_avg,total_helps,wallet_balance,language,is_verified,status`,
      [firebaseUid,phone,email,validRole]
    );
    user = rows[0];
    if (validRole==='DRIVER') await db.query(`INSERT INTO subscriptions (user_id,tier,status) VALUES ($1,'NONE','INACTIVE') ON CONFLICT(user_id) DO NOTHING`,[user.id]);
    await db.query(`INSERT INTO daily_streaks (user_id) VALUES ($1) ON CONFLICT(user_id) DO NOTHING`,[user.id]);
  } else {
    await db.query('UPDATE users SET last_seen_at=NOW() WHERE firebase_uid=$1',[firebaseUid]);
    const { rows } = await db.query(
      `SELECT u.*,s.tier AS sub_tier,s.status AS sub_status,s.expires_at AS sub_expires
       FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.firebase_uid=$1`,
      [firebaseUid]
    );
    user = rows[0];
  }

  res.json({
    user: _formatUser(user), role: user.role, isNewUser,
    subscription: { tier: user.sub_tier||'NONE', status: user.sub_status||'INACTIVE', expiresAt: user.sub_expires||null },
    redirectTo: isNewUser ? '/profile-setup' : _redirectForRole(user.role),
  });
});

// ── GET /auth/me ──────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id,u.firebase_uid,u.phone,u.email,u.name,u.profile_photo,u.vehicle_type,
            u.vehicle_reg,u.role,u.rating_avg,u.total_helps,u.wallet_balance,u.language,
            u.is_verified,u.status,
            s.tier AS sub_tier,s.status AS sub_status,s.expires_at AS sub_expires
     FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id
     WHERE u.id=$1`,
    [req.user.userId]
  );
  if (rows.length===0) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  const u = rows[0];
  res.json({
    user: _formatUser(u), role: u.role,
    subscription: { tier: u.sub_tier||'NONE', status: u.sub_status||'INACTIVE', expiresAt: u.sub_expires||null },
    redirectTo: _redirectForRole(u.role),
  });
});

// ── PUT /auth/profile ─────────────────────────────────────────

router.put('/profile', requireAuth, async (req, res) => {
  const { name, vehicle_type, vehicle_reg, language } = req.body;
  const { rows } = await db.query(
    `UPDATE users SET name=COALESCE($1,name),vehicle_type=COALESCE($2,vehicle_type),
                      vehicle_reg=COALESCE($3,vehicle_reg),language=COALESCE($4,language),updated_at=NOW()
     WHERE id=$5
     RETURNING id,name,vehicle_type,vehicle_reg,language,role,phone,email,
               profile_photo,rating_avg,total_helps,wallet_balance,is_verified,status`,
    [name||null,vehicle_type||null,vehicle_reg||null,language||null,req.user.userId]
  );
  res.json({ user: _formatUser(rows[0]) });
});

// ── PUT /auth/location ────────────────────────────────────────

router.put('/location', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat||!lng) return res.status(400).json({ error: 'MISSING_COORDS' });
  await db.query(
    'UPDATE mechanic_profiles SET current_lat=$1,current_lng=$2,last_location_at=NOW() WHERE user_id=$3',
    [lat, lng, req.user.userId]
  );
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────

function _formatUser(u) {
  return {
    id: u.id, phone: u.phone, email: u.email, name: u.name,
    profile_photo: u.profile_photo, vehicle_type: u.vehicle_type,
    vehicle_reg: u.vehicle_reg, role: u.role,
    rating_avg: parseFloat(u.rating_avg)||0, total_helps: u.total_helps||0,
    wallet_balance: parseFloat(u.wallet_balance)||0,
    language: u.language||'hi', is_verified: u.is_verified||false, status: u.status,
  };
}

function _redirectForRole(role) {
  switch(role) {
    case 'MECHANIC': return '/mechanic-dashboard';
    case 'HELPER':   return '/job-offers';
    default:         return '/home';
  }
}

module.exports = router;
