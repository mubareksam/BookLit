# Booklit — Verified Cross-Platform Reading Habit System

**Booklit** is an offline-first Next.js App Router PWA reading habit platform designed around a reader-first trust contract: *feel like a coach that occasionally asks “show me you’re still here,” never a proctor waiting to catch you.*

## Key Capabilities

- **Two Purpose-Built Interaction Profiles on Shared Domain Logic**:
  - **Desktop Web (`(pointer: fine)` / desktop browsers)**: Persistent left sidebar, dense KPI coach dashboard, multi-column filterable library, expandable session verification timelines, hover WPM/trust tooltips, and keyboard-first navigation (`/` search, `S` start session, `E` end session, `G` then `D` dashboard).
  - **Installed Touch PWA (`(pointer: coarse)` / standalone display mode)**: Safe-area thumb-zone bottom navigation (`Home · TBR · [Center Scan] · Stats · Profile`), horizontal swipeable current-read deck, long-press quick-action bottom sheet, one-screen calm OLED timer flow, native Chromium `beforeinstallprompt` + iOS Safari manual “Share → Add to Home Screen” banner.
- **Offline-First Persistence (`Dexie` IndexedDB + Sync Queue + Supabase RLS)**:
  - All reading drafts, books, sessions, verification events, TBR items, and daily aggregates persist locally in IndexedDB first and sync automatically via `/api/sync` (and optional Supabase backend with strict `user_id = auth.uid()` Row Level Security in `supabase/migrations/0001_booklit_schema_and_rls.sql`).
- **Tiered Probabilistic Verification & 7-Day Strike Cure Engine**:
  - **Tier 0 (Passive)**: Genre-calibrated speed plausibility, monotonic vs. wall-clock drift check, and screen-off-tolerant focus tracking.
  - **Tier 1 (Low-Friction Scan / Progress)**: Start & end page scan via in-browser `Tesseract.js` + optical line-density estimation + server fallback (`/api/ocr`), or Kindle/Kobo/Apple Books share-sheet progress delta (±35% generous tolerance).
  - **Tier 2 (Random 5–10s Passage Check)**: Rate-limited `/api/verify-speech` endpoint with normalized token matching (≥60% standard, ≥46% quiet Whisper Mode + pause fluency) and immediate raw-audio discard unless debug retention is explicitly enabled. Includes optional passage-grounded Comprehension Micro-Checks.
  - **Tier 3 (Escalation & Cure)**: Strikes require ≥2 independent adverse signals (never a single Tier 2 mismatch), preserve historical verified minutes, and can be cured within 7 days by completing a ≥10-minute verified session.
- **Bayesian Genre Reading-Speed Model & Finish Forecasts**:
  - Supports Academic, Technical, Religious, Poetry, Philosophy, History, Reference, Children’s, General Nonfiction, and Fiction—blending population priors with personal verified WPM history.
- **Privacy-Preserving Live Watch, TBR Drag-Reorder, Separate App Foreground Telemetry, Year-in-Books Recap, and Full CSV/JSON Data Export + Account Deletion**.

## Running Locally

```bash
npm install
npm test        # Runs domain invariant verification suite
npm run dev     # Starts Next.js server on 0.0.0.0:3000
```

## Durable accounts & data (survive app updates)

Every account, tether (follow), spark (like), 1v1 duel, challenge and cloud
reading snapshot is stored in **one server-side document**. Booklit resolves the
most durable place to keep it:

| Order | Backend | Survives redeploys | How to enable |
| --- | --- | --- | --- |
| 1 | **Supabase / Postgres REST** | ✅ | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| 2 | **Persistent disk** | ✅ | `BOOKLIT_DATA_DIR=/var/data/booklit` + a mounted disk |
| 3 | **Local `.data/` folder** | ❌ (dev only) | default |

When neither 1 nor 2 is configured, the app still works, but the server has only
temporary storage — **Profile → Account & Data Storage** (and `GET /api/health`)
will show a *Temporary* warning so you know accounts can be lost on a redeploy.

### Option A — Supabase (recommended, free tier works)

Run this once in the Supabase SQL editor:

```sql
create table if not exists public.booklit_store (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Server-only access: the service role key is used from API routes.
alter table public.booklit_store enable row level security;
```

Then set these environment variables (Render → Environment, or `.env.local`):

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BOOKLIT_SUPABASE_TABLE=booklit_store
BOOKLIT_AUTH_SECRET=<long random string, keep it stable>
```

### Option B — Persistent disk

Mount a disk (Render: *Disk → mount path `/var/data`*, paid instance types) and
set `BOOKLIT_DATA_DIR=/var/data/booklit`. The JSON document is written
atomically with a `.backup` revision, so a crashed write can never wipe history.

### Notes

- Sign-in restores the reader's cloud snapshot into IndexedDB; local data is
  merge-only (never dropped) and IndexedDB is namespaced per account.
- "Delete Account" now permanently removes the server record (account, snapshots,
  tethers, sparks, duel and challenge entries) as well as local data.
- Existing `.data/booklit-prod-v2.json` files from older versions keep working and
  are automatically lifted to the current schema on first load.

## Sign-in methods

Booklit supports three ways into the same account — all of them land on the same
user id, so books, sessions, tethers and sparks stay intact whichever you use.

| Method | Where it is configured |
| --- | --- |
| Email + password | always on |
| Google (sign in **and** create account) | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| Forgot password (one-time email link) | `RESEND_API_KEY` (+ `BOOKLIT_MAIL_FROM`) |

### Google Sign-In

1. Google Cloud Console → **APIs & Services → OAuth consent screen** → publish (External, Testing is fine for your own account).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Add the authorized redirect URI exactly as the server will send it:
   `https://<your-domain>/api/auth/google/callback`
   (local: `http://localhost:3000/api/auth/google/callback`).
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the environment and redeploy.

Behaviour:

- New Google account → an account is created with a handle derived from the email
  (`leul.tesfaye@gmail.com` → `leul_tesfaye`, auto-suffixed if taken). The handle can
  be changed later in Profile.
- Google email already registered with a password → the two are **linked**: same
  user id, same history, password sign-in keeps working.
- Tokens are verified server-side against Google's JWKS (signature, issuer,
  audience, expiry) and the email must be verified by Google. A failed or forged
  callback never creates a session.
- If `GOOGLE_*` is not set, the button still explains that the deployment has not
  enabled it yet — it never half-signs anyone in.

### Forgot password

`POST /api/auth/password/request` issues a **single-use, 60-minute** token for the
email on file and emails `<your-site>/?reset=<token>`. Tokens are stored only as
SHA-256 hashes, are invalidated after use, and a newer request kills older links.
The response is identical for unknown addresses (no account enumeration).

Email delivery uses [Resend](https://resend.com) (`RESEND_API_KEY`). Without it the
link is still generated — in development the API returns it so you can test the
flow, and the server log prints it; in production the reader is told plainly that
email delivery is not configured. Signed-in readers can trigger the same link from
**Profile → Sign-in & Password**.

## Verifying a change

```bash
npx tsc --noEmit          # types
npm test                  # domain, storage and sign-in invariants (headless)
npm run build             # production build
npm run dev               # in one terminal…
npm run test:ui           # …then in another: jsdom smoke test
```

`npm run test:ui` mounts the real provider, auth screen and Add Book modal in
jsdom (with fake IndexedDB and a cookie jar) and asserts the flows readers touch:
sign-in screen renders, Google/setup hints appear, "Forgot password?" opens the
reset form, account creation signs in, Add Book opens and its fuzzy search saves a
book to both IndexedDB *and* the server store. It fails loudly on React errors
such as a changed hook order.
