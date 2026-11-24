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
