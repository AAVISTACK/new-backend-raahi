// src/server.js
require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initFirebase } = require('./services/firebase');
const { setupWebSocket } = require('./services/websocket');
const db = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
  // 1. Test DB connection
  try {
    await db.query('SELECT 1');
    console.log('[DB] PostgreSQL connected ✓');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    console.error('Set DATABASE_URL in .env and try again');
    process.exit(1);
  }

  // 2. Init Firebase Admin
  initFirebase();

  // 3. Create HTTP server (shared with WebSocket)
  const server = http.createServer(app);

  // 4. Attach WebSocket server
  setupWebSocket(server);

  // 5. Start listening
  server.listen(PORT, () => {
    console.log(`\n🚀 Raahi Backend v2.1 running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api/v1`);
    console.log(`   WS:     ws://localhost:${PORT}/ws`);
    console.log(`   Env:    ${process.env.NODE_ENV || 'development'}\n`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Server] Shutting down gracefully...');
    server.close(() => {
      db.pool.end();
      process.exit(0);
    });
  });
}

start().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
