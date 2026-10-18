-- One deduction and one true-up per commitment period.
-- A repeated insert does nothing, so a second request cannot drain the reserve again.
-- Keep the earliest row when a period was recorded more than once, so the index can be created.

DELETE FROM events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY type, commitment_id, reason
             ORDER BY created_at, id
           ) AS n
    FROM events
    WHERE type IN ('commitment_deduction', 'commitment_true_up')
      AND commitment_id IS NOT NULL
      AND reason IS NOT NULL
  ) ranked
  WHERE n > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS events_period_deduction
  ON events (commitment_id, reason)
  WHERE type = 'commitment_deduction' AND reason IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS events_period_true_up
  ON events (commitment_id, reason)
  WHERE type = 'commitment_true_up' AND reason IS NOT NULL;
