-- One deduction and one true-up per commitment period.
-- A repeated insert does nothing, so a second request cannot drain the reserve again.

CREATE UNIQUE INDEX IF NOT EXISTS events_period_deduction
  ON events (commitment_id, reason)
  WHERE type = 'commitment_deduction' AND reason IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS events_period_true_up
  ON events (commitment_id, reason)
  WHERE type = 'commitment_true_up' AND reason IS NOT NULL;
