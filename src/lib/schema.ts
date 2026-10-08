// Additive PostgreSQL schema; kept in the server bundle for standalone deployment.
export const schema = `
CREATE TABLE IF NOT EXISTS profile (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'Faculty' CHECK (role IN ('Student','Faculty','Researcher','Staff')),
  institution VARCHAR(120) NOT NULL DEFAULT '',
  country VARCHAR(2) NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  default_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6-free',
  default_reasoning TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subscription (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free','pro')),
  status TEXT NOT NULL CHECK (status IN ('active','expired','cancelled')),
  current_period_end TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payment_request (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'pro' CHECK (plan = 'pro'),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD','EUR','MGA')),
  method TEXT NOT NULL CHECK (method IN ('mobile_money','card')),
  reference VARCHAR(120) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  note VARCHAR(500) NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_one_pending ON payment_request(user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS payment_unique_reference ON payment_request(method, lower(reference));
CREATE TABLE IF NOT EXISTS subscription_event (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('approve','extend','cancel')),
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS assistant_rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  window_start BIGINT NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0)
);
`;
