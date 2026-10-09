import { compare, hash } from 'bcryptjs';
import { query } from '../db/client.js';

export type AccountUser = { id: string; email: string | null; name: string | null };

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ROUNDS);
}

export async function checkPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export function publicUser(user: AccountUser) {
  return { id: user.id, email: user.email || undefined, name: user.name || undefined };
}

export async function findUserByEmail(email: string): Promise<(AccountUser & { passwordHash: string | null }) | null> {
  const rows = await query<{ id: string; email: string | null; name: string | null; password_hash: string | null }>(
    'SELECT id, email, name, password_hash FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash };
}

export async function findUserById(id: string): Promise<AccountUser | null> {
  const rows = await query<AccountUser>('SELECT id, email, name FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createPasswordUser(email: string, name: string, password: string): Promise<AccountUser> {
  const passwordHash = await hashPassword(password);
  const rows = await query<AccountUser>(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email.toLowerCase(), name || email, passwordHash],
  );
  return rows[0];
}

/** Find the OAuth account, or attach it to the email's user, or create a user. */
export async function upsertOAuthUser(input: {
  provider: string;
  providerAccountId: string;
  email: string | null;
  name: string | null;
}): Promise<AccountUser> {
  const linked = await query<AccountUser>(
    `SELECT u.id, u.email, u.name
     FROM oauth_accounts a JOIN users u ON u.id = a.user_id
     WHERE a.provider = $1 AND a.provider_account_id = $2`,
    [input.provider, input.providerAccountId],
  );
  if (linked[0]) return linked[0];

  let user: AccountUser | null = null;
  if (input.email) user = await findUserByEmail(input.email);
  if (!user) {
    const rows = await query<AccountUser>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name',
      [input.email?.toLowerCase() ?? null, input.name],
    );
    user = rows[0];
  } else if (input.name && !user.name) {
    await query('UPDATE users SET name = $2 WHERE id = $1', [user.id, input.name]);
    user = { ...user, name: input.name };
  }

  await query(
    'INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES ($1, $2, $3)',
    [user.id, input.provider, input.providerAccountId],
  );
  return user;
}
