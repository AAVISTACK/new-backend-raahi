// src/routes/jobs.js
// Flutter screens: request_help_screen.dart, job_offers_screen.dart, active_job_screen.dart
// ApiService methods: createJob(), getMyJobs(), acceptJob()

const router = require('express').Router();
const { requireAuth, requireSubscription } = require('../middleware/auth');
const db = require('../db');
const { v4: uuid } = require('uuid');

// ── POST /jobs — Create help request ─────────────────────────
// requireSubscription blocks unpaid drivers (returns 402)
// Flutter catches ApiException with statusCode 402 → shows subscription screen
router.post('/', requireAuth, requireSubscription, async (req, res) => {
  const {
    problem_type, problem_desc,
    lat, lng, highway_name,
    reward_amount = 0,
  } = req.body;

  if (!problem_type || !lat || !lng) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'problem_type, lat, lng required' });
  }

  const helperOtp = Math.floor(100000 + Math.random() * 900000).toString();

  const { rows } = await db.query(
    `INSERT INTO jobs
       (requester_id, problem_type, problem_desc, req_lat, req_lng,
        highway_name, reward_amount, helper_otp, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
     RETURNING id, status, problem_type, req_lat, req_lng, helper_otp,
               reward_amount, created_at`,
    [req.user.userId, problem_type, problem_desc, lat, lng,
     highway_name, reward_amount, helperOtp]
  );

  res.status(201).json({ job: rows[0] });
});

// ── GET /jobs — Available jobs for helpers/mechanics ─────────
// Flutter: job_offers_screen.dart → ApiService().getMyJobs()
router.get('/', requireAuth, async (req, res) => {
  const { lat, lng, radius = 50 } = req.query; // radius in km

  const { rows } = await db.query(
    `SELECT j.id, j.problem_type, j.problem_desc, j.req_lat, j.req_lng,
            j.highway_name, j.reward_amount, j.status, j.created_at,
            u.name as requester_name, u.vehicle_type, u.vehicle_reg,
            u.rating_avg as requester_rating
     FROM jobs j
     JOIN users u ON u.id = j.requester_id
     WHERE j.status = 'pending'
       AND j.expires_at > NOW()
       AND j.requester_id != $1
     ORDER BY j.created_at DESC
     LIMIT 30`,
    [req.user.userId]
  );

  res.json({ jobs: rows });
});

// ── GET /jobs/my — Requester's own jobs ───────────────────────
router.get('/my', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT j.id, j.problem_type, j.status, j.reward_amount,
            j.req_lat, j.req_lng, j.created_at,
            u.name as helper_name, u.phone as helper_phone,
            u.rating_avg as helper_rating
     FROM jobs j
     LEFT JOIN users u ON u.id = j.helper_id
     WHERE j.requester_id = $1
     ORDER BY j.created_at DESC LIMIT 20`,
    [req.user.userId]
  );

  res.json({ jobs: rows });
});

// ── POST /jobs/:id/accept — Helper accepts job ────────────────
// Flutter: job_offers_screen.dart → ApiService().acceptJob(id)
router.post('/:id/accept', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const helperId = req.user.userId;

  // Check job is still available
  const { rows: check } = await db.query(
    `SELECT id, status, requester_id FROM jobs WHERE id = $1`,
    [jobId]
  );

  if (check.length === 0) {
    return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  }
  if (check[0].status !== 'pending') {
    return res.status(409).json({ error: 'JOB_TAKEN', message: 'Job already taken by someone else' });
  }
  if (check[0].requester_id === helperId) {
    return res.status(400).json({ error: 'SELF_ACCEPT', message: 'Cannot accept your own job' });
  }

  const { rows } = await db.query(
    `UPDATE jobs SET helper_id = $1, status = 'matched', updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING id, status, helper_otp, reward_amount`,
    [helperId, jobId]
  );

  if (rows.length === 0) {
    return res.status(409).json({ error: 'JOB_TAKEN', message: 'Job already taken' });
  }

  res.json({ job: rows[0] });
});

// ── GET /jobs/:id — Job detail ────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT j.*, u.name as requester_name, u.phone as requester_phone,
            h.name as helper_name, h.phone as helper_phone
     FROM jobs j
     JOIN users u ON u.id = j.requester_id
     LEFT JOIN users h ON h.id = j.helper_id
     WHERE j.id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  }

  res.json({ job: rows[0] });
});

// ── POST /jobs/:id/complete ───────────────────────────────────
router.post('/:id/complete', requireAuth, async (req, res) => {
  await db.query(
    `UPDATE jobs SET status = 'completed', updated_at = NOW()
     WHERE id = $1 AND (requester_id = $2 OR helper_id = $2)`,
    [req.params.id, req.user.userId]
  );
  res.json({ success: true });
});

module.exports = router;
