// src/services/websocket.js
// Flutter: socket_service.dart connects here
// Events match exactly what Flutter expects:
//   Client emits:  driver:ping, job:location_update
//   Server emits:  job:new_request, job:status_change, job:helper_location, job:taken, sos:nearby_alert

const WebSocket = require('ws');

// Connected clients: userId → ws
const clients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Extract userId from query param: ws://host/ws?userId=xxx
    const url = new URL(req.url, 'http://localhost');
    const userId = url.searchParams.get('userId');

    if (userId) {
      clients.set(userId, ws);
      console.log(`[WS] Connected: ${userId} (${clients.size} total)`);
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(userId, msg, ws);
      } catch (e) {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (userId) clients.delete(userId);
      console.log(`[WS] Disconnected: ${userId}`);
    });

    ws.on('error', () => {
      if (userId) clients.delete(userId);
    });

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Ping all clients every 30s to detect dead connections
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log('[WS] WebSocket server ready');
  return wss;
}

function handleMessage(userId, msg, ws) {
  switch (msg.event) {
    case 'driver:ping':
      // Store location in memory (or DB for persistence)
      // Broadcast to any helpers watching this driver
      break;

    case 'job:location_update': {
      // Helper is moving — notify the requester
      const { job_id, lat, lng } = msg.data || {};
      // In production: lookup requester_id from DB
      // For now: broadcast to all (filter by job in production)
      broadcastToAll('job:helper_location', { job_id, lat, lng, userId });
      break;
    }

    default:
      break;
  }
}

// Send event to a specific user
function sendToUser(userId, event, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
    return true;
  }
  return false;
}

// Broadcast to all connected clients
function broadcastToAll(event, data) {
  const msg = JSON.stringify({ event, data });
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// Notify specific users (array of userIds)
function notifyUsers(userIds, event, data) {
  userIds.forEach((id) => sendToUser(id, event, data));
}

module.exports = { setupWebSocket, sendToUser, broadcastToAll, notifyUsers };
