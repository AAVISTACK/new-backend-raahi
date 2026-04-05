// src/routes/ai.js
// Flutter screen: ai_mechanic_screen.dart
// POST /api/v1/ai/chat  — also accepts direct Gemini calls from Flutter
// Token explosion fix: only last 4 messages sent to Gemini

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const axios = require('axios');

const CONTEXT_LIMIT = 4; // Last 4 messages — strict token budget to prevent API errors

// ── POST /ai/chat ─────────────────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const { message, session_id, vehicle_type, vehicle_reg } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'MISSING_MESSAGE' });
  }

  const userId = req.user.userId;

  // Get or create session
  let sessionId = session_id;
  if (!sessionId) {
    const { rows } = await db.query(
      `INSERT INTO ai_sessions (user_id, title) VALUES ($1, $2) RETURNING id`,
      [userId, message.slice(0, 60)]
    );
    sessionId = rows[0].id;
  }

  // Save user message
  await db.query(
    `INSERT INTO ai_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, message]
  );

  // Get LAST 4 messages only — strict token budget
  const { rows: recentMessages } = await db.query(
    `SELECT role, content FROM ai_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, CONTEXT_LIMIT]
  );

  // Reverse to chronological order
  const history = recentMessages.reverse();

  // Build Gemini prompt
  const systemPrompt = `You are an expert AI Mechanic assistant for Indian highway drivers.
Vehicle: ${vehicle_type || 'car'} ${vehicle_reg ? `(${vehicle_reg})` : ''}
Language: Mix Hindi and English naturally (Hinglish). Keep responses concise.
Focus on practical, actionable advice for roadside problems.
If the problem is dangerous, always suggest calling emergency services first.`;

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Bilkul! Main aapki gaadi ki problem solve karne mein help karunga. Batao kya problem hai?' }] },
    ...history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
  ];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(503).json({ error: 'AI_NOT_CONFIGURED', message: 'Gemini API key missing' });
  }

  let aiReply;
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      { contents, generationConfig: { maxOutputTokens: 600, temperature: 0.7 } },
      { timeout: 30000 }
    );

    aiReply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiReply) throw new Error('Empty response from Gemini');
  } catch (err) {
    if (err.response?.status === 429) {
      return res.status(503).json({ error: 'AI_RATE_LIMITED', message: 'AI busy, thodi der mein try karo' });
    }
    if (err.response?.status === 400) {
      return res.status(422).json({
        error: 'CONTEXT_TOO_LONG',
        message: 'Naya conversation shuru karo',
        suggestion: 'new_session',
      });
    }
    console.error('[AI] Gemini error:', err.message);
    return res.status(500).json({ error: 'AI_ERROR', message: 'AI unavailable, baad mein try karo' });
  }

  // Save assistant reply
  await db.query(
    `INSERT INTO ai_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
    [sessionId, aiReply]
  );

  res.json({ reply: aiReply, session_id: sessionId });
});

// ── GET /ai/sessions ──────────────────────────────────────────
router.get('/sessions', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, title, created_at FROM ai_sessions
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.userId]
  );
  res.json({ sessions: rows });
});

module.exports = router;
