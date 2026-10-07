import { createPrivateKey } from 'node:crypto';
import { Apple, Google, Twitter, decodeIdToken, generateCodeVerifier } from 'arctic';
import { oauthState } from './session';

export const providers = ['google', 'apple', 'x'] as const;
export type OAuthProvider = (typeof providers)[number];

export function isProvider(value: string): value is OAuthProvider {
  return (providers as readonly string[]).includes(value);
}

function origin(): string {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error('APP_ORIGIN is not set');
  return value.replace(/\/$/, '');
}

export function callbackUrl(provider: OAuthProvider): string {
  return `${origin()}/api/auth/callback/${provider}`;
}

export function appHome(): string {
  return `${origin()}/`;
}

function pemToPkcs8(pem: string): Uint8Array {
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  const exported = createPrivateKey(normalized).export({ type: 'pkcs8', format: 'der' });
  return new Uint8Array(exported);
}

export function providerConfigured(provider: OAuthProvider): boolean {
  if (provider === 'google') return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (provider === 'x') return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
  return Boolean(
    process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY,
  );
}

export function authorization(provider: OAuthProvider): { url: URL; state: string; verifier: string } {
  const verifier = generateCodeVerifier();
  const state = oauthState({ verifier, provider });
  if (provider === 'google') {
    const google = new Google(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, callbackUrl(provider));
    return {
      url: google.createAuthorizationURL(state, verifier, ['openid', 'email', 'profile']),
      state,
      verifier,
    };
  }
  if (provider === 'x') {
    const twitter = new Twitter(process.env.X_CLIENT_ID!, process.env.X_CLIENT_SECRET!, callbackUrl(provider));
    return {
      url: twitter.createAuthorizationURL(state, verifier, ['users.read', 'users.email', 'tweet.read']),
      state,
      verifier,
    };
  }
  const apple = new Apple(
    process.env.APPLE_CLIENT_ID!,
    process.env.APPLE_TEAM_ID!,
    process.env.APPLE_KEY_ID!,
    pemToPkcs8(process.env.APPLE_PRIVATE_KEY!),
    callbackUrl(provider),
  );
  const url = apple.createAuthorizationURL(state, ['name', 'email']);
  url.searchParams.set('response_mode', 'form_post');
  return { url, state, verifier };
}

export async function profileFromCode(
  provider: OAuthProvider,
  code: string,
  verifier: string,
  appleUser: string | null,
): Promise<{ providerAccountId: string; email: string | null; name: string | null }> {
  if (provider === 'google') {
    const google = new Google(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, callbackUrl(provider));
    const tokens = await google.validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as { sub?: string; email?: string; name?: string };
    if (!claims.sub) throw new Error('Google did not return an account id');
    return { providerAccountId: claims.sub, email: claims.email ?? null, name: claims.name ?? null };
  }
  if (provider === 'x') {
    const twitter = new Twitter(process.env.X_CLIENT_ID!, process.env.X_CLIENT_SECRET!, callbackUrl(provider));
    const tokens = await twitter.validateAuthorizationCode(code, verifier);
    const response = await fetch('https://api.twitter.com/2/users/me?user.fields=id,name,username,confirmed_email', {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    if (!response.ok) throw new Error('X did not return a profile');
    const body = (await response.json()) as {
      data?: { id?: string; name?: string; username?: string; confirmed_email?: string };
    };
    if (!body.data?.id) throw new Error('X did not return an account id');
    return {
      providerAccountId: body.data.id,
      email: body.data.confirmed_email ?? null,
      name: body.data.name || body.data.username || null,
    };
  }
  const apple = new Apple(
    process.env.APPLE_CLIENT_ID!,
    process.env.APPLE_TEAM_ID!,
    process.env.APPLE_KEY_ID!,
    pemToPkcs8(process.env.APPLE_PRIVATE_KEY!),
    callbackUrl(provider),
  );
  const tokens = await apple.validateAuthorizationCode(code);
  const claims = decodeIdToken(tokens.idToken()) as { sub?: string; email?: string };
  if (!claims.sub) throw new Error('Apple did not return an account id');
  let name: string | null = null;
  if (appleUser) {
    try {
      const parsed = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } };
      name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(' ') || null;
    } catch {
      name = null;
    }
  }
  return { providerAccountId: claims.sub, email: claims.email ?? null, name };
}
