import { NextRequest, NextResponse } from 'next/server';
import { findPasswordReset } from '@/lib/server/accounts';
import { ensureStoreHydrated, readServerStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.slice(0, 1);
  return `${visible}${'•'.repeat(Math.max(1, Math.min(4, name.length - 1)))}@${domain}`;
}

/** Lets the reset screen tell "link expired" from "choose a new password". */
export async function GET(req: NextRequest) {
  await ensureStoreHydrated();
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const store = readServerStore();
  const found = findPasswordReset(store, token);

  if (!found) {
    return NextResponse.json(
      { valid: false, error: 'This reset link is invalid or has expired. Request a new one.' },
      { status: 400 }
    );
  }

  const account = store.accountsById[found.record.accountId];
  return NextResponse.json({
    valid: true,
    username: account.user.username,
    email: maskEmail(account.user.email),
  });
}
