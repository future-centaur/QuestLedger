import { createLedger } from '../domain/ledger';
import type { CronEvent } from '../domain/ledger';
import type { Outcome } from '../domain/outcome';
import { transaction } from '../db/client';
import { ensureMigrated } from '../db/migrate';
import { neonStore } from '../store.neon';
import {
  checkPassword,
  createPasswordUser,
  findUserByEmail,
  findUserById,
  publicUser,
  upsertOAuthUser,
} from '../auth/users';
import { appHome, authorization, isProvider, profileFromCode, providerConfigured } from '../auth/oauth';
import { clearSessionCookie, readOAuthState, readSession, sessionCookie } from '../auth/session';

const ledger = createLedger(neonStore);

const commands = {
  'POST /api/money': (uid: string, body: unknown) => ledger.addMoney(uid, body),
  'POST /api/goals': (uid: string, body: unknown) => ledger.createGoal(uid, body),
  'POST /api/goals/update': (uid: string, body: unknown) => ledger.updateGoal(uid, body),
  'POST /api/goals/adjust-target': (uid: string, body: unknown) => ledger.adjustTarget(uid, body),
  'POST /api/goals/archive': (uid: string, body: unknown) => ledger.archiveGoal(uid, body),
  'POST /api/contributions': (uid: string, body: unknown) => ledger.contribute(uid, body),
  'POST /api/commitments': (uid: string, body: unknown) => ledger.createCommitment(uid, body),
  'POST /api/commitments/topup': (uid: string, body: unknown) => ledger.topUpCommitment(uid, body),
  'POST /api/commitments/spend': (uid: string, body: unknown) => ledger.spendCommitment(uid, body),
  'POST /api/commitments/rebalance': (uid: string, body: unknown) => ledger.rebalanceCommitment(uid, body),
  'POST /api/commitments/toggle': (uid: string, body: unknown) => ledger.toggleCommitment(uid, body),
  'POST /api/commitments/adjust': (uid: string, body: unknown) => ledger.adjustCommitment(uid, body),
  'POST /api/commitments/update': (uid: string, body: unknown) => ledger.updateCommitment(uid, body),
  'POST /api/commitments/archive': (uid: string, body: unknown) => ledger.archiveCommitment(uid, body),
  'POST /api/complete': (uid: string, body: unknown) => ledger.completeGoal(uid, body),
  'POST /api/spend': (uid: string, body: unknown) => ledger.spendGoal(uid, body),
  'POST /api/rebalance': (uid: string, body: unknown) => ledger.rebalance(uid, body),
  'POST /api/accounts': (uid: string, body: unknown) => ledger.addAccount(uid, body),
  'POST /api/buckets': (uid: string, body: unknown) => ledger.addBucket(uid, body),
} as Record<string, (uid: string, body: unknown) => Promise<Outcome<unknown>>>;

function json(body: unknown, status = 200, extra: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of extra) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function allowOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  const allowed = process.env.APP_ORIGIN?.replace(/\/$/, '');
  if (origin && allowed && origin === allowed) return origin;
  return null;
}

function withCors(request: Request, response: Response): Response {
  const origin = allowOrigin(request);
  if (!origin) return response;
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') headers.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie?.() ?? []) headers.append('set-cookie', cookie);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('vary', 'origin');
  return new Response(response.body, { status: response.status, headers });
}

async function readBody(request: Request): Promise<{ json: Record<string, unknown>; form: URLSearchParams }> {
  const type = request.headers.get('content-type') || '';
  const raw = await request.text();
  if (type.includes('application/json') && raw) {
    return { json: JSON.parse(raw) as Record<string, unknown>, form: new URLSearchParams() };
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { json: {}, form: new URLSearchParams(raw) };
  }
  return { json: {}, form: new URLSearchParams() };
}

function emailOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.includes('@') && email.length <= 320 ? email : null;
}

function passwordOf(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) return null;
  return value;
}

async function userId(request: Request): Promise<string | null> {
  const session = readSession(request.headers.get('cookie'));
  if (!session?.uid) return null;
  const user = await findUserById(session.uid);
  return user?.id ?? null;
}

export async function runCommitments() {
  const event: CronEvent = {
    type: 'cron',
    name: 'process-commitments',
    invocationId: crypto.randomUUID(),
    scheduledTime: new Date().toISOString(),
  };
  return transaction(() => ledger.processCommitments(event));
}

