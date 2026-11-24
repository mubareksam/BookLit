import fs from 'fs';
import path from 'path';

/**
 * Booklit durable storage.
 *
 * Accounts, follows/tethers, sparks, duels, challenges and cloud snapshots all
 * live in one server-side document. Deploys (new builds) must never wipe it, so
 * this module resolves the most durable place to persist that document:
 *
 *   1. Supabase / Postgres REST (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
 *      — survives redeploys, restarts and instance replacement.
 *   2. A persistent disk mount (`BOOKLIT_DATA_DIR`, `/var/data`, …).
 *   3. Local `.data/` folder (development).
 *
 * The JSON file is always kept as a fast local working copy with a `.backup`
 * revision, and remote writes are coalesced so bursts of updates stay cheap.
 */

export const STORE_FILE_NAME = 'booklit-prod-v2.json';
export const STORE_BACKUP_NAME = 'booklit-prod-v2.backup.json';
const REMOTE_ROW_ID = 'primary';

export interface StorageLocation {
  dir: string;
  dataFile: string;
  backupFile: string;
  writable: boolean;
  source: string;
}

let cachedLocation: StorageLocation | null = null;
let lastWriteError: string | null = null;
let lastRemoteError: string | null = null;

function supabaseConfig(): { url: string; key: string; table: string } | null {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    '';
  const url = rawUrl.replace(/\/+$/, '');
  if (!url || !key) return null;
  return { url, key, table: process.env.BOOKLIT_SUPABASE_TABLE || 'booklit_store' };
}

export function isRemoteConfigured(): boolean {
  return supabaseConfig() !== null;
}

function canWriteToDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.booklit-write-probe');
    fs.writeFileSync(probe, String(Date.now()), 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function resolveStorageLocation(): StorageLocation {
  if (cachedLocation) return cachedLocation;

  const candidates: Array<{ dir: string; source: string }> = [];
  if (process.env.BOOKLIT_DATA_DIR) {
    candidates.push({ dir: process.env.BOOKLIT_DATA_DIR, source: 'env:BOOKLIT_DATA_DIR' });
  }
  if (process.env.BOOKLIT_PERSISTENT_DIR) {
    candidates.push({ dir: process.env.BOOKLIT_PERSISTENT_DIR, source: 'env:BOOKLIT_PERSISTENT_DIR' });
  }
  if (fs.existsSync('/var/data')) {
    candidates.push({ dir: path.join('/var/data', 'booklit'), source: 'render-disk:/var/data' });
  }
  candidates.push({ dir: path.join(process.cwd(), '.data'), source: 'local:.data' });

  for (const candidate of candidates) {
    if (canWriteToDir(candidate.dir)) {
      cachedLocation = {
        dir: candidate.dir,
        dataFile: path.join(candidate.dir, STORE_FILE_NAME),
        backupFile: path.join(candidate.dir, STORE_BACKUP_NAME),
        writable: true,
        source: candidate.source,
      };
      return cachedLocation;
    }
  }

  // Nothing is writable: keep the process alive in memory and report clearly.
  const fallbackDir = candidates[candidates.length - 1].dir;
  cachedLocation = {
    dir: fallbackDir,
    dataFile: path.join(fallbackDir, STORE_FILE_NAME),
    backupFile: path.join(fallbackDir, STORE_BACKUP_NAME),
    writable: false,
    source: 'volatile:read-only-filesystem',
  };
  return cachedLocation;
}

export function readLocalJson(): unknown | null {
  const location = resolveStorageLocation();
  for (const file of [location.dataFile, location.backupFile]) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw.trim()) continue;
      return JSON.parse(raw) as unknown;
    } catch (err) {
      lastWriteError = `Could not read ${path.basename(file)}: ${(err as Error).message}`;
    }
  }
  return null;
}

