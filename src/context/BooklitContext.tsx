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
  ActivityFeedEvent,
  Book,
  BookGenre,
  DailyAggregate,
  GENRE_META,
  PublicReaderProfile,
  ReadingChallenge,
  ReadingDuel,
  ReadingGoalType,
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
  exportAllUserDataCsv,
  exportAllUserDataJson,
  flushSyncQueue,
  hydrateUserSnapshotIntoDexie,
  recordAppForegroundSeconds,
} from '@/lib/db/dexie';
import { estimateUserGenreSpeed } from '@/lib/domain/speedModel';
import { findCurableStrikeSession, scoreReadingSession } from '@/lib/domain/verificationEngine';

export type ActiveNavView =
  | 'dashboard'
  | 'challenges'
  | 'library'
  | 'tbr'
  | 'sessions'
  | 'verification'
  | 'stats'
  | 'recommendations'
  | 'live_watch'
  | 'settings';

export type InteractionProfile = 'desktop' | 'pwa';

interface CompleteSessionPayload {
  draft: SessionDraft;
  endPage: number;
  endWordsOnPage?: number;
  endScanConfidence?: number;
  endFrameSignature?: string | null;
  endScannedLive?: boolean;
  hasTier1ScanOrImport: boolean;
  strictChallengeMode?: boolean;
  notes?: string;
}

interface BooklitContextValue {
  ready: boolean;
  user: UserProfile | null;
  books: Book[];
  sessions: ReadingSession[];
  verificationEvents: VerificationEvent[];
  tbrItems: TBRItem[];
  dailyAggregates: DailyAggregate[];
  challenges: ReadingChallenge[];
  duels: ReadingDuel[];
  activityFeed: ActivityFeedEvent[];
  readers: PublicReaderProfile[];
  mySocialProfile: PublicReaderProfile | null;
  activeDraft: SessionDraft | null;
  pendingSyncCount: number;
  isOnline: boolean;
  triggerManualSync: () => Promise<void>;

  activeView: ActiveNavView;
  setActiveView: (v: ActiveNavView) => void;
  interactionProfile: InteractionProfile;
  isStandalonePwa: boolean;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  sessionModalOpen: boolean;
  sessionModalBookId: string | null;
  sessionModalCureTargetId: string | null;
  sessionModalChallengeId: string | null;
  sessionModalDuelId: string | null;
  openSessionFlow: (
    bookId?: string,
    cureTargetSessionId?: string | null,
    challengeId?: string | null,
    duelId?: string | null
  ) => void;
  closeSessionFlow: () => void;
  showFirstSessionNotificationBanner: boolean;
  dismissFirstSessionNotificationBanner: () => void;

  selectedBookId: string | null;
  setSelectedBookId: (id: string | null) => void;
  selectedReaderUsername: string | null;
  setSelectedReaderUsername: (username: string | null) => void;
  addBookModalOpen: boolean;
  setAddBookModalOpen: (open: boolean) => void;

