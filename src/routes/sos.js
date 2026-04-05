// src/routes/sos.js
// Flutter screen: sos_screen.dart
// ApiService().triggerSos(lat, lng)

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

// ── POST /sos/trigger ─────────────────────────────────────────
router.post('/trigger', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'MISSING_COORDS' });
  }

  const { rows } = await db.query(
    `INSERT INTO sos_events (user_id, lat, lng, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id, lat, lng, status, created_at`,
    [req.user.userId, lat, lng]
  );

  // Get nearby mechanics to notify (within 15km)
  const { rows: nearbyMechanics } = await db.query(
    `SELECT u.id, u.name, u.phone, mp.current_lat, mp.current_lng
     FROM mechanic_profiles mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.is_available = true
       AND mp.current_lat IS NOT NULL
       AND (
         6371 * acos(
           cos(radians($1)) * cos(radians(mp.current_lat)) *
           cos(radians(mp.current_lng) - radians($2)) +
           sin(radians($1)) * sin(radians(mp.current_lat))
         )
       ) <= 15
     LIMIT 10`,
    [lat, lng]
  );

  res.status(201).json({
    sos: rows[0],
    nearby_mechanics: nearbyMechanics.length,
    message: `SOS sent. ${nearbyMechanics.length} mechanics nearby notified.`,
  });
});

// ── GET /sos/active ───────────────────────────────────────────
router.get('/active', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.id, s.lat, s.lng, s.status, s.created_at,
            u.name, u.phone, u.vehicle_type, u.vehicle_reg
     FROM sos_events s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'active'
       AND s.created_at > NOW() - INTERVAL '2 hours'
     ORDER BY s.created_at DESC LIMIT 20`,
    []
  );
  res.json({ sos_events: rows });
});

// ── POST /sos/:id/resolve ─────────────────────────────────────
router.post('/:id/resolve', requireAuth, async (req, res) => {
  await db.query(
    `UPDATE sos_events SET status = 'resolved'
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.userId]
  );
  res.json({ success: true });
});

module.exports = router;
