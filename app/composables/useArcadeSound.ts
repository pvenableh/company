// composables/useArcadeSound.ts
/**
 * Arcade sound synth — short, punchy WebAudio blips generated on the fly.
 *
 * No asset files: every cue is synthesized from oscillators + a gain
 * envelope, so the bundle stays lean and pitches can scale with combo
 * count. Respects the shared sound preference from `useFeedback` and the
 * browser autoplay gesture-unlock (the AudioContext resumes on first
 * user interaction). All calls are no-ops on the server or when muted.
 *
 * Cues:
 *   coin(combo)   — a completion reward; pitch rises with the combo
 *   badge()       — a bright two-note flourish for a badge unlock
 *   levelUp()     — a triumphant ascending arpeggio
 *   quest()       — a soft confirming chime for claiming a quest
 */

let _ctx: AudioContext | null = null;
let _unlockBound = false;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  _ctx = new AC();
  return _ctx;
}

/** Resume the context on the first user gesture (autoplay policy). */
function bindUnlock() {
  if (_unlockBound || typeof document === 'undefined') return;
  _unlockBound = true;
  const resume = () => {
    _ctx?.resume?.().catch(() => {});
  };
  document.addEventListener('click', resume, { passive: true });
  document.addEventListener('touchstart', resume, { passive: true });
  document.addEventListener('keydown', resume, { passive: true });
}

if (import.meta.client) bindUnlock();

/**
 * Play a single note.
 * @param freq       frequency in Hz
 * @param start      offset from "now" in seconds
 * @param duration   note length in seconds
 * @param type       oscillator waveform
 * @param peak       peak gain (0–1)
 */
function note(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'square',
  peak = 0.18,
) {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // Fast attack, exponential decay — that classic blip envelope.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Simple pentatonic-ish scale so escalating combos stay musical.
const COIN_SCALE = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1174.66];

export function useArcadeSound() {
  const { preferences } = useFeedback();

  const enabled = () => import.meta.client && preferences.value.soundEnabled;

  /** Completion coin — pitch climbs with the combo (capped). */
  const coin = (combo = 1) => {
    if (!enabled()) return;
    const idx = Math.min(combo - 1, COIN_SCALE.length - 1);
    const base = COIN_SCALE[Math.max(0, idx)] ?? 523.25;
    note(base, 0, 0.09, 'square', 0.16);
    note(base * 1.5, 0.06, 0.11, 'square', 0.14);
  };

  /** Badge unlock — bright rising two-note flourish. */
  const badge = () => {
    if (!enabled()) return;
    note(659.25, 0, 0.1, 'triangle', 0.16);
    note(987.77, 0.09, 0.16, 'triangle', 0.16);
  };

  /** Level up — triumphant ascending arpeggio. */
  const levelUp = () => {
    if (!enabled()) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => note(f, i * 0.09, 0.18, 'square', 0.16));
    note(1046.5, notes.length * 0.09, 0.32, 'triangle', 0.14);
  };

  /** Quest claim — soft confirming chime. */
  const quest = () => {
    if (!enabled()) return;
    note(783.99, 0, 0.12, 'sine', 0.2);
    note(1046.5, 0.1, 0.22, 'sine', 0.16);
  };

  return { coin, badge, levelUp, quest };
}