export function writeLocalJson(data: unknown): boolean {
  const location = resolveStorageLocation();
  if (!location.writable) {
    lastWriteError = 'Data directory is not writable on this host.';
    return false;
  }
  try {
    fs.mkdirSync(location.dir, { recursive: true });
    // Keep one clean revision so a crash mid-write can never lose everything.
    try {
      if (fs.existsSync(location.dataFile)) {
        fs.copyFileSync(location.dataFile, location.backupFile);
      }
    } catch {
      // Backup is best-effort; the fresh write still proceeds.
    }
    const tmp = `${location.dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, location.dataFile);
    lastWriteError = null;
    return true;
  } catch (err) {
    lastWriteError = `Write failed: ${(err as Error).message}`;
    return false;
  }
}

export async function readRemoteJson(): Promise<unknown | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const url = `${cfg.url}/rest/v1/${cfg.table}?id=eq.${REMOTE_ROW_ID}&select=payload`;
    const res = await fetch(url, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      lastRemoteError = `Remote read failed (${res.status}).`;
      return null;
    }
    const rows = (await res.json()) as Array<{ payload?: unknown }>;
    lastRemoteError = null;
    return rows?.[0]?.payload ?? null;
  } catch (err) {
    lastRemoteError = `Remote read failed: ${(err as Error).message}`;
    return null;
  }
}

let pendingRemotePayload: unknown = null;
let remoteTimer: ReturnType<typeof setTimeout> | null = null;
let remoteInFlight: Promise<boolean> | null = null;

async function pushRemote(payload: unknown): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        { id: REMOTE_ROW_ID, payload, updated_at: new Date().toISOString() },
      ]),
      cache: 'no-store',
    });
    if (!res.ok) {
      lastRemoteError = `Remote write failed (${res.status}).`;
      return false;
    }
    lastRemoteError = null;
    return true;
  } catch (err) {
    lastRemoteError = `Remote write failed: ${(err as Error).message}`;
    return false;
  }
}

/** Queue a coalesced durable write to the remote database (if configured). */
export function queueRemoteSave(payload: unknown): void {
  if (!isRemoteConfigured()) return;
  pendingRemotePayload = payload;
  if (remoteTimer) return;
  remoteTimer = setTimeout(() => {
    remoteTimer = null;
    const toSave = pendingRemotePayload;
    pendingRemotePayload = null;
    if (toSave === null) return;
    remoteInFlight = pushRemote(toSave).finally(() => {
      remoteInFlight = null;
    });
  }, 400);
}

/** Await any queued remote write (used on critical mutations like signup). */
export async function flushRemoteSave(): Promise<boolean> {
  if (remoteTimer) {
    clearTimeout(remoteTimer);
    remoteTimer = null;
  }
  if (remoteInFlight) await remoteInFlight;
  if (pendingRemotePayload !== null) {
    const toSave = pendingRemotePayload;
    pendingRemotePayload = null;
    const ok = await pushRemote(toSave);
    return ok;
  }
  return !lastRemoteError;
}

export interface StorageDiagnostics {
  backend: 'supabase' | 'persistent-disk' | 'local-disk' | 'volatile';
  durable: boolean;
  writable: boolean;
  source: string;
  dataDir: string;
  remoteConfigured: boolean;
  lastWriteError: string | null;
  lastRemoteError: string | null;
}

export function storageDiagnostics(extra?: Record<string, unknown>): StorageDiagnostics & Record<string, unknown> {
  const location = resolveStorageLocation();
  const remoteConfigured = isRemoteConfigured();
  const diskBacked = location.writable && location.source !== 'local:.data';
  const backend: StorageDiagnostics['backend'] = remoteConfigured
    ? 'supabase'
    : diskBacked
    ? 'persistent-disk'
    : location.writable
    ? 'local-disk'
    : 'volatile';

  return {
    backend,
    durable: remoteConfigured || diskBacked,
    writable: location.writable,
    source: location.source,
    dataDir: location.dir,
    remoteConfigured,
    lastWriteError,
    lastRemoteError,
    ...(extra ?? {}),
  };
}
