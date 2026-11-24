import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readServerStore } from './store';
import { UserProfile } from '../types';

export const SESSION_COOKIE_NAME = 'booklit_session';

function getAuthSecret(): string {
  return (
    process.env.BOOKLIT_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'booklit-production-hmac-key-v2-change-in-env'
  );
}

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { salt: usedSalt, hash: derived };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(userId: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = `${userId}.${exp}`;
  const sig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(payload)
    .digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifySessionToken(token?: string | null): string | null {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, providedSig] = token.split('.');
  if (!encodedPayload || !providedSig) return null;

  try {
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expectedSig = crypto
      .createHmac('sha256', getAuthSecret())
      .update(payload)
      .digest('base64url');

    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const [userId, expStr] = payload.split('.');
    const exp = Number(expStr);
    if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
    return userId;
  } catch {
    return null;
  }
}

export function attachSessionCookie(res: NextResponse, userId: string): void {
  const token = signSessionToken(userId);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function getAuthenticatedUser(req: NextRequest): UserProfile | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = verifySessionToken(token);
  if (!userId) return null;

  const store = readServerStore();
  const record = store.accountsById[userId];
  return record?.user ?? null;
}
