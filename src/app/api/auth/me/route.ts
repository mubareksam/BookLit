import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { readServerStore } from '@/lib/server/store';

export async function GET(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ user: null, snapshot: null });
  }
  const store = readServerStore();
  const snapshot = store.usersData[user.id] ?? null;
  return NextResponse.json({ user, snapshot });
}
