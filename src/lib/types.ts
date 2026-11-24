import { z } from 'zod';

export const BOOK_GENRES = [
  'literary_fiction',
  'fiction',
  'light_fiction',
  'general_nonfiction',
  'history',
  'academic',
  'technical',
  'religious',
  'poetry',
  'reference',
  'childrens',
  'philosophy',
] as const;

export type BookGenre = (typeof BOOK_GENRES)[number];

export const GENRE_META: Record<
  BookGenre,
  {
    label: string;
    priorWpm: number;
    priorSd: number;
    ceilingWpm: number;
    wordsPerPageDefault: number;
    defaultDifficulty: 1 | 2 | 3 | 4 | 5;
    adjacent: BookGenre[];
    badgeColor: string;
  }
> = {
  light_fiction: {
    label: 'Genre / Light Fiction',
    priorWpm: 290,
    priorSd: 45,
    ceilingWpm: 460,
    wordsPerPageDefault: 265,
    defaultDifficulty: 2,
    adjacent: ['fiction', 'literary_fiction', 'childrens'],
    badgeColor: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  fiction: {
    label: 'Contemporary Fiction',
    priorWpm: 265,
    priorSd: 42,
    ceilingWpm: 430,
    wordsPerPageDefault: 275,
    defaultDifficulty: 2,
    adjacent: ['literary_fiction', 'light_fiction', 'history'],
    badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  literary_fiction: {
    label: 'Literary Fiction',
    priorWpm: 255,
    priorSd: 40,
    ceilingWpm: 400,
    wordsPerPageDefault: 290,
    defaultDifficulty: 3,
    adjacent: ['fiction', 'poetry', 'philosophy'],
    badgeColor: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  general_nonfiction: {
    label: 'General Nonfiction',
    priorWpm: 240,
    priorSd: 38,
    ceilingWpm: 390,
    wordsPerPageDefault: 300,
    defaultDifficulty: 3,
    adjacent: ['history', 'reference', 'philosophy'],
    badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  history: {
    label: 'History & Biography',
    priorWpm: 225,
    priorSd: 36,
    ceilingWpm: 365,
    wordsPerPageDefault: 320,
    defaultDifficulty: 3,
    adjacent: ['general_nonfiction', 'academic', 'religious'],
    badgeColor: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
  philosophy: {
    label: 'Philosophy & Essays',
    priorWpm: 175,
    priorSd: 32,
    ceilingWpm: 295,
    wordsPerPageDefault: 310,
    defaultDifficulty: 4,
    adjacent: ['academic', 'religious', 'literary_fiction'],
    badgeColor: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  },
  religious: {
    label: 'Religious & Contemplative',
    priorWpm: 170,
    priorSd: 34,
    ceilingWpm: 290,
    wordsPerPageDefault: 330,
    defaultDifficulty: 4,
    adjacent: ['philosophy', 'history', 'poetry'],
    badgeColor: 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-300',
  },
  reference: {
    label: 'Reference & Handbooks',
    priorWpm: 185,
    priorSd: 38,
    ceilingWpm: 330,
    wordsPerPageDefault: 340,
    defaultDifficulty: 3,
    adjacent: ['technical', 'general_nonfiction', 'academic'],
    badgeColor: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  },
  academic: {
    label: 'Academic & Research',
    priorWpm: 155,
    priorSd: 28,
    ceilingWpm: 270,
    wordsPerPageDefault: 370,
    defaultDifficulty: 5,
    adjacent: ['technical', 'philosophy', 'history'],
    badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  technical: {
    label: 'Technical & Engineering',
    priorWpm: 145,
    priorSd: 28,
    ceilingWpm: 260,
    wordsPerPageDefault: 340,
    defaultDifficulty: 5,
    adjacent: ['academic', 'reference', 'general_nonfiction'],
    badgeColor: 'bg-cyan-500/10 text-cyan-800 dark:text-cyan-300',
  },
  poetry: {
    label: 'Poetry & Verse',
    priorWpm: 130,
    priorSd: 30,
    ceilingWpm: 235,
    wordsPerPageDefault: 140,
    defaultDifficulty: 4,
    adjacent: ['literary_fiction', 'religious', 'philosophy'],
    badgeColor: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
  },
  childrens: {
    label: "Children's & Middle Grade",
    priorWpm: 275,
    priorSd: 48,
    ceilingWpm: 440,
    wordsPerPageDefault: 180,
    defaultDifficulty: 1,
    adjacent: ['light_fiction', 'fiction'],
    badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
};

export type ReadingGoalType = 'books_year' | 'minutes_day' | 'pages_day';
export type ReadingMedium = 'physical' | 'ebook' | 'audio';
export type VerificationTier = 'none' | 'passive' | 'active' | 'escalated';
export type VerificationEventType =
  | 'scan_start'
  | 'scan_end'
  | 'voice_check'
  | 'comprehension_check'
  | 'focus_return';
export type VerificationResult = 'pass' | 'fail' | 'inconclusive';

export interface ReminderWindow {
  id: string;
  label: string;
  startTime: string; // HH:mm
  durationMinutes: number;
  days: number[]; // 0 = Sun ... 6 = Sat
  enabled: boolean;
  channel: 'local_push' | 'email_fallback';
}

export interface UserSettings {
  comprehensionOptIn: boolean;
  challengeMode: boolean;
  retainAudioForDebug: boolean;
  whisperModeDefault: boolean;
  analyticsConsent: boolean;
  notificationsPromptedAfterFirstSession: boolean;
  notificationsEnabled: boolean;
  cameraExplainerSeen: boolean;
  micExplainerSeen: boolean;
  streakInsuranceAvailable: boolean;
  streakInsuranceLastUsedMonth: string | null;
  themePreference: 'system' | 'light' | 'dark';
  interactionProfileOverride: 'auto' | 'desktop' | 'pwa';
  reminderWindows: ReminderWindow[];
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  auth_provider: 'magic_link' | 'google' | 'apple' | 'guest_local';
  timezone: string;
  created_at: string; // ISO UTC
  reading_goal_type: ReadingGoalType;
  reading_goal_target: number;
  preferred_genres: BookGenre[];
  strike_count: number;
  streak_count: number;
  last_verified_session_at: string | null;
  settings_json: UserSettings;
}

export interface PassageSample {
  pageStart: number;
  pageEnd: number;
  excerpt: string;
  question?: {
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string;
  isbn: string | null;
  genre: BookGenre[];
  subgenre: string[];
  page_count: number;
  current_page: number;
  word_count_estimate: number;
  difficulty_band: 1 | 2 | 3 | 4 | 5;
  cover_url: string | null;
  description: string;
  source: 'manual' | 'OpenLibrary' | 'GoogleBooks';
  status: 'reading' | 'finished' | 'tbr' | 'paused';
  medium_default: ReadingMedium;
  rating: number | null;
  finished_at: string | null;
  sample_passages: PassageSample[];
  created_at: string;
  updated_at: string;
}

export interface SessionFlag {
  code:
    | 'implausible_speed'
    | 'clock_anomaly'
    | 'excessive_background_soft'
    | 'pace_variance'
    | 'voice_inconclusive'
    | 'voice_failed'
    | 'comprehension_missed'
    | 'ocr_low_confidence';
  severity: 'info' | 'soft' | 'escalated';
  label: string;
  explanation: string;
  cureHint: string;
}

export interface ReadingSession {
  id: string;
  user_id: string;
  book_id: string;
  medium: ReadingMedium;
  started_at: string; // UTC ISO
  ended_at: string; // UTC ISO
  start_page: number;
  end_page: number;
  start_char_offset?: number | null;
  end_char_offset?: number | null;
  verified: boolean;
  verification_tier: VerificationTier;
  trust_score: number; // 0-100
  predicted_minutes: number;
  actual_minutes: number;
  wpm_observed: number;
  wpm_expected_range_low: number;
  wpm_expected_range_high: number;
  flags_json: SessionFlag[];
  strike_issued: boolean;
  strike_cured_at?: string | null;
  cure_session_id: string | null;
  is_cure_for_session_id?: string | null;
  synced?: boolean;
  notes?: string;
}

export interface VerificationEvent {
  id: string;
  user_id: string;
  session_id: string;
  type: VerificationEventType;
  result: VerificationResult;
  confidence: number; // 0.0 - 1.0
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface TBRItem {
  id: string;
  user_id: string;
  book_id: string | null;
  free_text_title?: string;
  free_text_author?: string;
  free_text_genre?: BookGenre;
  priority: number;
  planned_start_date: string | null; // YYYY-MM-DD
  reminder_enabled: boolean;
  completed_at: string | null;
  notes: string;
  created_at: string;
}

export interface DailyAggregate {
  id: string; // `${user_id}_${date}`
  user_id: string;
  date: string; // YYYY-MM-DD
  verified_minutes: number;
  unverified_minutes: number;
  app_foreground_minutes: number;
  pages_read: number;
  sessions_count: number;
  strike_events: number;
  cure_events: number;
  streak_qualifies: boolean;
  grace_day_applied?: boolean;
}

export interface LiveWatchParticipantSummary {
  userId: string;
  displayName: string;
  role: 'host' | 'guest';
  verifiedMinutesInRoom: number;
  status: 'reading_calmly' | 'verifying' | 'paused' | 'completed';
  joinedAt: string;
}

export interface LiveWatchSession {
  id: string;
  room_code: string;
  title: string;
  host_user_id: string;
  guest_user_ids: string[];
  started_at: string;
  ended_at: string | null;
  target_minutes: number;
  status: 'active' | 'completed' | 'cancelled';
  host_verified_minutes: number;
  guest_verified_minutes: Record<string, number>;
  participants: LiveWatchParticipantSummary[];
}

export interface SessionDraft {
  id: string;
  user_id: string;
  book_id: string;
  medium: ReadingMedium;
  started_at: string;
  monotonic_start_ms: number;
  start_page: number;
  start_words_on_page?: number;
  start_scan_confidence?: number;
  background_seconds: number;
  focus_transitions: number;
  is_cure_attempt_for?: string | null;
  live_watch_room_id?: string | null;
  random_check_scheduled: boolean;
  random_check_completed: boolean;
  voice_check_result?: {
    result: VerificationResult;
    confidence: number;
    matchedRatio: number;
    wps: number;
    whisperMode: boolean;
    explanation: string;
  } | null;
  comprehension_result?: {
    result: VerificationResult;
    confidence: number;
    explanation: string;
  } | null;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  user_id: string;
  entity: 'book' | 'session' | 'verification_event' | 'tbr' | 'profile' | 'daily_aggregate';
  operation: 'upsert' | 'delete';
  payload: unknown;
  created_at: string;
  attempts: number;
}

export const AddBookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  author: z.string().max(140).default('Unknown Author'),
  isbn: z.string().max(32).nullable().optional(),
  genre: z.array(z.enum(BOOK_GENRES)).min(1, 'Select at least one genre'),
  subgenre: z.array(z.string()).default([]),
  page_count: z.number().int().min(5).max(10000),
  word_count_estimate: z.number().int().min(200).max(5000000).optional(),
  difficulty_band: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  medium_default: z.enum(['physical', 'ebook', 'audio']).default('physical'),
  description: z.string().max(2000).default(''),
  cover_url: z.string().nullable().optional(),
  source: z.enum(['manual', 'OpenLibrary', 'GoogleBooks']).default('manual'),
  status: z.enum(['reading', 'finished', 'tbr', 'paused']).default('reading'),
});
