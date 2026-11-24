import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/auth';

export async function POST() {
  const res = NextResponse.json({ status: 'signed_out' });
  clearSessionCookie(res);
  return res;
}