  // Auth Actions
  registerAccount: (params: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    goalType: ReadingGoalType;
    goalTarget: number;
    preferredGenres: BookGenre[];
  }) => Promise<{ ok: boolean; error?: string }>;
  signInAccount: (params: {
    identifier: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signOutAccount: () => Promise<void>;

  // Domain Actions
  updateProfile: (
    patch: Partial<Omit<UserProfile, 'settings_json'>> & {
      settingsPatch?: Partial<UserSettings>;
    }
  ) => Promise<void>;

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
    startFrameSignature?: string | null;
    startScannedLive?: boolean;
    startExtractedSnippet?: string;
    isCureAttemptFor?: string | null;
    liveWatchRoomId?: string | null;
    challengeId?: string | null;
    duelId?: string | null;
    randomCheckScheduled: boolean;
  }) => Promise<SessionDraft>;
  updateSessionDraft: (draftId: string, patch: Partial<SessionDraft>) => Promise<void>;
  discardSessionDraft: (draftId: string) => Promise<void>;
  completeReadingSession: (payload: CompleteSessionPayload) => Promise<ReadingSession>;

  // Challenges, 1v1 Duels & Social
  refreshChallenges: () => Promise<void>;
  refreshSocialAndDuels: (searchQuery?: string) => Promise<void>;
  createChallenge: (params: {
    title: string;
    description: string;
    metric: 'verified_minutes' | 'verified_pages';
    targetValue: number;
    durationDays: number;
    visibility: 'public' | 'private';
    strictVerification: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  joinChallenge: (params: {
    challengeId?: string;
    inviteCode?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  createDuel: (params: {
    title?: string;
    metric: 'verified_minutes' | 'verified_pages';
    targetValue: number;
    durationHours: number;
    invitedUsername?: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  acceptDuel: (params: {
    duelId?: string;
    inviteCode?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  declineDuel: (duelId: string) => Promise<void>;
  toggleFollowReader: (targetUserId: string) => Promise<void>;

  // TBR
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
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveNavView>('dashboard');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [isCoarseOrMobile, setIsCoarseOrMobile] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);

  const [challenges, setChallenges] = useState<ReadingChallenge[]>([]);
  const [duels, setDuels] = useState<ReadingDuel[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedEvent[]>([]);
  const [readers, setReaders] = useState<PublicReaderProfile[]>([]);
  const [mySocialProfile, setMySocialProfile] = useState<PublicReaderProfile | null>(null);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionModalBookId, setSessionModalBookId] = useState<string | null>(null);
  const [sessionModalCureTargetId, setSessionModalCureTargetId] = useState<string | null>(null);
  const [sessionModalChallengeId, setSessionModalChallengeId] = useState<string | null>(null);
  const [sessionModalDuelId, setSessionModalDuelId] = useState<string | null>(null);
  const [showFirstSessionNotificationBanner, setShowFirstSessionNotificationBanner] =
    useState(false);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedReaderUsername, setSelectedReaderUsername] = useState<string | null>(null);
  const [addBookModalOpen, setAddBookModalOpen] = useState(false);

  // Check active session cookie on load (or offline cached profile if offline)
  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            await hydrateUserSnapshotIntoDexie(data.user, data.snapshot);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('booklit_last_auth_uid', data.user.id);
            }
            if (mounted) setActiveUserId(data.user.id);
          } else {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('booklit_last_auth_uid');
            }
            if (mounted) setActiveUserId(null);
          }
        }
      } catch {
        // Offline boot: check if a real authenticated user was previously stored locally
        if (typeof window !== 'undefined') {
          const lastUid = window.localStorage.getItem('booklit_last_auth_uid');
          if (lastUid && db) {
            const cached = await db.users.get(lastUid);
            if (cached && mounted) setActiveUserId(cached.id);
          }
        }
      } finally {
        if (mounted) setReady(true);
      }
    }

    bootstrapAuth();

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      const coarseMq = window.matchMedia('(pointer: coarse)');
      const standaloneMq = window.matchMedia('(display-mode: standalone)');
      const updateEnv = () => {
        const standalone =
          standaloneMq.matches ||
          Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone) ||
          window.location.search.includes('pwa=1');
        setIsStandalonePwa(standalone);
        setIsCoarseOrMobile(standalone || coarseMq.matches || window.innerWidth < 768);
      };
      updateEnv();
      coarseMq.addEventListener('change', updateEnv);
      standaloneMq.addEventListener('change', updateEnv);
      window.addEventListener('resize', updateEnv);

      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'start-session') setSessionModalOpen(true);
      else if (params.get('view') === 'tbr') setActiveView('tbr');

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      return () => {
        mounted = false;
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        coarseMq.removeEventListener('change', updateEnv);
        standaloneMq.removeEventListener('change', updateEnv);
        window.removeEventListener('resize', updateEnv);
      };
    }
  }, []);

  const user = useLiveQuery(
    async () =>
      ready && activeUserId && db ? (await db.users.get(activeUserId)) ?? null : null,
    [ready, activeUserId],
    null
  );

  const books = useLiveQuery(
    async () =>
      ready && activeUserId && db
        ? (await db.books.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
        : [],
    [ready, activeUserId],
    []
  );

  const sessions = useLiveQuery(
    async () =>
      ready && activeUserId && db
        ? (await db.sessions.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          )
        : [],
    [ready, activeUserId],
    []
  );

  const verificationEvents = useLiveQuery(
    async () =>
      ready && activeUserId && db
        ? (await db.verificationEvents.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        : [],
    [ready, activeUserId],
    []
  );

  const tbrItems = useLiveQuery(
    async () =>
      ready && activeUserId && db
        ? (await db.tbrItems.where('user_id').equals(activeUserId).toArray()).sort(
            (a, b) => a.priority - b.priority
          )
        : [],
    [ready, activeUserId],
    []
  );

  const dailyAggregates = useLiveQuery(
    async () =>
      ready && activeUserId && db
        ? (await db.dailyAggregates.where('user_id').equals(activeUserId).toArray()).sort((a, b) =>
            a.date.localeCompare(b.date)
          )
        : [],
    [ready, activeUserId],
    []
  );

  const activeDraft = useLiveQuery(
    async () => {
      if (!ready || !activeUserId || !db) return null;
      const drafts = await db.sessionDrafts.where('user_id').equals(activeUserId).toArray();
      return (
        drafts.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0] ?? null
      );
    },
    [ready, activeUserId],
    null
  );

  const pendingSyncCount = useLiveQuery(
    async () =>
      ready && activeUserId && db
        ? await db.syncQueue.where('user_id').equals(activeUserId).count()
        : 0,
    [ready, activeUserId],
    0
  );

  const refreshChallenges = useCallback(async () => {
    if (!activeUserId || !isOnline) return;
    try {
      const res = await fetch('/api/challenges');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.challenges)) setChallenges(data.challenges);
      }
    } catch {
      // Offline safe
    }
  }, [activeUserId, isOnline]);

  const refreshSocialAndDuels = useCallback(
    async (searchQuery?: string) => {
      if (!activeUserId || !isOnline) return;
      try {
        const qUrl = searchQuery?.trim()
          ? `/api/social?q=${encodeURIComponent(searchQuery.trim())}`
          : '/api/social';
        const [duelsRes, socialRes] = await Promise.all([
          fetch('/api/duels'),
          fetch(qUrl),
        ]);
        if (duelsRes.ok) {
          const dData = await duelsRes.json();
          if (Array.isArray(dData.duels)) setDuels(dData.duels);
        }
        if (socialRes.ok) {
          const sData = await socialRes.json();
          if (sData.myProfile) setMySocialProfile(sData.myProfile);
          if (Array.isArray(sData.readers)) setReaders(sData.readers);
          if (Array.isArray(sData.activityFeed)) setActivityFeed(sData.activityFeed);
        }
      } catch {
        // Offline safe
      }
    },
    [activeUserId, isOnline]
  );

  useEffect(() => {
    if (activeUserId && isOnline) {
      refreshChallenges();
      refreshSocialAndDuels();
    } else if (!activeUserId) {
      setChallenges([]);
      setDuels([]);
      setActivityFeed([]);
      setReaders([]);
      setMySocialProfile(null);
    }
  }, [activeUserId, isOnline, refreshChallenges, refreshSocialAndDuels]);

  // Theme preference
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

  // Separate In-App Foreground Usage Timer
  useEffect(() => {
    if (!ready || !activeUserId || typeof document === 'undefined') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        recordAppForegroundSeconds(activeUserId, 15).catch(() => {});
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [ready, activeUserId]);

  // Auto-flush offline queue
  useEffect(() => {
    if (!ready || !activeUserId || !isOnline || pendingSyncCount === 0) return;
    flushSyncQueue(activeUserId).catch(() => {});
  }, [ready, activeUserId, isOnline, pendingSyncCount]);

  const triggerManualSync = useCallback(async () => {
    if (!activeUserId) return;
    await flushSyncQueue(activeUserId);
  }, [activeUserId]);

  // Strict automatic interaction profile: Installed PWA renders PWA UI; Browser renders Web UI
  const interactionProfile: InteractionProfile = useMemo(
    () => (isStandalonePwa ? 'pwa' : 'desktop'),
    [isStandalonePwa]
  );

  // Desktop keyboard shortcuts
  const lastGKeyTimeRef = useRef<number>(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !activeUserId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (inEditable) {
        if (e.key === 'Escape') target.blur();
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        if (searchInputRef.current) searchInputRef.current.focus();
        else setActiveView('library');
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
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          setActiveView('challenges');
          lastGKeyTimeRef.current = 0;
          return;
        }
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          setActiveView('library');
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
  }, [activeUserId, sessionModalOpen, activeDraft]);

  const registerAccount = useCallback(
    async (params: {
      email: string;
      username: string;
      displayName: string;
      password: string;
      goalType: ReadingGoalType;
      goalTarget: number;
      preferredGenres: BookGenre[];
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const tz =
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
            : 'UTC';
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...params, timezone: tz }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Registration failed' };

        await hydrateUserSnapshotIntoDexie(data.user, data.snapshot);
        window.localStorage.setItem('booklit_last_auth_uid', data.user.id);
        setActiveUserId(data.user.id);
        setActiveView('dashboard');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while creating account.' };
      }
    },
    []
  );

  const signInAccount = useCallback(
    async (params: {
      identifier: string;
      password: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Invalid credentials' };

        await hydrateUserSnapshotIntoDexie(data.user, data.snapshot);
        window.localStorage.setItem('booklit_last_auth_uid', data.user.id);
        setActiveUserId(data.user.id);
        setActiveView('dashboard');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while signing in.' };
      }
    },
    []
  );

  const signOutAccount = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('booklit_last_auth_uid');
    }
    setActiveUserId(null);
    setChallenges([]);
  }, []);

  const openSessionFlow = useCallback(
    (
      bookId?: string,
      cureTargetSessionId?: string | null,
      challengeId?: string | null,
      duelId?: string | null
    ) => {
      setSessionModalBookId(bookId ?? null);
      setSessionModalCureTargetId(cureTargetSessionId ?? null);
      setSessionModalChallengeId(challengeId ?? null);
      setSessionModalDuelId(duelId ?? null);
      setSessionModalOpen(true);
    },
    []
  );

  const closeSessionFlow = useCallback(() => {
    setSessionModalOpen(false);
    setSessionModalCureTargetId(null);
    setSessionModalChallengeId(null);
    setSessionModalDuelId(null);
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
      if (isOnline) await flushSyncQueue(user.id);
    },
    [user, isOnline]
  );

  const dismissFirstSessionNotificationBanner = useCallback(async () => {
    setShowFirstSessionNotificationBanner(false);
    await updateProfile({
      settingsPatch: { notificationsPromptedAfterFirstSession: true },
    });
  }, [updateProfile]);

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
      if (!activeUserId) throw new Error('Sign in required');
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
      if (isOnline) await flushSyncQueue(activeUserId);
      return newBook;
    },
    [activeUserId, isOnline]
  );

  const updateBook = useCallback(
    async (bookId: string, patch: Partial<Book>) => {
      if (!activeUserId) return;
      const existing = await db.books.get(bookId);
      if (!existing) return;
      const updated: Book = {
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      await db.books.put(updated);
      await enqueueSyncItem(activeUserId, 'book', 'upsert', updated);
      if (isOnline) await flushSyncQueue(activeUserId);
    },
    [activeUserId, isOnline]
  );

  const startSessionDraft = useCallback(
    async (params: {
      bookId: string;
      medium: ReadingMedium;
      startPage: number;
      startWordsOnPage?: number;
      startScanConfidence?: number;
      startFrameSignature?: string | null;
      startScannedLive?: boolean;
      startExtractedSnippet?: string;
      isCureAttemptFor?: string | null;
      liveWatchRoomId?: string | null;
      challengeId?: string | null;
      duelId?: string | null;
      randomCheckScheduled: boolean;
    }): Promise<SessionDraft> => {
      if (!activeUserId) throw new Error('Sign in required');
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
        start_frame_signature: params.startFrameSignature ?? null,
        start_scanned_live: Boolean(params.startScannedLive),
        start_extracted_snippet: params.startExtractedSnippet,
        background_seconds: 0,
        focus_transitions: 0,
        is_cure_attempt_for: params.isCureAttemptFor ?? null,
        live_watch_room_id: params.liveWatchRoomId ?? null,
        challenge_id: params.challengeId ?? null,
        duel_id: params.duelId ?? null,
        random_check_scheduled: params.randomCheckScheduled,
        random_check_completed: false,
        voice_check_result: null,
        comprehension_result: null,
        updated_at: nowIso,
      };
      await db.sessionDrafts.where('user_id').equals(activeUserId).delete();
      await db.sessionDrafts.put(draft);
      return draft;
    },
    [activeUserId]
  );

  const updateSessionDraft = useCallback(async (draftId: string, patch: Partial<SessionDraft>) => {
    const existing = await db.sessionDrafts.get(draftId);
    if (!existing) return;
    await db.sessionDrafts.put({
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    });
  }, []);

  const discardSessionDraft = useCallback(async (draftId: string) => {
    await db.sessionDrafts.delete(draftId);
  }, []);

  const completeReadingSession = useCallback(
    async (payload: CompleteSessionPayload): Promise<ReadingSession> => {
      if (!activeUserId || !user) throw new Error('Sign in required');
      const { draft } = payload;
      const book = await db.books.get(draft.book_id);
      if (!book) throw new Error('Book missing');

      const endedAt = new Date();
      const startedAtIso = draft.started_at;
      const monotonicSeconds =
        typeof performance !== 'undefined'
          ? Math.max(1, (performance.now() - draft.monotonic_start_ms) / 1000)
          : undefined;

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
        liveCameraStart: draft.start_scanned_live,
        liveCameraEnd: payload.endScannedLive,
        startFrameSignature: draft.start_frame_signature,
        endFrameSignature: payload.endFrameSignature,
        strictChallengeMode: payload.strictChallengeMode,
        backgroundSeconds: draft.background_seconds,
        focusTransitions: draft.focus_transitions,
        voiceCheck: draft.voice_check_result ?? null,
        comprehensionCheck: draft.comprehension_result ?? null,
        recentVerificationEvents7d: recentEvents7d,
        recentSessions7d,
      });

      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

      const liveBoth = Boolean(draft.start_scanned_live && payload.endScannedLive);

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
        live_camera_verified: liveBoth,
        challenge_eligible: scoring.challengeEligible,
        challenge_id: draft.challenge_id ?? null,
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
            liveCamera: Boolean(draft.start_scanned_live),
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
            liveCamera: Boolean(payload.endScannedLive),
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
            rmsVoiceDetected: draft.voice_check_result.rmsVoiceDetected,
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
          metadata_json: {},
          created_at: endedAt.toISOString(),
        });
      }

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
              !scoring.strikeIssued && existingAgg.verified_minutes + creditedMinutes >= 15,
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

      const isNowFinished = payload.endPage >= book.page_count;
      const updatedBook: Book = {
        ...book,
        current_page: Math.min(book.page_count, Math.max(book.current_page, payload.endPage)),
        status: isNowFinished ? 'finished' : book.status === 'tbr' ? 'reading' : book.status,
        finished_at: isNowFinished ? endedAt.toISOString() : book.finished_at,
        updated_at: endedAt.toISOString(),
      };

      let newStrikeCount = user.strike_count;
      if (scoring.strikeIssued) newStrikeCount += 1;
      if (curedTargetSession) newStrikeCount = Math.max(0, newStrikeCount - 1);

      const yesterdayStr = format(subDays(endedAt, 1), 'yyyy-MM-dd');
      const hadTodayQualifiedBefore = Boolean(existingAgg?.streak_qualifies);
      let newStreakCount = user.streak_count;
      if (!hadTodayQualifiedBefore && updatedAgg.streak_qualifies) {
        const yesterdayAgg = await db.dailyAggregates.get(`${activeUserId}_${yesterdayStr}`);
        newStreakCount = yesterdayAgg?.streak_qualifies
          ? user.streak_count + 1
          : Math.max(1, user.streak_count);
      } else if (scoring.strikeIssued && newStreakCount > 0) {
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

      await enqueueSyncItem(activeUserId, 'session', 'upsert', newSession);
      await enqueueSyncItem(activeUserId, 'book', 'upsert', updatedBook);
      await enqueueSyncItem(activeUserId, 'daily_aggregate', 'upsert', updatedAgg);
      await enqueueSyncItem(activeUserId, 'profile', 'upsert', updatedUser);
      for (const ev of createdEvents) {
        await enqueueSyncItem(activeUserId, 'verification_event', 'upsert', ev);
      }

      if (isOnline) {
        await flushSyncQueue(activeUserId);

        // Credit joined Challenges & 1v1 Duels if session passed strict live anti-cheat verification!
        if (scoring.challengeEligible && liveBoth) {
          await fetch('/api/challenges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'record_verified_session',
              challengeId: draft.challenge_id ?? undefined,
              duelId: draft.duel_id ?? undefined,
              verifiedMinutes: creditedMinutes,
              verifiedPages: pagesRead,
              trustScore: scoring.trustScore,
              bookTitle: book.title,
              liveCameraVerified: true,
              challengeEligible: true,
            }),
          }).catch(() => {});
          await Promise.all([refreshChallenges(), refreshSocialAndDuels()]);
        } else {
          await refreshSocialAndDuels();
        }
      }

      if (!user.settings_json.notificationsPromptedAfterFirstSession) {
        setShowFirstSessionNotificationBanner(true);
      }

      return newSession;
    },
    [
      activeUserId,
      books,
      isOnline,
      refreshChallenges,
      refreshSocialAndDuels,
      sessions,
      user,
      verificationEvents,
    ]
  );

  const createChallenge = useCallback(
    async (params: {
      title: string;
      description: string;
      metric: 'verified_minutes' | 'verified_pages';
      targetValue: number;
      durationDays: number;
      visibility: 'public' | 'private';
      strictVerification: boolean;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/challenges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', ...params }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Unable to create challenge' };
        await refreshChallenges();
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error' };
      }
    },
    [refreshChallenges]
  );

  const joinChallenge = useCallback(
    async (params: {
      challengeId?: string;
      inviteCode?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/challenges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', ...params }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Challenge not found' };
        await Promise.all([refreshChallenges(), refreshSocialAndDuels()]);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error' };
      }
    },
    [refreshChallenges, refreshSocialAndDuels]
  );

  const createDuel = useCallback(
    async (params: {
      title?: string;
      metric: 'verified_minutes' | 'verified_pages';
      targetValue: number;
      durationHours: number;
      invitedUsername?: string | null;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/duels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', ...params }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Could not create duel' };
        await refreshSocialAndDuels();
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error' };
      }
    },
    [refreshSocialAndDuels]
  );

  const acceptDuel = useCallback(
    async (params: {
      duelId?: string;
      inviteCode?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/duels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept', ...params }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Could not join duel' };
        await refreshSocialAndDuels();
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error' };
      }
    },
    [refreshSocialAndDuels]
  );

  const declineDuel = useCallback(
    async (duelId: string): Promise<void> => {
      try {
        await fetch('/api/duels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'decline', duelId }),
        });
        await refreshSocialAndDuels();
      } catch {}
    },
    [refreshSocialAndDuels]
  );

  const toggleFollowReader = useCallback(
    async (targetUserId: string): Promise<void> => {
      try {
        await fetch('/api/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle_follow', targetUserId }),
        });
        await refreshSocialAndDuels();
      } catch {}
    },
    [refreshSocialAndDuels]
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
      if (!activeUserId) return;
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
      if (isOnline) await flushSyncQueue(activeUserId);
    },
    [activeUserId, isOnline, tbrItems]
  );

  const reorderTbrItems = useCallback(
    async (orderedIds: string[]) => {
      if (!activeUserId) return;
      const updates: TBRItem[] = [];
      orderedIds.forEach((id, idx) => {
        const found = tbrItems.find((t) => t.id === id);
        if (found) updates.push({ ...found, priority: idx + 1 });
      });
      await db.tbrItems.bulkPut(updates);
      for (const u of updates) {
        await enqueueSyncItem(activeUserId, 'tbr', 'upsert', u);
      }
      if (isOnline) await flushSyncQueue(activeUserId);
    },
    [activeUserId, isOnline, tbrItems]
  );

  const updateTbrItem = useCallback(
    async (id: string, patch: Partial<TBRItem>) => {
      if (!activeUserId) return;
      const existing = await db.tbrItems.get(id);
      if (!existing) return;
      const updated = { ...existing, ...patch };
      await db.tbrItems.put(updated);
      await enqueueSyncItem(activeUserId, 'tbr', 'upsert', updated);
      if (isOnline) await flushSyncQueue(activeUserId);
    },
    [activeUserId, isOnline]
  );

  const promoteTbrToReading = useCallback(
    async (tbrId: string) => {
      if (!activeUserId) return;
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
      if (isOnline) await flushSyncQueue(activeUserId);
    },
    [activeUserId, addBook, isOnline, updateBook]
  );

  const deleteTbrItem = useCallback(
    async (id: string) => {
      if (!activeUserId) return;
      await db.tbrItems.delete(id);
      await enqueueSyncItem(activeUserId, 'tbr', 'delete', { id });
      if (isOnline) await flushSyncQueue(activeUserId);
    },
    [activeUserId, isOnline]
  );

  const applyStreakInsurance = useCallback(async (): Promise<boolean> => {
    if (!user || !activeUserId) return false;
    const currentMonth = format(new Date(), 'yyyy-MM');
    if (user.settings_json.streakInsuranceLastUsedMonth === currentMonth) return false;

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
      if (!activeUserId) return;
      const content =
        formatType === 'json'
          ? await exportAllUserDataJson(activeUserId)
          : await exportAllUserDataCsv(activeUserId);

      const mime = formatType === 'json' ? 'application/json' : 'text/csv;charset=utf-8;';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booklit-data-${format(new Date(), 'yyyy-MM-dd')}.${formatType}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [activeUserId]
  );

  const deleteAccount = useCallback(async () => {
    if (!activeUserId) return;
    await deleteUserAccountData(activeUserId);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('booklit_last_auth_uid');
    }
    setActiveUserId(null);
    setChallenges([]);
  }, [activeUserId]);

  const value: BooklitContextValue = {
    ready,
    user,
    books,
    sessions,
    verificationEvents,
    tbrItems,
    dailyAggregates,
    challenges,
    duels,
    activityFeed,
    readers,
    mySocialProfile,
    activeDraft,
    pendingSyncCount,
    isOnline,
    triggerManualSync,

    activeView,
    setActiveView,
    interactionProfile,
    isStandalonePwa,
    globalSearchQuery,
    setGlobalSearchQuery,
    searchInputRef,

    sessionModalOpen,
    sessionModalBookId,
    sessionModalCureTargetId,
    sessionModalChallengeId,
    sessionModalDuelId,
    openSessionFlow,
    closeSessionFlow,
    showFirstSessionNotificationBanner,
    dismissFirstSessionNotificationBanner,

    selectedBookId,
    setSelectedBookId,
    selectedReaderUsername,
    setSelectedReaderUsername,
    addBookModalOpen,
    setAddBookModalOpen,

    registerAccount,
    signInAccount,
    signOutAccount,

    updateProfile,
    addBook,
    updateBook,
    startSessionDraft,
    updateSessionDraft,
    discardSessionDraft,
    completeReadingSession,

    refreshChallenges,
    refreshSocialAndDuels,
    createChallenge,
    joinChallenge,
    createDuel,
    acceptDuel,
    declineDuel,
    toggleFollowReader,

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
  if (!ctx) throw new Error('useBooklit must be used inside BooklitProvider');
  return ctx;
}
