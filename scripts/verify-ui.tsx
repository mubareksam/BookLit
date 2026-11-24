/**
 * Headless UI smoke test (jsdom + fake IndexedDB).
 *
 * Renders the real provider, auth screen and Add Book modal against a running
 * dev server and asserts the flows a reader actually touches: sign-in screen
 * renders, Add Book opens (regression guard for the hook-order crash), search
 * returns results, and picking one writes the book to the library.
 *
 * Run the app first: `npm run dev`, then `npx tsx scripts/verify-ui.tsx`.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Backs IndexedDB (Dexie) inside jsdom for this smoke test.
import 'fake-indexeddb/auto';

const BASE = process.env.BOOKLIT_TEST_BASE || 'http://127.0.0.1:3000';

async function main() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: BASE,
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const g = globalThis as unknown as Record<string, unknown>;

  const define = (key: string, value: unknown) =>
    Object.defineProperty(g, key, { value, configurable: true, writable: true });

  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('HTMLElement', window.HTMLElement);
  define('HTMLInputElement', window.HTMLInputElement);
  define('Node', window.Node);
  define('Event', window.Event);
  define('KeyboardEvent', window.KeyboardEvent);
  define('MouseEvent', window.MouseEvent);
  define('getComputedStyle', window.getComputedStyle.bind(window));
  define('localStorage', window.localStorage);
  define('sessionStorage', window.sessionStorage);
  define('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
  define('cancelAnimationFrame', (id: number) => clearTimeout(id));
  define('IS_REACT_ACT_ENVIRONMENT', true);

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  // jsdom has no fetch, and the app calls same-origin relative URLs. A tiny
  // cookie jar makes the harness behave like a browser so session-protected
  // routes (/api/sync) really authenticate.
  const realFetch = globalThis.fetch;
  const jar = new Map<string, string>();
  define('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const absolute = url.startsWith('http') ? url : `${BASE}${url}`;

    const headers = new Headers(init?.headers);
    if (jar.size > 0) {
      headers.set('cookie', Array.from(jar, ([k, v]) => `${k}=${v}`).join('; '));
    }

    const res = await realFetch(absolute, { ...init, headers });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  }) as typeof fetch);

  // fake-indexeddb installs itself on `window` when one exists; Dexie reads the
  // bare globals, so mirror them.
  const w = window as unknown as Record<string, unknown>;
  for (const key of ['indexedDB', 'IDBKeyRange', 'IDBFactory', 'IDBDatabase', 'IDBTransaction', 'IDBRequest']) {
    if (w[key]) define(key, w[key]);
  }

  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { BooklitProvider, useBooklit } = await import('../src/context/BooklitContext');
  const { AuthLandingScreen } = await import('../src/components/AuthLandingScreen');
  const { AddBookModal } = await import('../src/components/AddBookModal');

  const consoleErrors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '));
    originalError(...args);
  };

  type Ctx = ReturnType<typeof useBooklit>;
  let ctx: Ctx | null = null;

  function Probe() {
    ctx = useBooklit();
    return React.createElement('div', null, `books:${ctx.books.length}`);
  }

  function App() {
    const c = useBooklit();
    return React.createElement(
      'div',
      null,
      c.ready && !c.user ? React.createElement(AuthLandingScreen) : null,
      React.createElement(AddBookModal),
      React.createElement(Probe)
    );
  }

  const root = createRoot(window.document.getElementById('root')!);
  await act(async () => {
    root.render(React.createElement(BooklitProvider, null, React.createElement(App)));
  });

  const waitFor = async (predicate: () => boolean, label: string, timeoutMs = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (predicate()) return;
      // let React, Dexie and network promises settle
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const byText = (text: string) =>
    Array.from(window.document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes(text)
    );

  // 1. Auth screen renders (with the Google entry point)
  await waitFor(() => Boolean(byText('Sign In')), 'auth screen');
  assert.ok(byText('Continue with Google'), 'Google button must be on the sign-in card');
  assert.ok(byText('Forgot password?'), 'Forgot password link must be present');

  // 1b. Google on an unconfigured deployment explains itself instead of leaving
  //     the reader on a broken redirect.
  const providers = (await (await fetch('/api/auth/providers')).json()) as {
    google?: { configured?: boolean; redirectUri?: string | null };
  };
  if (!providers.google?.configured) {
    await act(async () => {
      byText('Continue with Google')!.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true })
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await waitFor(
      () => (window.document.body.textContent || '').includes('not enabled on this deployment'),
      'Google setup hint'
    );
    assert.ok(
      (window.document.body.textContent || '').includes('/api/auth/google/callback'),
      'the hint must show the exact redirect URI to whitelist'
    );
  }

  // 1c. Forgot password opens the email reset form and can go back
  await act(async () => {
    byText('Forgot password?')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  await waitFor(() => Boolean(byText('Email me a reset link')), 'forgot-password form');
  await act(async () => {
    byText('Back to sign in')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  await waitFor(() => Boolean(byText('Sign In')), 'back to sign-in');

  // 2. Create an account through the real context (signup → session → dashboard)
  const email = `ui_test_${Date.now()}@example.com`;
  let registered = false;
  await act(async () => {
    const res = await ctx!.registerAccount({
      email,
      username: `ui_test_${Date.now().toString().slice(-6)}`,
      displayName: 'UI Test Reader',
      password: 'UiTest#2026',
      goalType: 'minutes_day',
      goalTarget: 25,
      preferredGenres: ['literary_fiction'],
    });
    registered = res.ok;
    if (!res.ok) console.log('register failed:', res.error);
  });
  assert.equal(registered, true, 'create account must succeed');
  await waitFor(() => Boolean(ctx?.user), 'signed-in user');
  await waitFor(() => !byText('Sign In'), 'auth screen to unmount');

  // 3. Open Add Book — this used to crash with a React hook-order error
  await act(async () => {
    ctx!.setAddBookModalOpen(true);
  });
  await waitFor(
    () => Array.from(window.document.querySelectorAll('h2')).some((h) => h.textContent === 'Add Book'),
    'Add Book modal'
  );

  // 4. Search for a book and add it
  const searchInput = window.document.querySelector(
    'input[placeholder*="Search title"]'
  ) as HTMLInputElement | null;
  assert.ok(searchInput, 'search input must exist');

  const setValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  await act(async () => {
    setValue(searchInput!, 'dune');
  });

  await waitFor(
    () =>
      Array.from(window.document.querySelectorAll('h3')).some((h) =>
        (h.textContent || '').toLowerCase().includes('dune')
      ),
    'search results'
  );

  const readButton = Array.from(window.document.querySelectorAll('button')).find(
    (b) => (b.textContent || '').trim() === 'Read'
  );
  assert.ok(readButton, 'a Read button must be offered for the result');

  await act(async () => {
    readButton!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 700));
  });

  await waitFor(() => (ctx?.books.length ?? 0) === 1, 'book to be saved to the library');
  assert.equal(ctx!.books[0].title.toLowerCase(), 'dune');

  // 4b. …and it reaches the durable server store, not just IndexedDB.
  let serverBooks: string[] = [];
  for (let attempt = 0; attempt < 40 && serverBooks.length === 0; attempt++) {
    const syncRes = await fetch('/api/sync');
    const syncBody = (await syncRes.json()) as {
      syncedSnapshot?: { books?: Record<string, { title?: string }> };
    };
    serverBooks = Object.values(syncBody.syncedSnapshot?.books ?? {}).map(
      (b) => (b.title ?? '').toLowerCase()
    );
    if (serverBooks.length === 0) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.deepEqual(serverBooks, ['dune'], 'the added book must be stored on the server');

  // 5. No React errors or unhandled warnings during the whole flow
  const fatal = consoleErrors.filter((line) =>
    /Rendered more hooks|Rendered fewer hooks|Invalid hook call|is not a function|Cannot read/.test(line)
  );
  assert.deepEqual(fatal, [], `unexpected runtime errors: ${fatal.join(' | ')}`);

  console.log(
    '✓ UI smoke test passed (auth screen, create account, Add Book modal, fuzzy search, book saved).'
  );
  console.error = originalError;
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ UI verification failed:', err);
  process.exit(1);
});
