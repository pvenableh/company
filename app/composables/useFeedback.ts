// composables/useFeedback.ts
/**
 * Unified haptic + sound feedback system.
 *
 * Provides tactile (vibration) and audible feedback for interactions:
 * - Haptic: Uses the Vibration API on supported devices (mobile web, PWA)
 * - Sound: Plays short audio cues on both mobile and desktop
 *
 * User preferences are persisted in localStorage and respected globally.
 * The `prefers-reduced-motion` media query is honored for haptics.
 *
 * Usage:
 *   const { feedback } = useFeedback()
 *   feedback('success')   // haptic + sound for a success event
 *   feedback('tap')       // light tap, no sound
 */

// ─── Haptic patterns (vibration durations in ms) ────────────────────────────
const HAPTIC_PATTERNS = {
  /** Lightest tap — toggle, tab switch */
  tap: 10,
  /** Standard interaction — button press, selection */
  medium: 20,
  /** Heavier feedback — destructive action, confirmation */
  heavy: 40,
  /** Success — double pulse */
  success: [10, 30, 10],
  /** Warning — longer double pulse */
  warning: [15, 40, 15],
  /** Error — triple pulse */
  error: [10, 20, 10, 20, 10],
  /** Drag start — single firm pulse */
  drag: 15,
  /** Drop — satisfying thud */
  drop: [10, 20, 30],
} as const;

export type FeedbackType = keyof typeof HAPTIC_PATTERNS;

// ─── Sound map (paths relative to /public/sounds/) ──────────────────────────
const SOUND_MAP: Partial<Record<FeedbackType, string>> = {
  success: '/sounds/feedback-success.mp3',
  error: '/sounds/feedback-error.mp3',
  warning: '/sounds/feedback-warning.mp3',
  drop: '/sounds/feedback-drop.mp3',
};

// ─── Module-level audio cache ───────────────────────────────────────────────
const _audioCache = new Map<string, HTMLAudioElement>();
let _audioUnlocked = false;
let _unlockBound = false;

const PREFS_KEY = 'feedback_preferences';

interface FeedbackPreferences {
  hapticEnabled: boolean;
  soundEnabled: boolean;
}

const DEFAULT_PREFS: FeedbackPreferences = {
  hapticEnabled: true,
  soundEnabled: true,
};

// ─── Shared reactive preferences ────────────────────────────────────────────
const _prefs = ref<FeedbackPreferences>({ ...DEFAULT_PREFS });
let _prefsLoaded = false;

function loadPrefs() {
  if (_prefsLoaded || typeof window === 'undefined') return;
  _prefsLoaded = true;

  try {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      _prefs.value = { ...DEFAULT_PREFS, ...parsed };
    }
  } catch {
    // Corrupt data — use defaults
  }
}

function savePrefs() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs.value));
  } catch {
    // Storage full or unavailable — ignore
  }
}

// ─── Audio helpers ──────────────────────────────────────────────────────────

function getAudio(path: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;

  let audio = _audioCache.get(path);
  if (!audio) {
    audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = 0.3; // Subtle — not jarring
    _audioCache.set(path, audio);
  }
  return audio;
}

function unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;

  // Play a silent buffer to unlock audio context
  for (const [, audio] of _audioCache) {
    const vol = audio.volume;
    audio.volume = 0;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = vol;
    }).catch(() => {});
  }

  // Remove unlock listeners
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
}

function bindUnlockListeners() {
  if (_unlockBound || typeof document === 'undefined') return;
  _unlockBound = true;
  document.addEventListener('click', unlockAudio, { passive: true });
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio, { passive: true });
}

// Preload sounds on first import (client only)
if (import.meta.client) {
  for (const path of Object.values(SOUND_MAP)) {
    if (path) getAudio(path);
  }
  bindUnlockListeners();
}

// ─── Composable ─────────────────────────────────────────────────────────────

export function useFeedback() {
  if (import.meta.client) loadPrefs();

  const prefersReducedMotion = import.meta.client
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    : false;

  /** Whether the device supports the Vibration API (false on iOS Safari) */
  const hapticSupported = import.meta.client
    ? typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    : false;

  /**
   * Trigger combined haptic + sound feedback.
   *
   * @param type - The feedback style to use
   * @param options - Override defaults per-call
   */
  const feedback = (
    type: FeedbackType,
    options?: { haptic?: boolean; sound?: boolean },
  ) => {
    if (typeof window === 'undefined') return;

    const wantHaptic = options?.haptic ?? _prefs.value.hapticEnabled;
    const wantSound = options?.sound ?? _prefs.value.soundEnabled;

    // Haptic
    if (wantHaptic && !prefersReducedMotion && navigator.vibrate) {
      const pattern = HAPTIC_PATTERNS[type];
      navigator.vibrate(pattern);
    }

    // Sound
    const soundPath = SOUND_MAP[type];
    if (wantSound && soundPath) {
      const audio = getAudio(soundPath);
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Autoplay blocked — will work after next user gesture
        });
      }
    }
  };

  /** Haptic-only shortcut (no sound) */
  const haptic = (type: FeedbackType = 'tap') => {
    feedback(type, { sound: false });
  };

  /** Update and persist user preferences */
  const setPreferences = (prefs: Partial<FeedbackPreferences>) => {
    _prefs.value = { ..._prefs.value, ...prefs };
    savePrefs();
  };

  return {
    feedback,
    haptic,
    hapticSupported,
    preferences: _prefs,
    setPreferences,
  };
}
