-- Initial QuestLedger schema. Safe to retry: every object uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  name text,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  xp numeric NOT NULL DEFAULT 0,
  unallocated numeric(14, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS profile_owner_idx ON profile (owner_user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name text NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_owner_idx ON accounts (owner_user_id);

CREATE TABLE IF NOT EXISTS buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name text NOT NULL
);

CREATE INDEX IF NOT EXISTS buckets_owner_idx ON buckets (owner_user_id);

CREATE TABLE IF NOT EXISTS commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  frequency text NOT NULL,
  due_day integer,
  kind text NOT NULL,
  bucket text NOT NULL,
  account text,
  active boolean NOT NULL DEFAULT true,
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  next_due_at timestamptz,
  pending_amount numeric(14, 2),
  pending_frequency text,
  funding_migrated boolean,
  archived boolean
);

CREATE INDEX IF NOT EXISTS commitments_owner_idx ON commitments (owner_user_id);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name text NOT NULL,
  target numeric(14, 2) NOT NULL DEFAULT 0,
  saved numeric(14, 2) NOT NULL DEFAULT 0,
  spent numeric(14, 2) NOT NULL DEFAULT 0,
  bucket text NOT NULL DEFAULT '',
  account text,
  deadline text,
  status text NOT NULL DEFAULT 'active',
  kind text NOT NULL DEFAULT 'goal',
  commitment_id uuid REFERENCES commitments (id) ON DELETE RESTRICT,
  period_key text,
  period_status text,
  archived boolean
);

CREATE INDEX IF NOT EXISTS goals_owner_idx ON goals (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS goals_period_unique
  ON goals (commitment_id, period_key)
  WHERE commitment_id IS NOT NULL AND period_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  type text NOT NULL,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  from_ref text,
  to_ref text,
  goal_id uuid,
  commitment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  location text
);

CREATE INDEX IF NOT EXISTS events_owner_idx ON events (owner_user_id);
