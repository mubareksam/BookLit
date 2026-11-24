'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, subDays } from 'date-fns';
import {
  Book,
  BookGenre,
  DailyAggregate,
  GENRE_META,
  LiveWatchSession,
  ReadingMedium,
  ReadingSession,
  SessionDraft,
  TBRItem,
  UserProfile,
  UserSettings,
  VerificationEvent,
} from '@/lib/types';
import {
  db,
  deleteUserAccountData,
  enqueueSyncItem,
  ensureDatabaseSeeded,
  exportAllUserDataCsv,
  exportAllUserDataJson,
  flushSyncQueue,
  recordAppForegroundSeconds,
} from '@/lib/db/dexie';
import { DEFAULT_USER_ID, buildSeedData } from '@/lib/db/seed';
import { estimateUserGenreSpeed } from '@/lib/domain/speedModel';
import {
  findCurableStrikeSession,
  scoreReadingSession,
} from '@/lib/domain/verificationEngine';

export type ActiveNavView =
  | 'dashboard'
  | 'library'
  | 'tbr'
  | 'sessions'
  | 'verification'
  | 'stats'
  | 'recommendations'
  | 'live_watch'
  | 'year_in_books'
  | 'how_it_works'
  | 'settings';

export type InteractionProfile = 'desktop' | 'pwa';

interface CompleteSessionPayload {
  draft: SessionDraft;
  endPage: number;
  endWordsOnPage?: number;
  endScanConfidence?: number;
  hasTier1ScanOrImport: boolean;
  overrideElapsedMinutes?: number; // For testing / manual progress import
  notes?: string;
}

interface BooklitContextValue {
  ready: boolean;
  user: UserProfile | null;
  allUsers: UserProfile[];
  books: Book[];
  sessions: ReadingSession[];
  verificationEvents: VerificationEvent[];
  tbrItems: TBRItem[];
  dailyAggregates: DailyAggregate[];
  liveWatchRooms: LiveWatchSession[];
  activeDraft: SessionDraft | null;
  pendingSyncCount: number;
  isOnline: boolean;
  simulateOffline: boolean;
  setSimulateOffline: (val: boolean) => void;
  triggerManualSync: () => Promise<void>;

  // Navigation & UI profile
  activeView: ActiveNavView;
  setActiveView: (v: ActiveNavView) => void;
  interactionProfile: InteractionProfile;
  isCoarsePointerDetected: boolean;
  isStandalonePwa: boolean;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  // Session Runner Modal state
  sessionModalOpen: boolean;
  sessionModalBookId: string | null;
  sessionModalCureTargetId: string | null;
  openSessionFlow: (bookId?: string, cureTargetSessionId?: string | null) => void;
  closeSessionFlow: () => void;
  lastCompletedSession: ReadingSession | null;
  clearLastCompletedSession: () => void;
  showFirstSessionNotificationBanner: boolean;
  dismissFirstSessionNotificationBanner: () => void;

  // Book Detail & Add Book Modal
  selectedBookId: string | null;
  setSelectedBookId: (id: string | null) => void;
  addBookModalOpen: boolean;
  setAddBookModalOpen: (open: boolean) => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;

  // Domain Actions
  updateProfile: (
    patch: Partial<Omit<UserProfile, 'settings_json'>> & {
      settingsPatch?: Partial<UserSettings>;
    }
  ) => Promise<void>;
  signInOrCreateAccount: (params: {
    email: string;
    displayName: string;
    provider: UserProfile['auth_provider'];
    goalType?: UserProfile['reading_goal_type'];
    goalTarget?: number;
    preferredGenres?: BookGenre[];
  }) => Promise<void>;
  switchActiveUser: (userId: string) => Promise<void>;
  resetDemoWorkspace: () => Promise<void>;

  addBook: (input: {
    title: string;
    author: string;
    isbn?: string | null;
    genre: BookGenre[];
    subgenre?: string[];
    page_count: number;
    word_count_estimate?: number;
    difficulty_band: 1 | 2 | 3 | 4 | 5;
    medium_default: ReadingMedium;
    description?: string;
    source?: Book['source'];
    status?: Book['status'];
    sample_passages?: Book['sample_passages'];
  }) => Promise<Book>;
  updateBook: (bookId: string, patch: Partial<Book>) => Promise<void>;

  startSessionDraft: (params: {
    bookId: string;
    medium: ReadingMedium;
    startPage: number;
    startWordsOnPage?: number;
    startScanConfidence?: number;
    isCureAttemptFor?: string | null;
    liveWatchRoomId?: string | null;
    randomCheckScheduled: boolean;
  }) => Promise<SessionDraft>;
  updateSessionDraft: (draftId: string, patch: Partial<SessionDraft>) => Promise<void>;
  discardSessionDraft: (draftId: string) => Promise<void>;
  completeReadingSession: (payload: CompleteSessionPayload) => Promise<ReadingSession>;

