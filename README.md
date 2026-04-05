# Raahi Backend v2.1

Node.js + PostgreSQL backend for **Raahi Driver Super App**

## API Endpoints (Flutter ke saath exact match)

| Flutter Call | Endpoint | Auth |
|---|---|---|
| `_verifyWithBackend()` | `POST /api/v1/auth/verify-firebase` | Firebase token |
| `_restoreSession()` | `GET /api/v1/auth/me` | Bearer |
| `ApiService().get('/daily/streak')` | `GET /api/v1/daily/streak` | Bearer |
| `ApiService().post('/daily/streak/checkin')` | `POST /api/v1/daily/streak/checkin` | Bearer |
| `ApiService().get('/daily/alerts')` | `GET /api/v1/daily/alerts` | Bearer |
| `ApiService().post('/ai/chat')` | `POST /api/v1/ai/chat` | Bearer |
| `ApiService().getNearbyMechanics()` | `GET /api/v1/mechanics/nearby` | Bearer |
| `ApiService().createJob()` | `POST /api/v1/jobs` | Bearer + Subscription |
| `ApiService().getMyJobs()` | `GET /api/v1/jobs` | Bearer |
| `ApiService().acceptJob(id)` | `POST /api/v1/jobs/:id/accept` | Bearer |
| `ApiService().triggerSos()` | `POST /api/v1/sos/trigger` | Bearer |
| `GET /dashboard` | `GET /api/v1/dashboard` | Bearer |
| `GET /fuel-rates` | `GET /api/v1/fuel-rates` | Bearer |
| Admin selfie review | `GET/PUT /api/v1/admin/selfies` | x-admin-secret |

## Railway Deployment (Recommended)

### Step 1 — Railway pe project banao
1. railway.app → New Project → Deploy from GitHub
2. `raahi-backend` repo select karo
3. Add Plugin → PostgreSQL (auto milega `DATABASE_URL`)

### Step 2 — Environment Variables set karo
Railway dashboard → Variables tab mein yeh sab daalo:

```
NODE_ENV=production
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GEMINI_API_KEY=your-gemini-key
ADMIN_SECRET=raahi_admin_secret_2024
JWT_SECRET=your-64-char-secret
ALLOWED_ORIGINS=https://raahi.in
```

### Step 3 — Database migrate karo
Railway dashboard → PostgreSQL plugin → Query tab mein paste karo:
```
[content of migrations/001_schema.sql]
```

### Step 4 — Flutter mein URL update karo
`lib/utils/constants.dart` mein:
```dart
static const String baseUrl = 'https://YOUR-RAILWAY-URL.up.railway.app/api/v1';
static const String wsUrl   = 'wss://YOUR-RAILWAY-URL.up.railway.app';
```

## Local Development

```bash
npm install
cp .env.example .env
# Fill .env values

# Create local DB
createdb raahi_db
psql raahi_db < migrations/001_schema.sql

npm run dev
```

## Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+
- **Auth**: Firebase Admin SDK
- **AI**: Google Gemini 1.5 Flash
- **Real-time**: WebSocket (ws)
- **Security**: Helmet, CORS, Rate Limiting
