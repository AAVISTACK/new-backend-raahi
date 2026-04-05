// src/app.js
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────
// Fix: Was cors() with no config — accepted ALL origins
// Flutter mobile sends no Origin header — must allow that too
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Flutter mobile app has no Origin header — allow it
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true); // dev mode
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} not allowed`));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'x-platform', 'x-app-version'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 86400, // Cache preflight 24h — removes OPTIONS overhead on each request
}));

// ── Body Parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests, slow down' },
});
app.use('/api/', limiter);

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.1.0', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/v1/auth',      require('./routes/auth'));
app.use('/api/v1/ai',        require('./routes/ai'));
app.use('/api/v1/daily',     require('./routes/daily'));
app.use('/api/v1/jobs',      require('./routes/jobs'));
app.use('/api/v1/mechanics', require('./routes/mechanics'));
app.use('/api/v1/sos',       require('./routes/sos'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/fuel-rates',require('./routes/fuel'));
app.use('/api/v1/admin',     require('./routes/admin'));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', path: req.path });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);

  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS_ERROR', message: err.message });
  }

  res.status(500).json({
    error: 'SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

module.exports = app;
