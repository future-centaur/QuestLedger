import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

test('two concurrent deltas cannot both take the same cents', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not set');
    return;
  }
  const { query } = await import('./db/client.ts');
  const { neonStore } = await import('./store.neon.ts');
  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  try {
    await query(`INSERT INTO users (id, email) VALUES ($1::uuid, $2)`, [userId, `race-${userId}@example.com`]);
    await query(
      `INSERT INTO profile (id, owner_user_id, xp, unallocated) VALUES ($1::uuid, $2::uuid, 0, 1.50)`,
      [profileId, userId],
    );
    const results = await Promise.all([
      neonStore.moveStock({ table: 'profile', id: profileId, ownerUserId: userId, deltaCents: -100 }),
      neonStore.moveStock({ table: 'profile', id: profileId, ownerUserId: userId, deltaCents: -100 }),
    ]);
    assert.equal(results.filter((row) => row !== null).length, 1);
    const rows = await query<{ unallocated: string }>(
      `SELECT unallocated::text AS unallocated FROM profile WHERE id = $1::uuid`,
      [profileId],
    );
    assert.equal(rows[0]?.unallocated, '0.50');
  } finally {
    await query(`DELETE FROM profile WHERE id = $1::uuid`, [profileId]).catch(() => undefined);
    await query(`DELETE FROM users WHERE id = $1::uuid`, [userId]).catch(() => undefined);
  }
});
