// src/routes/fuel.js
// Flutter screen: fuel_rates_screen.dart

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

// ── GET /fuel-rates ───────────────────────────────────────────
// Static rates — update daily via cron or admin panel
// Production mein: scrape from IOCL or use a fuel price API
router.get('/', requireAuth, (req, res) => {
  const { state = 'Punjab' } = req.query;

  // These are approximate rates — update as needed
  const rates = {
    Punjab:      { petrol: 94.24, diesel: 82.39, cng: 91.50 },
    Haryana:     { petrol: 94.63, diesel: 82.56, cng: 89.20 },
    Delhi:       { petrol: 94.77, diesel: 87.67, cng: 74.09 },
    Maharashtra: { petrol: 104.21, diesel: 90.48, cng: 73.00 },
    Karnataka:   { petrol: 101.94, diesel: 87.89, cng: 78.00 },
    Gujarat:     { petrol: 94.38, diesel: 82.33, cng: 66.00 },
    UP:          { petrol: 94.69, diesel: 87.91, cng: 90.00 },
    Rajasthan:   { petrol: 104.72, diesel: 90.21, cng: 80.00 },
  };

  const stateRates = rates[state] || rates['Punjab'];

  res.json({
    state,
    rates: stateRates,
    updated_at: new Date().toISOString().split('T')[0],
    disclaimer: 'Rates approximate. Check local pump for exact price.',
  });
});

// ── GET /fuel-rates/states ─────────────────────────────────────
router.get('/states', requireAuth, (req, res) => {
  res.json({
    states: ['Punjab', 'Haryana', 'Delhi', 'Maharashtra', 'Karnataka', 'Gujarat', 'UP', 'Rajasthan'],
  });
});

module.exports = router;
