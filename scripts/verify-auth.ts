import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Sign-in invariants: the account you just created must stay signable-in via
 * email, @username, Google, and a password-reset link — on any device.
 */
async function runAuthTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklit-auth-'));
  process.env.BOOKLIT_DATA_DIR = tempDir;

  const { readServerStore, STORE_SCHEMA_VERSION } = await import('../src/lib/server/store');
  const {
    createAccount,
    deriveUsername,
    findAccountIdByGoogleSubject,
    findPasswordReset,
    issuePasswordReset,
    linkGoogleAccount,
    normalizeIdentifier,
    resolveAccountId,
    uniqueUsername,
    consumePasswordReset,
  } = await import('../src/lib/server/accounts');
  const { createOAuthState, verifyOAuthState, sanitizeNext } = await import('../src/lib/server/google');

  const store = readServerStore();
  assert.equal(store.schemaVersion, STORE_SCHEMA_VERSION);

  // 1. Identifier normalisation
  assert.equal(normalizeIdentifier('  @Meron_R '), 'meron_r');
  assert.equal(normalizeIdentifier('Meron@Example.com'), 'meron@example.com');

  // 2. Account creation stores every index
  const a = createAccount(store, {
    email: 'Meron@Example.com',
    username: 'meron_r',
    displayName: 'Meron T',
    password: 'ReaderPass123!',
  });
  assert.equal(store.accountIdByEmail['meron@example.com'], a.userId);
  assert.equal(store.accountIdByUsername['meron_r'], a.userId);
  assert.equal(a.user.auth_provider, 'email_password');
  assert.equal(a.user.email, 'meron@example.com');

  // 3. Sign-in resolves email, username, @username and any casing
  for (const identifier of [
    'meron@example.com',
    'MERON@EXAMPLE.COM',
    'meron_r',
    '@meron_r',
    '  @Meron_R  ',
  ]) {
    assert.equal(resolveAccountId(store, identifier), a.userId, `should resolve ${identifier}`);
  }

  // 4. A missing index is repaired by scanning (never "account not found")
  delete store.accountIdByEmail['meron@example.com'];
  assert.equal(resolveAccountId(store, 'meron@example.com'), a.userId);
  assert.equal(store.accountIdByEmail['meron@example.com'], a.userId, 'index repaired in place');

  // 5. Google identities link to the same account without losing the password
  const beforeHash = store.accountsById[a.userId].passwordHash;
  linkGoogleAccount(store, a.userId, 'google-sub-123');
  assert.equal(findAccountIdByGoogleSubject(store, 'google-sub-123'), a.userId);
  assert.equal(store.accountsById[a.userId].passwordHash, beforeHash, 'password kept');
  assert.equal(store.accountIdByGoogleSub['google-sub-123'], a.userId);

  // 6. A brand-new Google reader gets a clean, unique handle
  const g = createAccount(store, {
    email: 'leul.tesfaye@gmail.com',
    displayName: 'Leul Tesfaye',
    googleSubject: 'google-sub-456',
    authProvider: 'google',
  });
  assert.equal(g.user.username, 'leul_tesfaye');
  assert.equal(g.user.auth_provider, 'google');
  assert.equal(findAccountIdByGoogleSubject(store, 'google-sub-456'), g.userId);
  assert.equal(
    store.accountsById[g.userId].passwordHash,
    '',
    'Google-only accounts have no password hash'
  );

  // 7. Handles never collide
  assert.notEqual(deriveUsername(store, 'leul.tesfaye@gmail.com'), 'leul_tesfaye');
  assert.equal(uniqueUsername(store, 'meron_r'), 'meron_r_2');

  // 8. Password-reset links are single-use
  const { token, expiresAt } = issuePasswordReset(store, a.userId);
  assert.ok(new Date(expiresAt).getTime() > Date.now());
  assert.ok(findPasswordReset(store, token));
  assert.equal(consumePasswordReset(store, token, 'BrandNew#999')?.accountId, a.userId);
  assert.equal(findPasswordReset(store, token), null, 'token cannot be replayed');
  assert.equal(consumePasswordReset(store, token, 'AnotherOne#111'), null);

  // 9. Expired / forged tokens are rejected
  const expired = issuePasswordReset(store, a.userId);
  const expiredKey = Object.keys(store.passwordResets).find(
    (k) => store.passwordResets[k].email === 'meron@example.com'
  );
  assert.ok(expiredKey);
  store.passwordResets[expiredKey].expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(findPasswordReset(store, expired.token), null);
  assert.equal(findPasswordReset(store, 'not-a-real-token-at-all'), null);

  // 10. OAuth state is signed, expiring and redirect-safe
  const state = createOAuthState('/challenges');
  assert.deepEqual(verifyOAuthState(state), { next: '/challenges' });
  assert.equal(verifyOAuthState(`${state}x`), null, 'tampered state rejected');
  assert.deepEqual(verifyOAuthState(createOAuthState('https://evil.example')), { next: '/' });
  assert.equal(sanitizeNext('//evil.example'), '/');

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✓ Sign-in invariants verified (email/@username lookup, Google linking, single-use resets).');
}

runAuthTests().catch((err) => {
  console.error('✗ Auth verification failed:', err);
  process.exit(1);
});
