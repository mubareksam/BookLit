'use client';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'installed';

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other';

export interface PwaInstallState {
  /** Chromium fired a real install prompt we can trigger. */
  canPrompt: boolean;
  /** Already running as an installed app (standalone display mode). */
  isInstalled: boolean;
  platform: InstallPlatform;
  isSafari: boolean;
}

const listeners = new Set<(state: PwaInstallState) => void>();

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
let initialized = false;

function detectPlatform(): { platform: InstallPlatform; isSafari: boolean } {
  if (typeof navigator === 'undefined') return { platform: 'other', isSafari: false };
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && 'ontouchend' in document);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome|android/.test(ua);
  if (isIos) return { platform: 'ios', isSafari };
  if (isAndroid) return { platform: 'android', isSafari: false };
  if (/windows|macintosh|linux|x11/.test(ua)) return { platform: 'desktop', isSafari };
  return { platform: 'other', isSafari };
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  } catch {
    return false;
  }
  return false;
}

export function getPwaInstallState(): PwaInstallState {
  const { platform, isSafari } = detectPlatform();
  return {
    canPrompt: Boolean(deferredPrompt),
    isInstalled: installedFlag || isStandaloneDisplay(),
    platform,
    isSafari,
  };
}

function emit() {
  const state = getPwaInstallState();
  listeners.forEach((listener) => listener(state));
}

export function initPwaInstall(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  installedFlag = isStandaloneDisplay();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedFlag = true;
    emit();
  });

  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  standaloneMedia.addEventListener?.('change', () => {
    installedFlag = isStandaloneDisplay();
    emit();
  });
}

// Register the listener as early as this module is imported so the browser's
// single `beforeinstallprompt` event is never missed during hydration.
if (typeof window !== 'undefined') {
  initPwaInstall();
}

export function subscribePwaInstall(listener: (state: PwaInstallState) => void): () => void {
  initPwaInstall();
  listeners.add(listener);
  listener(getPwaInstallState());
  return () => {
    listeners.delete(listener);
  };
}

export async function promptPwaInstall(): Promise<InstallOutcome> {
  initPwaInstall();
  if (isStandaloneDisplay()) return 'installed';
  if (!deferredPrompt) return 'unavailable';
  const promptEvent = deferredPrompt;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    deferredPrompt = null;
    emit();
    return choice.outcome;
  } catch {
    deferredPrompt = null;
    emit();
    return 'unavailable';
  }
}

export interface InstallStep {
  title: string;
  detail: string;
}

/** Human instructions for browsers that never expose a programmatic prompt. */
export function getInstallSteps(state: PwaInstallState): InstallStep[] {
  if (state.isInstalled) {
    return [{ title: 'Already installed', detail: 'Booklit is running as an installed app.' }];
  }
  if (state.platform === 'ios') {
    return [
      { title: 'Tap the Share button', detail: 'In Safari’s toolbar (square with an arrow up).' },
      { title: 'Choose “Add to Home Screen”', detail: 'Scroll the share sheet if you don’t see it.' },
      { title: 'Tap “Add”', detail: 'Booklit opens full-screen with offline reading drafts.' },
    ];
  }
  if (state.platform === 'android') {
    return [
      { title: 'Open the browser menu', detail: 'Tap ⋮ in Chrome, Edge, or Samsung Internet.' },
      { title: 'Tap “Install app” / “Add to Home screen”', detail: 'Some browsers label it “Install”.' },
      { title: 'Confirm', detail: 'Booklit appears on your home screen like a native app.' },
    ];
  }
  return [
    { title: 'Look for the install icon', detail: 'In Chrome or Edge’s address bar (monitor with an arrow).' },
    { title: 'Or open the browser menu', detail: 'Choose “Install Booklit” or “Apps → Install this site”.' },
    { title: 'Safari on Mac', detail: 'Use File → Add to Dock.' },
  ];
}
