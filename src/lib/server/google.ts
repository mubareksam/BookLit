import crypto from 'crypto';

/**
 * Google Sign-In (OAuth 2.0 authorization-code flow with an OpenID Connect
 * ID token). Implemented with Node's crypto + fetch so the app needs no extra
 * dependency, and the ID token signature is verified against Google's JWKS —
 * the token is never trusted just because it arrived from the browser.
 */

const AUTH_ENDPOINT = process.env.GOOGLE_AUTH_ENDPOINT || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = process.env.GOOGLE_TOKEN_ENDPOINT || 'https://oauth2.googleapis.com/token';
const JWKS_ENDPOINT = process.env.GOOGLE_JWKS_ENDPOINT || 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = [process.env.GOOGLE_ISSUER || 'https://accounts.google.com', 'accounts.google.com'];

export const OAUTH_STATE_COOKIE = 'booklit_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  configured: boolean;
}

export function googleConfig(): GoogleConfig {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

function authSecret(): string {
  return (
    process.env.BOOKLIT_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    'booklit-production-hmac-key-v2-change-in-env'
  );
}

function signValue(value: string): string {
  return crypto.createHmac('sha256', authSecret()).update(value).digest('base64url');
}

/** Signed, expiring OAuth `state` — protects the flow from CSRF/replay. */
export function createOAuthState(nextPath: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      n: crypto.randomBytes(16).toString('base64url'),
      next: sanitizeNext(nextPath),
      iat: Date.now(),
    })
  ).toString('base64url');
  return `${payload}.${signValue(payload)}`;
}

export function verifyOAuthState(state: string | null | undefined): { next: string } | null {
  if (!state || !state.includes('.')) return null;
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return null;

  const expected = signValue(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      next?: string;
      iat?: number;
    };
    if (!parsed.iat || Date.now() - parsed.iat > STATE_TTL_MS) return null;
    return { next: sanitizeNext(parsed.next ?? '/') };
  } catch {
    return null;
  }
}

export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next.slice(0, 300);
}

/** Public origin of the request, honouring the proxy headers of hosted deploys. */
export function resolveOrigin(req: { headers: Headers; url: string }): string {
  const proto =
    req.headers.get('x-forwarded-proto') ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const origin = host ? `${proto.split(',')[0]}://${host.split(',')[0]}` : new URL(req.url).origin;
  return origin.replace(/\/$/, '');
}

export function getRedirectUri(req: { headers: Headers; url: string }): string {
  const override = (process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (override) return override;
  return `${resolveOrigin(req)}/api/auth/google/callback`;
}

export function buildAuthorizeUrl(params: { redirectUri: string; state: string; loginHint?: string }): string {
  const { clientId } = googleConfig();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);
  return url.toString();
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName?: string;
  picture?: string;
}

/** Exchange the authorization code for tokens (server-to-server). */
export async function exchangeCodeForIdToken(params: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const { clientId, clientSecret } = googleConfig();
  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(12_000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.id_token) {
    throw new Error(
      `Google token exchange failed: ${data.error_description || data.error || res.status}`
    );
  }
  return data.id_token;
}

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  n?: string;
  e?: string;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getGoogleKeys(forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(JWKS_ENDPOINT, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Could not load Google signing keys (${res.status})`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function verifyRs256(signingInput: string, signature: Buffer, jwk: Jwk): boolean {
  const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  return crypto.verify('RSA-SHA256', Buffer.from(signingInput), key, signature);
}

/** Verify signature + claims of a Google ID token. Throws on any problem. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { clientId } = googleConfig();
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256') throw new Error(`Unsupported ID token algorithm: ${header.alg}`);

  const signature = Buffer.from(encodedSignature, 'base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  let keys = await getGoogleKeys();
  let jwk = keys.find((k) => k.kid === header.kid) ?? keys.find((k) => k.kty === 'RSA');
  let valid = jwk ? verifyRs256(signingInput, signature, jwk) : false;

  if (!valid) {
    // Key rotation: refetch once before rejecting.
    keys = await getGoogleKeys(true);
    jwk = keys.find((k) => k.kid === header.kid) ?? keys.find((k) => k.kty === 'RSA');
    valid = jwk ? verifyRs256(signingInput, signature, jwk) : false;
  }
  if (!valid) throw new Error('Google ID token signature is invalid');

  const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    iss?: string;
    aud?: string;
    azp?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean | 'true';
    name?: string;
    given_name?: string;
    picture?: string;
    exp?: number;
    iat?: number;
  };

  if (!claims.iss || !ISSUERS.includes(claims.iss)) throw new Error('Unexpected ID token issuer');
  if (clientId && claims.aud !== clientId) throw new Error('ID token was issued for another app');
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new Error('ID token expired');
  if (!claims.sub) throw new Error('ID token is missing the subject claim');
  if (!claims.email) throw new Error('Google did not return an email address');
  if (claims.email_verified !== undefined && claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new Error('Your Google email address is not verified');
  }

  return {
    subject: claims.sub,
    email: claims.email.trim().toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: claims.name || claims.given_name || claims.email.split('@')[0],
    givenName: claims.given_name,
    picture: claims.picture,
  };
}

export function googleStatus(): { configured: boolean; redirectHint: string | null } {
  const { configured } = googleConfig();
  return {
    configured,
    redirectHint: configured ? (process.env.GOOGLE_REDIRECT_URI || null) : null,
  };
}
