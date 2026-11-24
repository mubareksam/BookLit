import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Durable-storage invariants: accounts, tethers, sparks and snapshots must
 * survive writes, restarts and upgrades — and a corrupted file must never wipe
 * a reader's history.
 */
async function runStorageTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklit-store-'));
  process.env.BOOKLIT_DATA_DIR = tempDir;

  const storage = await import('../src/lib/server/storage');
  const storeModule = await import('../src/lib/server/store');

  const location = storage.resolveStorageLocation();
  assert.equal(location.writable, true, 'temp dir should be writable');
  assert.equal(location.dir, tempDir, 'BOOKLIT_DATA_DIR must win');
  assert.equal(storage.storageDiagnostics().backend, 'persistent-disk');

  const makeStore = () => {
    const now = new Date().toISOString();
    return {
      accountsById: {
        usr_1: {
          user: {
            id: 'usr_1',
            username: 'meron_r',
            email: 'meron@example.com',
            display_name: 'Meron T',
          } as never,
          passwordSalt: 'salt',
          passwordHash: 'hash',
        },
      },
      accountIdByEmail: { 'meron@example.com': 'usr_1' },
      accountIdByUsername: { meron_r: 'usr_1' },
      usersData: {
        usr_1: {
          profile: { id: 'usr_1', username: 'meron_r' } as never,
          books: { 'book-1': { id: 'book-1', title: 'Dune' } },
          sessions: {},
          verificationEvents: {},
          tbr: {},
          dailyAggregates: {},
          updatedAt: now,
        },
      },
      liveWatchRooms: {},
      challenges: {},
      duels: {},
      followsByUserId: { usr_1: ['usr_2'] },
      sparksByEventId: { act_1: ['usr_2'] },
      activityFeed: [],
    } as unknown as import('../src/lib/server/store').ServerDataShape;
  };

  // 1. Write → read back with nothing lost
  const store = makeStore();
  assert.equal(storeModule.writeServerStore(store), true);
  const reloaded = storeModule.readServerStore();
  assert.deepEqual(Object.keys(reloaded.accountsById), ['usr_1']);
  assert.deepEqual(reloaded.followsByUserId.usr_1, ['usr_2']);
  assert.deepEqual(reloaded.sparksByEventId.act_1, ['usr_2']);
  assert.equal(reloaded.accountsById.usr_1.passwordHash, 'hash');

  // 2. A second write keeps a backup revision of the previous document
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(storeModule.writeServerStore(store), true);
  assert.equal(fs.existsSync(location.backupFile), true, 'backup revision must exist');

  // 3. Corrupted primary file falls back to the backup instead of wiping data
  fs.writeFileSync(location.dataFile, '{ not valid json', 'utf8');
  const recoveredFromBackup = storage.readLocalJson() as Record<string, unknown> | null;
  assert.ok(recoveredFromBackup, 'backup should be readable');
  assert.ok(
    (recoveredFromBackup as { accountsById?: Record<string, unknown> }).accountsById?.usr_1,
    'account must survive corruption via backup'
  );

  // 4. Legacy documents (pre-sparks / pre-schema-version) are lifted, not dropped
  await new Promise((resolve) => setTimeout(resolve, 12));
  fs.writeFileSync(
    location.dataFile,
    JSON.stringify({
      accountsById: makeStore().accountsById,
      accountIdByEmail: { 'meron@example.com': 'usr_1' },
      accountIdByUsername: { meron_r: 'usr_1' },
      usersData: {},
      followsByUserId: { usr_1: ['usr_3'] },
    }),
    'utf8'
  );
  const legacy = storeModule.readServerStore();
  assert.deepEqual(Object.keys(legacy.accountsById), ['usr_1']);
  assert.deepEqual(legacy.followsByUserId.usr_1, ['usr_3']);
  assert.deepEqual(legacy.sparksByEventId, {});
  assert.equal(legacy.schemaVersion, storeModule.STORE_SCHEMA_VERSION);

  // 5. If the files disappear mid-process, the last known-good document is kept
  //    in memory (never silently replaced by an empty store).
  fs.rmSync(location.dataFile, { force: true });
  fs.rmSync(location.backupFile, { force: true });
  const stillKnown = storeModule.readServerStore();
  assert.deepEqual(Object.keys(stillKnown.accountsById), ['usr_1']);
  assert.ok(Array.isArray(stillKnown.activityFeed));

  // 6. Auth attempt throttling blocks brute force, then clears on success
  for (let i = 0; i < 10; i++) {
    assert.equal(storeModule.checkAuthAttemptLimit('meron_r').allowed, true);
  }
  assert.equal(storeModule.checkAuthAttemptLimit('meron_r').allowed, false);
  storeModule.clearAuthAttemptLimit('meron_r');
  assert.equal(storeModule.checkAuthAttemptLimit('meron_r').allowed, true);

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✓ Storage & account-safety invariants verified (durable writes, backups, legacy data, throttling).');
}

runStorageTests().catch((err) => {
  console.error('✗ Storage verification failed:', err);
  process.exit(1);
});
