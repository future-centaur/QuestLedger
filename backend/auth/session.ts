import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION = 'ql_session';
const WEEK = 60 * 60 * 24 * 14;

export type SessionPayload = { uid: string; exp: number };
export type OAuthPayload = { verifier: string; provider: string; exp: number };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return value;
}

export function secureCookie(): boolean {
  return (process.env.APP_ORIGIN || '').startsWith('https://');
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function read<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp?: number };
  if (data.exp && Date.now() > data.exp) return null;
  return data;
}

export function cookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function setCookie(name: string, value: string, maxAge: number): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secureCookie()) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookie(userId: string): string {
  const token = sign({ uid: userId, exp: Date.now() + WEEK * 1000 });
  return setCookie(SESSION, token, WEEK);
}

export function clearSessionCookie(): string {
  return setCookie(SESSION, '', 0);
}

export function readSession(header: string | null): SessionPayload | null {
  return read<SessionPayload>(cookieHeader(header, SESSION));
}

/** Signed value echoed by the provider, so the callback does not depend on a cookie. */
export function oauthState(payload: Omit<OAuthPayload, 'exp'>): string {
  return sign({ ...payload, exp: Date.now() + 10 * 60 * 1000 });
}

export function readOAuthState(state: string | null): OAuthPayload | null {
  if (!state) return null;
  return read<OAuthPayload>(state);
}
