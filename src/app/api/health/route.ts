import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { ensureStoreHydrated, getStoreDiagnostics } from '@/lib/server/store';

/**
 * Storage health. Tells the client (and you) whether accounts, tethers, sparks
 * and cloud snapshots are being saved durably or only in temporary storage.
 */
export async function GET(req: NextRequest) {
  await ensureStoreHydrated();
  const diagnostics = getStoreDiagnostics();
  const viewer = getAuthenticatedUser(req);

  const publicInfo = {
    status: 'ok',
    storage: {
      backend: diagnostics.backend,
      durable: diagnostics.durable,
      remoteConfigured: diagnostics.remoteConfigured,
      writable: diagnostics.writable,
      dataDir: diagnostics.dataDir,
      lastSavedAt: diagnostics.lastSavedAt,
      lastSaveError: diagnostics.lastSaveError,
      lastRemoteError: diagnostics.lastRemoteError,
    },
  };

  if (!viewer) {
    return NextResponse.json(publicInfo);
  }

  return NextResponse.json({ ...publicInfo, counts: diagnostics });
}
