-- Raahi Database Schema v2.1
-- Run: psql $DATABASE_URL -f migrations/001_schema.sql
-- OR on Railway: paste in Query tab

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid    VARCHAR(128) UNIQUE NOT NULL,
  phone           VARCHAR(15)  UNIQUE,
  email           VARCHAR(255) UNIQUE,
  name            VARCHAR(100),
  profile_photo   TEXT,
  vehicle_type    VARCHAR(50)  DEFAULT 'car',
  vehicle_reg     VARCHAR(20),
  role            VARCHAR(20)  DEFAULT 'DRIVER' CHECK (role IN ('DRIVER','MECHANIC','HELPER','ADMIN')),
  rating_avg      DECIMAL(3,2) DEFAULT 0.00,
  total_helps     INT          DEFAULT 0,
  wallet_balance  DECIMAL(10,2) DEFAULT 0.00,
  language        VARCHAR(5)   DEFAULT 'hi',
  is_verified     BOOLEAN      DEFAULT false,
  status          VARCHAR(20)  DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  last_seen_at    TIMESTAMP,
  created_at      TIMESTAMP    DEFAULT NOW(),
  updated_at      TIMESTAMP    DEFAULT NOW()
);

-- ─── Subscriptions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier        VARCHAR(20) DEFAULT 'NONE' CHECK (tier IN ('NONE','BASIC','PRO')),
  status      VARCHAR(20) DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','EXPIRED','TRIAL')),
  expires_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Jobs (P2P Help Requests) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES users(id),
  helper_id     UUID REFERENCES users(id),
  status        VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','matched','in_progress','completed','cancelled')),
  problem_type  VARCHAR(50) NOT NULL,
  problem_desc  TEXT,
  req_lat       DECIMAL(10,7) NOT NULL,
  req_lng       DECIMAL(10,7) NOT NULL,
  highway_name  VARCHAR(100),
  reward_amount DECIMAL(8,2) DEFAULT 0.00,
  helper_otp    VARCHAR(6),
  expires_at    TIMESTAMP DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ─── Mechanic Profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mechanic_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_name           VARCHAR(100),
  specializations     TEXT[],
  verification_status VARCHAR(20) DEFAULT 'PENDING'
                        CHECK (verification_status IN ('PENDING','APPROVED','REJECTED')),
  is_available        BOOLEAN DEFAULT true,
  current_lat         DECIMAL(10,7),
  current_lng         DECIMAL(10,7),
  last_location_at    TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─── Daily Streaks ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_streaks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak  INT DEFAULT 0,
  longest_streak  INT DEFAULT 0,
  total_checkins  INT DEFAULT 0,
  last_checkin    DATE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── AI Chat Sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(20) CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Highway Alerts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS highway_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(50) NOT NULL,
  message     TEXT NOT NULL,
  location    VARCHAR(200),
  lat         DECIMAL(10,7),
  lng         DECIMAL(10,7),
  upvotes     INT DEFAULT 0,
  downvotes   INT DEFAULT 0,
  expires_at  TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── SOS Events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','resolved')),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Selfie Verifications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS selfie_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selfie_url  TEXT,
  score       INT DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_requester ON jobs(requester_id);
CREATE INDEX IF NOT EXISTS idx_mechanic_available ON mechanic_profiles(is_available);
CREATE INDEX IF NOT EXISTS idx_alerts_expires ON highway_alerts(expires_at);

-- ─── Auto-update updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