  addTbrItem: (params: {
    bookId?: string | null;
    freeTextTitle?: string;
    freeTextAuthor?: string;
    freeTextGenre?: BookGenre;
    plannedStartDate?: string | null;
    reminderEnabled?: boolean;
    notes?: string;
  }) => Promise<void>;
  reorderTbrItems: (orderedIds: string[]) => Promise<void>;
  updateTbrItem: (id: string, patch: Partial<TBRItem>) => Promise<void>;
  promoteTbrToReading: (tbrId: string) => Promise<void>;
  deleteTbrItem: (id: string) => Promise<void>;

  applyStreakInsurance: () => Promise<boolean>;
  exportUserData: (formatType: 'json' | 'csv') => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const BooklitContext = createContext<BooklitContextValue | null>(null);

export function BooklitProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string>(DEFAULT_USER_ID);
  const [activeView, setActiveView] = useState<ActiveNavView>('dashboard');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [isOnlineBrowser, setIsOnlineBrowser] = useState(true);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [isCoarsePointerDetected, setIsCoarsePointerDetected] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionModalBookId, setSessionModalBookId] = useState<string | null>(null);
  const [sessionModalCureTargetId, setSessionModalCureTargetId] = useState<string | null>(null);
  const [lastCompletedSession, setLastCompletedSession] = useState<ReadingSession | null>(null);
  const [showFirstSessionNotificationBanner, setShowFirstSessionNotificationBanner] =
    useState(false);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [addBookModalOpen, setAddBookModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Initialize Dexie seed + URL shortcuts + Service Worker
  useEffect(() => {
    let mounted = true;
    ensureDatabaseSeeded().then((uid) => {
      if (!mounted) return;
      setActiveUserId(uid);
      setReady(true);
    });

    if (typeof window !== 'undefined') {
      setIsOnlineBrowser(navigator.onLine);
      const handleOnline = () => setIsOnlineBrowser(true);
      const handleOffline = () => setIsOnlineBrowser(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Media queries for (pointer: coarse) and standalone display-mode
      const coarseMq = window.matchMedia('(pointer: coarse)');
      const standaloneMq = window.matchMedia('(display-mode: standalone)');
      const updatePointer = () => {
        setIsCoarsePointerDetected(coarseMq.matches || window.innerWidth < 768);
        setIsStandalonePwa(
          standaloneMq.matches ||
            Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone) ||
            window.location.search.includes('pwa=1')
        );
      };
      updatePointer();
      coarseMq.addEventListener('change', updatePointer);
      standaloneMq.addEventListener('change', updatePointer);
      window.addEventListener('resize', updatePointer);

      // Handle manifest shortcut query params
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'start-session') {
        setSessionModalOpen(true);
      } else if (params.get('view') === 'tbr') {
        setActiveView('tbr');
      }

      // Register PWA Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      return () => {
        mounted = false;
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        coarseMq.removeEventListener('change', updatePointer);
        standaloneMq.removeEventListener('change', updatePointer);
        window.removeEventListener('resize', updatePointer);
      };
    }
  }, []);

  const isOnline = isOnlineBrowser && !simulateOffline;

  // Live Dexie reactive queries
  const user = useLiveQuery(
    async () => (ready && db ? (await db.users.get(activeUserId)) ?? null : null),
    [ready, activeUserId],
    null
  );

  const allUsers = useLiveQuery(
    async () => (ready && db ? await db.users.toArray() : []),
    [ready],
    []
  );

  const books = useLiveQuery(
    async () =>
      ready && db
        ? (await db.books.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
        : [],
    [ready, activeUserId],
    []
  );

  const sessions = useLiveQuery(
    async () =>
      ready && db
        ? (await db.sessions.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          )
        : [],
    [ready, activeUserId],
    []
  );

  const verificationEvents = useLiveQuery(
    async () =>
      ready && db
        ? (await db.verificationEvents.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        : [],
    [ready, activeUserId],
    []
  );

  const tbrItems = useLiveQuery(
    async () =>
      ready && db
        ? (await db.tbrItems.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => a.priority - b.priority
          )
        : [],
    [ready, activeUserId],
    []
  );

  const dailyAggregates = useLiveQuery(
    async () =>
      ready && db
        ? (await db.dailyAggregates.where('user_id').equals(activeUserId).toArray()).sort((a, b) =>
            a.date.localeCompare(b.date)
          )
        : [],
    [ready, activeUserId],
    []
  );

  const liveWatchRooms = useLiveQuery(
    async () => (ready && db ? await db.liveWatchSessions.toArray() : []),
    [ready],
    []
  );

  const activeDraft = useLiveQuery(
    async () => {
      if (!ready || !db) return null;
      const drafts = await db.sessionDrafts.where('user_id').equals(activeUserId).toArray();
      return drafts.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0] ?? null;
    },
    [ready, activeUserId],
    null
  );

  const pendingSyncCount = useLiveQuery(
    async () =>
      ready && db ? await db.syncQueue.where('user_id').equals(activeUserId).count() : 0,
    [ready, activeUserId],
    0
  );

  // Apply Dark/Light theme preference to documentElement
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pref = user?.settings_json.themePreference ?? 'system';
    const root = document.documentElement;
    const mediaDark = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const shouldDark = pref === 'dark' || (pref === 'system' && mediaDark.matches);
      root.classList.toggle('dark', shouldDark);
    };
    applyTheme();
    mediaDark.addEventListener('change', applyTheme);
    return () => mediaDark.removeEventListener('change', applyTheme);
  }, [user?.settings_json.themePreference]);

  // Separate In-App Foreground Time Tracking (never conflated with reading session verified minutes)
  useEffect(() => {
    if (!ready || !activeUserId || typeof document === 'undefined') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        recordAppForegroundSeconds(activeUserId, 15).catch(() => {});
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [ready, activeUserId]);

  // Auto-flush offline queue when connectivity returns
  useEffect(() => {
    if (!ready || !isOnline || pendingSyncCount === 0) return;
    flushSyncQueue(activeUserId, simulateOffline).catch(() => {});
  }, [ready, isOnline, pendingSyncCount, activeUserId, simulateOffline]);

  const triggerManualSync = useCallback(async () => {
    await flushSyncQueue(activeUserId, simulateOffline);
  }, [activeUserId, simulateOffline]);

  // Interaction Profile computation: honors user override or branches via (pointer: coarse) / standalone PWA
  const interactionProfile: InteractionProfile = useMemo(() => {
    const override = user?.settings_json.interactionProfileOverride ?? 'auto';
    if (override === 'desktop') return 'desktop';
    if (override === 'pwa') return 'pwa';
    if (isStandalonePwa || isCoarsePointerDetected) return 'pwa';
    return 'desktop';
  }, [user?.settings_json.interactionProfileOverride, isStandalonePwa, isCoarsePointerDetected]);

  // Global Desktop Keyboard Shortcuts: `/` search, `S` start session, `E` end session, `G then D` dashboard
  const lastGKeyTimeRef = useRef<number>(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (inEditable) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        } else {
          setActiveView('library');
        }
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        lastGKeyTimeRef.current = Date.now();
        return;
      }

      if (Date.now() - lastGKeyTimeRef.current < 900) {
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          setActiveView('dashboard');
          lastGKeyTimeRef.current = 0;
          return;
        }
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          setActiveView('library');
          lastGKeyTimeRef.current = 0;
          return;
        }
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          setActiveView('tbr');
          lastGKeyTimeRef.current = 0;
          return;
        }
      }

      if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey && !sessionModalOpen) {
        e.preventDefault();
        setSessionModalOpen(true);
      } else if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey && activeDraft) {
        e.preventDefault();
        setSessionModalBookId(activeDraft.book_id);
        setSessionModalOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sessionModalOpen, activeDraft]);

  const openSessionFlow = useCallback((bookId?: string, cureTargetSessionId?: string | null) => {
    setSessionModalBookId(bookId ?? null);
    setSessionModalCureTargetId(cureTargetSessionId ?? null);
    setSessionModalOpen(true);
  }, []);

  const closeSessionFlow = useCallback(() => {
    setSessionModalOpen(false);
    setSessionModalCureTargetId(null);
  }, []);

  const clearLastCompletedSession = useCallback(() => {
    setLastCompletedSession(null);
  }, []);

  const updateProfile = useCallback(
    async (
      patch: Partial<Omit<UserProfile, 'settings_json'>> & {
        settingsPatch?: Partial<UserSettings>;
      }
    ) => {
      if (!user) return;
      const { settingsPatch, ...rest } = patch;
      const updated: UserProfile = {
        ...user,
        ...rest,
        settings_json: settingsPatch
          ? { ...user.settings_json, ...settingsPatch }
          : user.settings_json,
      };
      await db.users.put(updated);
      await enqueueSyncItem(user.id, 'profile', 'upsert', updated);
      if (isOnline) await flushSyncQueue(user.id, simulateOffline);
    },
    [user, isOnline, simulateOffline]
  );

  const dismissFirstSessionNotificationBanner = useCallback(async () => {
    setShowFirstSessionNotificationBanner(false);
    await updateProfile({
      settingsPatch: { notificationsPromptedAfterFirstSession: true },
    });
  }, [updateProfile]);

  const signInOrCreateAccount = useCallback(
    async (params: {
      email: string;
      displayName: string;
      provider: UserProfile['auth_provider'];
      goalType?: UserProfile['reading_goal_type'];
      goalTarget?: number;
      preferredGenres?: BookGenre[];
    }) => {
      const cleanEmail = params.email.trim().toLowerCase();
      const existing = await db.users.where('email').equals(cleanEmail).first();
      if (existing) {
        window.localStorage.setItem('booklit_active_user_id', existing.id);
        setActiveUserId(existing.id);
        return;
      }

      const seededTemplate = buildSeedData(new Date()).user;
      const newId = `reader-${Date.now().toString(36)}`;
      const freshUser: UserProfile = {
        ...seededTemplate,
        id: newId,
        email: cleanEmail,
        display_name: params.displayName.trim() || cleanEmail.split('@')[0],
        auth_provider: params.provider,
        created_at: new Date().toISOString(),
        reading_goal_type: params.goalType ?? 'minutes_day',
        reading_goal_target: params.goalTarget ?? 30,
        preferred_genres: params.preferredGenres ?? ['literary_fiction', 'general_nonfiction'],
        strike_count: 0,
        streak_count: 0,
        last_verified_session_at: null,
      };

      await db.users.put(freshUser);
      await enqueueSyncItem(newId, 'profile', 'upsert', freshUser);
      window.localStorage.setItem('booklit_active_user_id', newId);
      setActiveUserId(newId);
    },
    []
  );

  const switchActiveUser = useCallback(async (userId: string) => {
    window.localStorage.setItem('booklit_active_user_id', userId);
    setActiveUserId(userId);
  }, []);

  const resetDemoWorkspace = useCallback(async () => {
    await db.delete();
    await db.open();
    const seeded = buildSeedData(new Date());
    await db.users.put(seeded.user);
    await db.books.bulkPut(seeded.books);
    await db.sessions.bulkPut(seeded.sessions);
    await db.verificationEvents.bulkPut(seeded.verificationEvents);
    await db.tbrItems.bulkPut(seeded.tbrItems);
    await db.dailyAggregates.bulkPut(seeded.dailyAggregates);
    await db.liveWatchSessions.bulkPut(seeded.liveWatchSessions);
    window.localStorage.setItem('booklit_active_user_id', seeded.user.id);
    setActiveUserId(seeded.user.id);
  }, []);

  const addBook = useCallback(
    async (input: {
      title: string;
      author: string;
      isbn?: string | null;
      genre: BookGenre[];
      subgenre?: string[];
      page_count: number;
      word_count_estimate?: number;
      difficulty_band: 1 | 2 | 3 | 4 | 5;
      medium_default: ReadingMedium;
      description?: string;
      source?: Book['source'];
      status?: Book['status'];
      sample_passages?: Book['sample_passages'];
    }): Promise<Book> => {
      const primaryGenre = input.genre[0] ?? 'general_nonfiction';
      const wordsDefault =
        input.page_count * (GENRE_META[primaryGenre]?.wordsPerPageDefault ?? 280);
      const nowIso = new Date().toISOString();
      const newBook: Book = {
        id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: activeUserId,
        title: input.title.trim(),
        author: input.author.trim() || 'Unknown Author',
        isbn: input.isbn?.trim() || null,
        genre: input.genre,
        subgenre: input.subgenre ?? [],
        page_count: input.page_count,
        current_page: input.status === 'finished' ? input.page_count : 0,
        word_count_estimate: input.word_count_estimate || wordsDefault,
        difficulty_band: input.difficulty_band,
        cover_url: null,
        description: input.description ?? '',
        source: input.source ?? 'manual',
        status: input.status ?? 'reading',
        medium_default: input.medium_default,
        rating: null,
        finished_at: input.status === 'finished' ? nowIso : null,
        sample_passages: input.sample_passages ?? [],
        created_at: nowIso,
        updated_at: nowIso,
      };

      await db.books.put(newBook);
      await enqueueSyncItem(activeUserId, 'book', 'upsert', newBook);
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
      return newBook;
    },
    [activeUserId, isOnline, simulateOffline]
  );

  const updateBook = useCallback(
    async (bookId: string, patch: Partial<Book>) => {
      const existing = await db.books.get(bookId);
      if (!existing) return;
      const updated: Book = {
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      await db.books.put(updated);
      await enqueueSyncItem(activeUserId, 'book', 'upsert', updated);
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
    },
    [activeUserId, isOnline, simulateOffline]
  );

  const startSessionDraft = useCallback(
    async (params: {
      bookId: string;
      medium: ReadingMedium;
      startPage: number;
      startWordsOnPage?: number;
      startScanConfidence?: number;
      isCureAttemptFor?: string | null;
      liveWatchRoomId?: string | null;
      randomCheckScheduled: boolean;
    }): Promise<SessionDraft> => {
      const nowIso = new Date().toISOString();
      const draft: SessionDraft = {
        id: `draft-${Date.now()}`,
        user_id: activeUserId,
        book_id: params.bookId,
        medium: params.medium,
        started_at: nowIso,
        monotonic_start_ms: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        start_page: params.startPage,
        start_words_on_page: params.startWordsOnPage,
        start_scan_confidence: params.startScanConfidence,
        background_seconds: 0,
        focus_transitions: 0,
        is_cure_attempt_for: params.isCureAttemptFor ?? null,
        live_watch_room_id: params.liveWatchRoomId ?? null,
        random_check_scheduled: params.randomCheckScheduled,
        random_check_completed: false,
        voice_check_result: null,
        comprehension_result: null,
        updated_at: nowIso,
      };
      // Clear older drafts for this user and store new draft offline-first in IndexedDB
      await db.sessionDrafts.where('user_id').equals(activeUserId).delete();
      await db.sessionDrafts.put(draft);
      return draft;
    },
    [activeUserId]
  );

  const updateSessionDraft = useCallback(
    async (draftId: string, patch: Partial<SessionDraft>) => {
      const existing = await db.sessionDrafts.get(draftId);
      if (!existing) return;
      await db.sessionDrafts.put({
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      });
    },
    []
  );

  const discardSessionDraft = useCallback(async (draftId: string) => {
    await db.sessionDrafts.delete(draftId);
  }, []);

  const completeReadingSession = useCallback(
    async (payload: CompleteSessionPayload): Promise<ReadingSession> => {
      const { draft } = payload;
      const book = await db.books.get(draft.book_id);
      if (!book || !user) {
        throw new Error('Book or user missing');
      }

      const endedAt = new Date();
      let startedAtIso = draft.started_at;
      let monotonicSeconds: number | undefined =
        typeof performance !== 'undefined'
          ? Math.max(1, (performance.now() - draft.monotonic_start_ms) / 1000)
          : undefined;

      if (payload.overrideElapsedMinutes && payload.overrideElapsedMinutes > 0) {
        startedAtIso = new Date(
          endedAt.getTime() - payload.overrideElapsedMinutes * 60000
        ).toISOString();
        // When user logs or simulates elapsed minutes explicitly, align monotonic reference unless testing clock anomaly
        monotonicSeconds = payload.overrideElapsedMinutes * 60;
      }

      const booksById = new Map(books.map((b) => [b.id, b]));
      const verifiedHistory = sessions.filter((s) => s.verified && !s.strike_issued);
      const primaryGenre = book.genre[0] ?? 'general_nonfiction';
      const wpmBand = estimateUserGenreSpeed(
        primaryGenre,
        verifiedHistory,
        booksById,
        book.difficulty_band
      );

      const sevenDaysAgoMs = endedAt.getTime() - 7 * 24 * 60 * 60 * 1000;
      const recentEvents7d = verificationEvents.filter(
        (ev) => new Date(ev.created_at).getTime() >= sevenDaysAgoMs
      );
      const recentSessions7d = sessions.filter(
        (s) => new Date(s.ended_at).getTime() >= sevenDaysAgoMs
      );

      const avgWordsPerPage =
        draft.start_words_on_page && payload.endWordsOnPage
          ? Math.round((draft.start_words_on_page + payload.endWordsOnPage) / 2)
          : payload.endWordsOnPage ?? draft.start_words_on_page;

      const scoring = scoreReadingSession({
        medium: draft.medium,
        book,
        wpmBand,
        startedAtIso,
        endedAtIso: endedAt.toISOString(),
        monotonicElapsedSeconds: monotonicSeconds,
        startPage: draft.start_page,
        endPage: payload.endPage,
        wordsPerPageObserved: avgWordsPerPage,
        startScanConfidence: draft.start_scan_confidence,
        endScanConfidence: payload.endScanConfidence,
        hasTier1ScanOrImport: payload.hasTier1ScanOrImport,
        backgroundSeconds: draft.background_seconds,
        focusTransitions: draft.focus_transitions,
        voiceCheck: draft.voice_check_result ?? null,
        comprehensionCheck: draft.comprehension_result ?? null,
        recentVerificationEvents7d: recentEvents7d,
        recentSessions7d,
      });

      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Check 7-Day Strike Cure Mechanic!
      let curedTargetSession: ReadingSession | null = null;
      if (draft.is_cure_attempt_for) {
        const explicitTarget = sessions.find((s) => s.id === draft.is_cure_attempt_for);
        if (
          explicitTarget &&
          explicitTarget.strike_issued &&
          !explicitTarget.cure_session_id &&
          scoring.verified &&
          !scoring.strikeIssued &&
          scoring.actualMinutes >= 10
        ) {
          curedTargetSession = explicitTarget;
        }
      }
      if (!curedTargetSession) {
        curedTargetSession = findCurableStrikeSession(
          {
            verified: scoring.verified,
            strike_issued: scoring.strikeIssued,
            actual_minutes: scoring.actualMinutes,
            ended_at: endedAt.toISOString(),
          },
          sessions
        );
      }

      const newSession: ReadingSession = {
        id: sessionId,
        user_id: activeUserId,
        book_id: book.id,
        medium: draft.medium,
        started_at: startedAtIso,
        ended_at: endedAt.toISOString(),
        start_page: draft.start_page,
        end_page: payload.endPage,
        verified: scoring.verified,
        verification_tier: scoring.verificationTier,
        trust_score: scoring.trustScore,
        predicted_minutes: scoring.predictedMinutes,
        actual_minutes: scoring.actualMinutes,
        wpm_observed: scoring.wpmObserved,
        wpm_expected_range_low: wpmBand.lowWpm,
        wpm_expected_range_high: wpmBand.highWpm,
        flags_json: scoring.flags,
        strike_issued: scoring.strikeIssued,
        cure_session_id: null,
        is_cure_for_session_id: curedTargetSession?.id ?? null,
        synced: isOnline,
        notes: payload.notes,
      };

      const createdEvents: VerificationEvent[] = [];
      if (payload.hasTier1ScanOrImport) {
        createdEvents.push({
          id: `ve-s-${Date.now()}-1`,
          user_id: activeUserId,
          session_id: sessionId,
          type: 'scan_start',
          result: 'pass',
          confidence: draft.start_scan_confidence ?? 0.88,
          metadata_json: {
            page: draft.start_page,
            wordsEstimated: draft.start_words_on_page ?? 275,
          },
          created_at: startedAtIso,
        });
        createdEvents.push({
          id: `ve-e-${Date.now()}-2`,
          user_id: activeUserId,
          session_id: sessionId,
          type: 'scan_end',
          result: (payload.endScanConfidence ?? 0.88) >= 0.5 ? 'pass' : 'inconclusive',
          confidence: payload.endScanConfidence ?? 0.88,
          metadata_json: {
            page: payload.endPage,
            wordsEstimated: payload.endWordsOnPage ?? 275,
          },
          created_at: endedAt.toISOString(),
        });
      }

      if (draft.voice_check_result) {
        createdEvents.push({
          id: `ve-v-${Date.now()}-3`,
          user_id: activeUserId,
          session_id: sessionId,
          type: 'voice_check',
          result: draft.voice_check_result.result,
          confidence: draft.voice_check_result.confidence,
          metadata_json: {
            matchedRatio: draft.voice_check_result.matchedRatio,
            wps: draft.voice_check_result.wps,
            whisperMode: draft.voice_check_result.whisperMode,
            audioRetained: user.settings_json.retainAudioForDebug,
          },
          created_at: endedAt.toISOString(),
        });
      }

      if (draft.comprehension_result) {
        createdEvents.push({
          id: `ve-c-${Date.now()}-4`,
          user_id: activeUserId,
          session_id: sessionId,
          type: 'comprehension_check',
          result: draft.comprehension_result.result,
          confidence: draft.comprehension_result.confidence,
          metadata_json: {
            explanation: draft.comprehension_result.explanation,
          },
          created_at: endedAt.toISOString(),
        });
      }

      if (draft.focus_transitions > 0) {
        createdEvents.push({
          id: `ve-f-${Date.now()}-5`,
          user_id: activeUserId,
          session_id: sessionId,
          type: 'focus_return',
          result: 'pass',
          confidence: 0.95,
          metadata_json: {
            focusTransitions: draft.focus_transitions,
            backgroundSeconds: draft.background_seconds,
          },
          created_at: endedAt.toISOString(),
        });
      }

      // Persist everything atomically in IndexedDB first (offline-first guarantee!)
      const todayStr = format(endedAt, 'yyyy-MM-dd');
      const aggId = `${activeUserId}_${todayStr}`;
      const existingAgg = await db.dailyAggregates.get(aggId);

      const creditedMinutes = scoring.verified
        ? scoring.actualMinutes * scoring.creditMultiplier
        : 0;
      const pagesRead = Math.max(0, payload.endPage - draft.start_page);

      const updatedAgg: DailyAggregate = existingAgg
        ? {
            ...existingAgg,
            verified_minutes:
              Math.round((existingAgg.verified_minutes + creditedMinutes) * 10) / 10,
            unverified_minutes:
              Math.round(
                (existingAgg.unverified_minutes + (scoring.verified ? 0 : scoring.actualMinutes)) *
                  10
              ) / 10,
            pages_read: existingAgg.pages_read + (scoring.verified ? pagesRead : 0),
            sessions_count: existingAgg.sessions_count + 1,
            strike_events: existingAgg.strike_events + (scoring.strikeIssued ? 1 : 0),
            cure_events: existingAgg.cure_events + (curedTargetSession ? 1 : 0),
            streak_qualifies:
              !scoring.strikeIssued &&
              existingAgg.verified_minutes + creditedMinutes >= 15,
          }
        : {
            id: aggId,
            user_id: activeUserId,
            date: todayStr,
            verified_minutes: Math.round(creditedMinutes * 10) / 10,
            unverified_minutes: scoring.verified ? 0 : scoring.actualMinutes,
            app_foreground_minutes: 1.0,
            pages_read: scoring.verified ? pagesRead : 0,
            sessions_count: 1,
            strike_events: scoring.strikeIssued ? 1 : 0,
            cure_events: curedTargetSession ? 1 : 0,
            streak_qualifies: !scoring.strikeIssued && creditedMinutes >= 15,
          };

      // Update book progress
      const isNowFinished = payload.endPage >= book.page_count;
      const updatedBook: Book = {
        ...book,
        current_page: Math.min(book.page_count, Math.max(book.current_page, payload.endPage)),
        status: isNowFinished ? 'finished' : book.status === 'tbr' ? 'reading' : book.status,
        finished_at: isNowFinished ? endedAt.toISOString() : book.finished_at,
        updated_at: endedAt.toISOString(),
      };

      // Recompute active uncured strike count & streak
      let newStrikeCount = user.strike_count;
      if (scoring.strikeIssued) newStrikeCount += 1;
      if (curedTargetSession) newStrikeCount = Math.max(0, newStrikeCount - 1);

      const yesterdayStr = format(subDays(endedAt, 1), 'yyyy-MM-dd');
      const hadTodayQualifiedBefore = Boolean(existingAgg?.streak_qualifies);
      let newStreakCount = user.streak_count;
      if (!hadTodayQualifiedBefore && updatedAgg.streak_qualifies) {
        const yesterdayAgg = await db.dailyAggregates.get(`${activeUserId}_${yesterdayStr}`);
        newStreakCount = yesterdayAgg?.streak_qualifies ? user.streak_count + 1 : Math.max(1, user.streak_count);
      } else if (scoring.strikeIssued && newStreakCount > 0) {
        // Strike reduces streak credit for the day without erasing historical verified minutes
        newStreakCount = Math.max(0, user.streak_count - 1);
      } else if (curedTargetSession) {
        newStreakCount = user.streak_count + 1;
      }

      const updatedUser: UserProfile = {
        ...user,
        strike_count: newStrikeCount,
        streak_count: newStreakCount,
        last_verified_session_at: scoring.verified
          ? endedAt.toISOString()
          : user.last_verified_session_at,
      };

      await db.transaction(
        'rw',
        [
          db.sessions,
          db.verificationEvents,
          db.dailyAggregates,
          db.books,
          db.users,
          db.sessionDrafts,
        ],
        async () => {
          await db.sessions.put(newSession);
          if (curedTargetSession) {
            await db.sessions.put({
              ...curedTargetSession,
              cure_session_id: sessionId,
              strike_cured_at: endedAt.toISOString(),
            });
          }
          if (createdEvents.length > 0) {
            await db.verificationEvents.bulkPut(createdEvents);
          }
          await db.dailyAggregates.put(updatedAgg);
          await db.books.put(updatedBook);
          await db.users.put(updatedUser);
          await db.sessionDrafts.delete(draft.id);
        }
      );

      // Enqueue for background sync
      await enqueueSyncItem(activeUserId, 'session', 'upsert', newSession);
      await enqueueSyncItem(activeUserId, 'book', 'upsert', updatedBook);
      await enqueueSyncItem(activeUserId, 'daily_aggregate', 'upsert', updatedAgg);
      await enqueueSyncItem(activeUserId, 'profile', 'upsert', updatedUser);
      for (const ev of createdEvents) {
        await enqueueSyncItem(activeUserId, 'verification_event', 'upsert', ev);
      }

      if (isOnline) {
        await flushSyncQueue(activeUserId, simulateOffline);
      }

      // If session was part of a Live Watch room, broadcast aggregate verified minutes only
      if (draft.live_watch_room_id && scoring.verified && isOnline) {
        const lwRoom = await db.liveWatchSessions.get(draft.live_watch_room_id);
        if (lwRoom) {
          fetch('/api/live-watch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'heartbeat',
              roomCode: lwRoom.room_code,
              userId: activeUserId,
              displayName: user.display_name,
              verifiedMinutesDelta: creditedMinutes,
              status: 'reading_calmly',
            }),
          }).catch(() => {});
        }
      }

      setLastCompletedSession(newSession);

      // Prompt gently for reminder notifications ONLY after completing a session, never on first visit!
      if (!user.settings_json.notificationsPromptedAfterFirstSession) {
        setShowFirstSessionNotificationBanner(true);
      }

      return newSession;
    },
    [activeUserId, books, isOnline, sessions, simulateOffline, user, verificationEvents]
  );

  const addTbrItem = useCallback(
    async (params: {
      bookId?: string | null;
      freeTextTitle?: string;
      freeTextAuthor?: string;
      freeTextGenre?: BookGenre;
      plannedStartDate?: string | null;
      reminderEnabled?: boolean;
      notes?: string;
    }) => {
      const maxPrio = tbrItems.reduce((m, item) => Math.max(m, item.priority), 0);
      const item: TBRItem = {
        id: `tbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: activeUserId,
        book_id: params.bookId ?? null,
        free_text_title: params.freeTextTitle?.trim(),
        free_text_author: params.freeTextAuthor?.trim(),
        free_text_genre: params.freeTextGenre,
        priority: maxPrio + 1,
        planned_start_date: params.plannedStartDate ?? null,
        reminder_enabled: Boolean(params.reminderEnabled),
        completed_at: null,
        notes: params.notes?.trim() ?? '',
        created_at: new Date().toISOString(),
      };
      await db.tbrItems.put(item);
      await enqueueSyncItem(activeUserId, 'tbr', 'upsert', item);
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
    },
    [activeUserId, isOnline, simulateOffline, tbrItems]
  );

  const reorderTbrItems = useCallback(
    async (orderedIds: string[]) => {
      const updates: TBRItem[] = [];
      orderedIds.forEach((id, idx) => {
        const found = tbrItems.find((t) => t.id === id);
        if (found) {
          updates.push({ ...found, priority: idx + 1 });
        }
      });
      await db.tbrItems.bulkPut(updates);
      for (const u of updates) {
        await enqueueSyncItem(activeUserId, 'tbr', 'upsert', u);
      }
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
    },
    [activeUserId, isOnline, simulateOffline, tbrItems]
  );

  const updateTbrItem = useCallback(
    async (id: string, patch: Partial<TBRItem>) => {
      const existing = await db.tbrItems.get(id);
      if (!existing) return;
      const updated = { ...existing, ...patch };
      await db.tbrItems.put(updated);
      await enqueueSyncItem(activeUserId, 'tbr', 'upsert', updated);
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
    },
    [activeUserId, isOnline, simulateOffline]
  );

  const promoteTbrToReading = useCallback(
    async (tbrId: string) => {
      const item = await db.tbrItems.get(tbrId);
      if (!item) return;

      if (item.book_id) {
        await updateBook(item.book_id, { status: 'reading' });
      } else if (item.free_text_title) {
        await addBook({
          title: item.free_text_title,
          author: item.free_text_author || 'Unknown Author',
          genre: [item.free_text_genre || 'general_nonfiction'],
          page_count: 280,
          difficulty_band: 3,
          medium_default: 'physical',
          status: 'reading',
        });
      }

      const completed = { ...item, completed_at: new Date().toISOString() };
      await db.tbrItems.put(completed);
      await enqueueSyncItem(activeUserId, 'tbr', 'upsert', completed);
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
    },
    [activeUserId, addBook, isOnline, simulateOffline, updateBook]
  );

  const deleteTbrItem = useCallback(
    async (id: string) => {
      await db.tbrItems.delete(id);
      await enqueueSyncItem(activeUserId, 'tbr', 'delete', { id });
      if (isOnline) await flushSyncQueue(activeUserId, simulateOffline);
    },
    [activeUserId, isOnline, simulateOffline]
  );

  const applyStreakInsurance = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const currentMonth = format(new Date(), 'yyyy-MM');
    if (user.settings_json.streakInsuranceLastUsedMonth === currentMonth) {
      return false;
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const aggId = `${activeUserId}_${todayStr}`;
    const existing = await db.dailyAggregates.get(aggId);
    const updatedAgg: DailyAggregate = existing
      ? { ...existing, streak_qualifies: true, grace_day_applied: true }
      : {
          id: aggId,
          user_id: activeUserId,
          date: todayStr,
          verified_minutes: 0,
          unverified_minutes: 0,
          app_foreground_minutes: 1,
          pages_read: 0,
          sessions_count: 0,
          strike_events: 0,
          cure_events: 0,
          streak_qualifies: true,
          grace_day_applied: true,
        };

    await db.dailyAggregates.put(updatedAgg);
    await updateProfile({
      streak_count: Math.max(1, user.streak_count),
      settingsPatch: { streakInsuranceLastUsedMonth: currentMonth },
    });
    return true;
  }, [activeUserId, updateProfile, user]);

  const exportUserData = useCallback(
    async (formatType: 'json' | 'csv') => {
      const content =
        formatType === 'json'
          ? await exportAllUserDataJson(activeUserId)
          : await exportAllUserDataCsv(activeUserId);

      const mime = formatType === 'json' ? 'application/json' : 'text/csv;charset=utf-8;';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booklit-reading-data-${format(new Date(), 'yyyy-MM-dd')}.${formatType}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [activeUserId]
  );

  const deleteAccount = useCallback(async () => {
    await deleteUserAccountData(activeUserId);
    const remaining = await db.users.toArray();
    if (remaining.length > 0) {
      window.localStorage.setItem('booklit_active_user_id', remaining[0].id);
      setActiveUserId(remaining[0].id);
    } else {
      // Create clean anonymous guest profile so app remains usable immediately
      await signInOrCreateAccount({
        email: 'guest@local.booklit',
        displayName: 'New Reader',
        provider: 'guest_local',
      });
    }
  }, [activeUserId, signInOrCreateAccount]);

  const value: BooklitContextValue = {
    ready,
    user,
    allUsers,
    books,
    sessions,
    verificationEvents,
    tbrItems,
    dailyAggregates,
    liveWatchRooms,
    activeDraft,
    pendingSyncCount,
    isOnline,
    simulateOffline,
    setSimulateOffline,
    triggerManualSync,

    activeView,
    setActiveView,
    interactionProfile,
    isCoarsePointerDetected,
    isStandalonePwa,
    globalSearchQuery,
    setGlobalSearchQuery,
    searchInputRef,

    sessionModalOpen,
    sessionModalBookId,
    sessionModalCureTargetId,
    openSessionFlow,
    closeSessionFlow,
    lastCompletedSession,
    clearLastCompletedSession,
    showFirstSessionNotificationBanner,
    dismissFirstSessionNotificationBanner,

    selectedBookId,
    setSelectedBookId,
    addBookModalOpen,
    setAddBookModalOpen,
    authModalOpen,
    setAuthModalOpen,

    updateProfile,
    signInOrCreateAccount,
    switchActiveUser,
    resetDemoWorkspace,
    addBook,
    updateBook,
    startSessionDraft,
    updateSessionDraft,
    discardSessionDraft,
    completeReadingSession,
    addTbrItem,
    reorderTbrItems,
    updateTbrItem,
    promoteTbrToReading,
    deleteTbrItem,
    applyStreakInsurance,
    exportUserData,
    deleteAccount,
  };

  return <BooklitContext.Provider value={value}>{children}</BooklitContext.Provider>;
}

export function useBooklit() {
  const ctx = useContext(BooklitContext);
  if (!ctx) {
    throw new Error('useBooklit must be used inside BooklitProvider');
  }
  return ctx;
}