async function authRoutes(request: Request, path: string): Promise<Response> {
  if (path === '/api/auth/session' && request.method === 'GET') {
    const id = await userId(request);
    const user = id ? await findUserById(id) : null;
    return json({ user: user ? publicUser(user) : null });
  }

  if (path === '/api/auth/signup' && request.method === 'POST') {
    const { json: body } = await readBody(request);
    const email = emailOf(body.email);
    const password = passwordOf(body.password);
    if (!email || !password) return json({ message: 'Use a valid email and a password of at least 8 characters' }, 400);
    try {
      const user = await transaction(() =>
        createPasswordUser(email, typeof body.name === 'string' ? body.name.trim() : '', password),
      );
      return json({ user: publicUser(user) }, 200, [sessionCookie(user.id)]);
    } catch (error) {
      if (isUnique(error)) return json({ message: 'An account with that email already exists' }, 400);
      throw error;
    }
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    const { json: body } = await readBody(request);
    const email = emailOf(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return json({ message: 'Email and password are required' }, 400);
    const user = await findUserByEmail(email);
    if (!user?.passwordHash || !(await checkPassword(password, user.passwordHash))) {
      return json({ message: 'Email or password is wrong' }, 400);
    }
    return json({ user: publicUser(user) }, 200, [sessionCookie(user.id)]);
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, [clearSessionCookie()]);
  }

  const start = path.match(/^\/api\/auth\/(google|apple|x)$/);
  if (start && request.method === 'GET') {
    const provider = start[1];
    if (!isProvider(provider) || !providerConfigured(provider)) {
      return json({ message: `${provider} sign-in is not configured` }, 503);
    }
    const flow = authorization(provider);
    return redirect(flow.url.toString());
  }

  const callback = path.match(/^\/api\/auth\/callback\/(google|apple|x)$/);
  if (callback && (request.method === 'GET' || request.method === 'POST')) {
    const provider = callback[1];
    const url = new URL(request.url);
    const { form } = request.method === 'POST' ? await readBody(request) : { form: url.searchParams };
    const code = form.get('code') || url.searchParams.get('code');
    const state = form.get('state') || url.searchParams.get('state');
    const pending = readOAuthState(state);
    const appleUser = form.get('user');
    if (!isProvider(provider) || !pending || pending.provider !== provider || !code) {
      return redirect(`${appHome()}?auth_error=${encodeURIComponent('Sign-in was cancelled.')}`);
    }
    try {
      const profile = await profileFromCode(provider, code, pending.verifier, appleUser);
      const user = await transaction(() =>
        upsertOAuthUser({
          provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
          name: profile.name,
        }),
      );
      return redirect(appHome(), [sessionCookie(user.id)]);
    } catch (error) {
      console.error(error);
      return redirect(`${appHome()}?auth_error=${encodeURIComponent('Could not sign in.')}`);
    }
  }

  return json({ message: 'Not found' }, 404);
}

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function handleRequest(request: Request): Promise<Response> {
  await ensureMigrated();
  if (request.method === 'OPTIONS') {
    const origin = allowOrigin(request);
    const headers = new Headers();
    if (origin) {
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-credentials', 'true');
      headers.set('access-control-allow-headers', 'content-type, authorization');
      headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    return new Response(null, { status: 204, headers });
  }

  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  try {
    let response: Response;
    if (path.startsWith('/api/auth')) response = await authRoutes(request, path);
    else if (path === '/api/cron/commitments' && (request.method === 'GET' || request.method === 'POST')) {
      if (!cronAuthorized(request)) response = json({ message: 'Unauthorized' }, 401);
      else response = json(await runCommitments());
    } else if (path === '/api/state' && request.method === 'GET') {
      const uid = await userId(request);
      if (!uid) response = json({ message: 'Sign in required' }, 401);
      else response = json(await transaction(() => ledger.getState(uid)));
    } else {
      const command = commands[`${request.method} ${path}` as keyof typeof commands];
      if (!command) response = json({ message: 'Not found' }, 404);
      else {
        const uid = await userId(request);
        if (!uid) response = json({ message: 'Sign in required' }, 401);
        else {
          const { json: body } = await readBody(request);
          const outcome = await transaction(() => command(uid, body));
          response = outcome.ok ? json(outcome.data) : json({ message: outcome.message }, outcome.status);
        }
      }
    }
    return withCors(request, response);
  } catch (error) {
    console.error(error);
    return withCors(request, json({ message: 'Server error' }, 500));
  }
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}
