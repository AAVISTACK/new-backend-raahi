// src/routes/mechanics.js
// Flutter screen: mechanics_map_screen.dart
// ApiService().getNearbyMechanics(lat, lng, radius)

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

// ── GET /mechanics/nearby ─────────────────────────────────────
// Flutter passes: ?lat=30.7&lng=76.7&radius=10
router.get('/nearby', requireAuth, async (req, res) => {
  const { lat, lng, radius = 20 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'MISSING_COORDS', message: 'lat and lng required' });
  }

  // Haversine distance in SQL — good enough for < 1000 users
  // When scaling to 10k+ users, add PostGIS extension (see migrations/002_postgis.sql)
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.profile_photo, u.rating_avg, u.phone,
            mp.shop_name, mp.specializations, mp.is_available,
            mp.current_lat as lat, mp.current_lng as lng,
            (
              6371 * acos(
                cos(radians($1)) * cos(radians(mp.current_lat)) *
                cos(radians(mp.current_lng) - radians($2)) +
                sin(radians($1)) * sin(radians(mp.current_lat))
              )
            ) AS distance_km
     FROM mechanic_profiles mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.verification_status = 'APPROVED'
       AND mp.current_lat IS NOT NULL
       AND (
         6371 * acos(
           cos(radians($1)) * cos(radians(mp.current_lat)) *
           cos(radians(mp.current_lng) - radians($2)) +
           sin(radians($1)) * sin(radians(mp.current_lat))
         )
       ) <= $3
     ORDER BY distance_km ASC
     LIMIT 20`,
    [parseFloat(lat), parseFloat(lng), parseFloat(radius)]
  );

  // Also return mock mechanics if DB is empty (useful during development)
  if (rows.length === 0) {
    return res.json({ mechanics: _getMockMechanics(parseFloat(lat), parseFloat(lng)) });
  }

  res.json({ mechanics: rows });
});

// ── GET /mechanics/:id ────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.profile_photo, u.rating_avg, u.phone,
            u.total_helps, mp.shop_name, mp.specializations,
            mp.is_available, mp.current_lat as lat, mp.current_lng as lng,
            mp.verification_status
     FROM mechanic_profiles mp
     JOIN users u ON u.id = mp.user_id
     WHERE u.id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'MECHANIC_NOT_FOUND' });
  }

  res.json({ mechanic: rows[0] });
});

// ── PUT /mechanics/location ───────────────────────────────────
// Mechanic updates their location (called periodically from app)
router.put('/location', requireAuth, async (req, res) => {
  const { lat, lng, is_available } = req.body;

  await db.query(
    `UPDATE mechanic_profiles
     SET current_lat = $1, current_lng = $2,
         is_available = $3, last_location_at = NOW()
     WHERE user_id = $4`,
    [lat, lng, is_available !== false, req.user.userId]
  );

  res.json({ success: true });
});

// ── Mock data for dev (when DB has no mechanics) ──────────────
function _getMockMechanics(baseLat, baseLng) {
  const names = ['Suresh Auto Works', 'Harjeet Garage', 'Ravi Motors', 'Bajrang Mechanics'];
  return names.map((name, i) => ({
    id: `mock-${i + 1}`,
    name,
    shop_name: name,
    lat: baseLat + (Math.random() - 0.5) * 0.1,
    lng: baseLng + (Math.random() - 0.5) * 0.1,
    rating_avg: (3.5 + Math.random() * 1.5).toFixed(1),
    is_available: true,
    distance_km: (1 + Math.random() * 15).toFixed(1),
    specializations: ['Engine', 'Tyre', 'Battery'],
  }));
}

module.exports = router;
