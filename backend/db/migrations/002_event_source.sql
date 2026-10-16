-- Inflow origin. A source is a name the user keeps, not a stock.
-- Existing money_added rows have no source.

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name text NOT NULL
);

CREATE INDEX IF NOT EXISTS sources_owner_idx ON sources (owner_user_id);

ALTER TABLE events ADD COLUMN IF NOT EXISTS source text;
