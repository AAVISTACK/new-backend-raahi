// src/services/firebase.js
const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn('[Firebase] Keys missing — auth routes will not work');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Railway env vars encode \n as literal \\n — fix it
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  initialized = true;
  console.log('[Firebase] Admin SDK initialized ✓');
}

module.exports = { admin, initFirebase };
