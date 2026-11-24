-- Booklit Production Schema & Row Level Security (Supabase / PostgreSQL)
-- Enforces strict user ownership, privacy-preserving Live Watch, and UTC timestamps.

create extension if not exists "pgcrypto";

-- 1. Users Profile Table (linked to auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  auth_provider text not null default 'magic_link',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  reading_goal_type text not null default 'minutes_day' check (reading_goal_type in ('books_year', 'minutes_day', 'pages_day')),
  reading_goal_target integer not null default 30,
  preferred_genres text[] not null default '{}',
  strike_count integer not null default 0,
  streak_count integer not null default 0,
  last_verified_session_at timestamptz,
  settings_json jsonb not null default '{
    "comprehensionOptIn": false,
    "challengeMode": false,
    "retainAudioForDebug": false,
    "whisperModeDefault": false,
    "analyticsConsent": false,
    "streakInsuranceAvailable": true,
    "streakInsuranceLastUsedMonth": null,
    "reminderWindows": [{"id": "evening", "label": "Evening Wind-Down", "startTime": "20:30", "days": [1,2,3,4,5,0], "enabled": true, "channel": "local_push"}]
  }'::jsonb
);

-- 2. Books Table (user-scoped or catalog-linked; supports non-fiction, academic, religious, poetry, technical, children's, reference)
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  author text not null default 'Unknown Author',
  isbn text,
  genre text[] not null default '{"general_nonfiction"}',
  subgenre text[] not null default '{}',
  page_count integer not null check (page_count > 0),
  current_page integer not null default 0,
  word_count_estimate integer not null check (word_count_estimate > 0),
  difficulty_band smallint not null default 3 check (difficulty_band between 1 and 5),
  cover_url text,
  description text,
  source text not null default 'manual' check (source in ('manual', 'OpenLibrary', 'GoogleBooks')),
  status text not null default 'reading' check (status in ('reading', 'finished', 'tbr', 'paused')),
  medium_default text not null default 'physical' check (medium_default in ('physical', 'ebook', 'audio')),
  rating numeric(2,1) check (rating is null or (rating >= 0.5 and rating <= 5.0)),
  finished_at timestamptz,
  sample_passages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Reading Sessions Table
create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  medium text not null check (medium in ('physical', 'ebook', 'audio')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  start_page integer not null default 0,
  end_page integer not null default 0,
  start_char_offset integer,
  end_char_offset integer,
  verified boolean not null default false,
  verification_tier text not null default 'passive' check (verification_tier in ('none', 'passive', 'active', 'escalated')),
  trust_score smallint not null default 85 check (trust_score between 0 and 100),
  predicted_minutes numeric(6,2) not null default 0,
  actual_minutes numeric(6,2) not null default 0,
  wpm_observed numeric(6,1) not null default 0,
  wpm_expected_range_low numeric(6,1) not null default 150,
  wpm_expected_range_high numeric(6,1) not null default 320,
  flags_json jsonb not null default '[]'::jsonb,
  strike_issued boolean not null default false,
  strike_cured_at timestamptz,
  cure_session_id uuid references public.reading_sessions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- 4. Verification Events Table (never stores raw audio unless explicit debug opt-in)
create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null references public.reading_sessions(id) on delete cascade,
  type text not null check (type in ('scan_start', 'scan_end', 'voice_check', 'comprehension_check', 'focus_return')),
  result text not null check (result in ('pass', 'fail', 'inconclusive')),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 5. TBR Items Table
create table if not exists public.tbr_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  free_text_title text,
  free_text_author text,
  free_text_genre text,
  priority integer not null default 0,
  planned_start_date date,
  reminder_enabled boolean not null default false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- 6. Materialized / Daily Aggregate Table
create table if not exists public.daily_aggregates (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  verified_minutes numeric(7,2) not null default 0,
  unverified_minutes numeric(7,2) not null default 0,
  app_foreground_minutes numeric(7,2) not null default 0,
  pages_read integer not null default 0,
  sessions_count integer not null default 0,
  strike_events integer not null default 0,
  cure_events integer not null default 0,
  streak_qualifies boolean not null default false,
  primary key (user_id, date)
);

-- 7. Privacy-Preserving Live Watch Sessions Table
-- Only aggregate verified minutes are shared; raw pages and passages never appear here.
create table if not exists public.live_watch_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  title text not null default 'Quiet Reading Room',
  host_user_id uuid not null references public.users(id) on delete cascade,
  guest_user_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  target_minutes integer not null default 30,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  host_verified_minutes numeric(6,2) not null default 0,
  guest_verified_minutes jsonb not null default '{}'::jsonb
);

-- Indexes
create index if not exists idx_books_user_status on public.books(user_id, status);
create index if not exists idx_sessions_user_started on public.reading_sessions(user_id, started_at desc);
create index if not exists idx_verification_session on public.verification_events(session_id);
create index if not exists idx_tbr_user_priority on public.tbr_items(user_id, priority asc);
create index if not exists idx_daily_agg_user_date on public.daily_aggregates(user_id, date desc);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.verification_events enable row level security;
alter table public.tbr_items enable row level security;
alter table public.daily_aggregates enable row level security;
alter table public.live_watch_sessions enable row level security;

-- Strict Per-User Policies
create policy "Users own their profile" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users own their books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users own their sessions" on public.reading_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users own their verification events" on public.verification_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users own their TBR list" on public.tbr_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users own their daily aggregates" on public.daily_aggregates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- LiveWatch: visible only to host or invited guests, exposing only aggregate verified minutes
create policy "Participants access live watch room" on public.live_watch_sessions
  for select using (auth.uid() = host_user_id or auth.uid() = any(guest_user_ids));

create policy "Host manages live watch room" on public.live_watch_sessions
  for all using (auth.uid() = host_user_id) with check (auth.uid() = host_user_id);
