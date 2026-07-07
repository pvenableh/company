// composables/useArcade.ts
/**
 * Arcade reward bus — the "juice" layer for gamification.
 *
 * Anywhere in the app can fire `reward()` the instant a user completes real
 * work (closes a ticket, finishes a task, wins a deal, gets paid). This drives
 * a single global overlay (`<ArcadeRewardLayer>`, mounted once per shell) that
 * shows floating "+EP" coin-pops, a combo multiplier for rapid chains, badge
 * unlocks, and a full-screen level-up takeover — with synthesized arcade sound
 * + haptics, all respecting the user's feedback preferences.
 *
 * State is module-level (a single shared bus) so the producer (a row action
 * deep in a page) and the consumer (the overlay in the layout) never need to
 * be wired together — they just share this composable.
 *
 * Purely presentational: canonical EP/level/badges come from the server award
 * endpoint. `reward()` shows what the server (optimistically) granted.
 */

export type ArcadeDimension =
  | 'delivery'
  | 'communication'
  | 'finance'
  | 'growth'
  | 'consistency';

export interface ArcadeReward {
  /** EP granted (already the canonical amount). */
  ep: number;
  /** Short label, e.g. "Ticket closed". */
  label: string;
  /** Emoji or icon glyph shown in the pop. */
  icon?: string;
  /** Which score dimension — tints the pop. */
  dimension?: ArcadeDimension;
  /** Optional dollar amount for money events ("$1,200 collected"). */
  amount?: number;
}

export interface ArcadePop extends ArcadeReward {
  id: number;
  combo: number;
}

export interface ArcadeLevelUp {
  level: number;
  title: string;
}

export interface ArcadeBadgeToast {
  id: number;
  name: string;
  icon: string;
  description: string;
}

// Tint per dimension — maps to the pop's accent color.
const DIMENSION_COLOR: Record<ArcadeDimension, string> = {
  delivery: '#f59e0b', // amber — completing work
  communication: '#3b82f6', // blue
  finance: '#22c55e', // green — money
  growth: '#a855f7', // purple — new business
  consistency: '#ec4899', // pink — showing up
};

// How long rapid rewards keep chaining a combo (ms).
const COMBO_WINDOW = 4000;
// How long each floating pop lives before it's culled (ms).
const POP_TTL = 1600;

// ─── Shared module-level bus ────────────────────────────────────────────────
const pops = ref<ArcadePop[]>([]);
const badgeToasts = ref<ArcadeBadgeToast[]>([]);
const combo = ref(0);
const levelUp = ref<ArcadeLevelUp | null>(null);
const sessionEP = ref(0); // EP earned this session (nice running tally)

let _lastRewardAt = 0;
let _idSeq = 0;
let _comboTimer: ReturnType<typeof setTimeout> | undefined;

export function useArcade() {
  const sound = useArcadeSound();
  const { haptic } = useFeedback();

  const dimensionColor = (dim?: ArcadeDimension) =>
    dim ? DIMENSION_COLOR[dim] : '#f59e0b';

  /**
   * Fire a reward pop. Call this the moment work completes.
   * Returns the created pop (with its resolved combo count).
   */
  const reward = (r: ArcadeReward): ArcadePop => {
    const now = Date.now();
    // Chain the combo if this reward lands inside the window.
    combo.value = now - _lastRewardAt < COMBO_WINDOW ? combo.value + 1 : 1;
    _lastRewardAt = now;
    sessionEP.value += r.ep;

    const pop: ArcadePop = { ...r, id: ++_idSeq, combo: combo.value };
    pops.value = [...pops.value, pop];

    // Sound + haptic scale gently with the combo.
    sound.coin(combo.value);
    haptic(combo.value >= 3 ? 'heavy' : 'success');

    // Cull this pop after its animation finishes.
    if (import.meta.client) {
      window.setTimeout(() => {
        pops.value = pops.value.filter((p) => p.id !== pop.id);
      }, POP_TTL);

      // Decay the combo once the chain window lapses with no new reward, so the
      // combo meter fades out instead of lingering on screen indefinitely. Each
      // reward resets the timer, keeping an active chain visible.
      if (_comboTimer) clearTimeout(_comboTimer);
      _comboTimer = setTimeout(() => {
        combo.value = 0;
        _comboTimer = undefined;
      }, COMBO_WINDOW);
    }
    return pop;
  };

  /** Trigger the full-screen level-up takeover (+ confetti + fanfare). */
  const celebrateLevelUp = async (level: number, title: string) => {
    levelUp.value = { level, title };
    sound.levelUp();
    haptic('heavy');
    if (import.meta.client) {
      // Lazy confetti burst behind the takeover card.
      import('canvas-confetti')
        .then((m) =>
          m.default({
            particleCount: 160,
            spread: 100,
            startVelocity: 45,
            origin: { y: 0.55 },
            colors: ['#f59e0b', '#22c55e', '#a855f7', '#3b82f6', '#ffffff'],
          }),
        )
        .catch(() => {});
      window.setTimeout(() => {
        levelUp.value = null;
      }, 3600);
    }
  };

  /** Pop a badge-unlock toast (auto-dismisses). */
  const unlockBadge = (name: string, icon: string, description: string) => {
    const t: ArcadeBadgeToast = { id: ++_idSeq, name, icon, description };
    badgeToasts.value = [...badgeToasts.value, t];
    sound.badge();
    haptic('success');
    if (import.meta.client) {
      window.setTimeout(() => {
        badgeToasts.value = badgeToasts.value.filter((b) => b.id !== t.id);
      }, 4200);
    }
  };

  const dismissBadge = (id: number) => {
    badgeToasts.value = badgeToasts.value.filter((b) => b.id !== id);
  };

  /** Play the quest-claim chime (used by the quests UI). */
  const questChime = () => sound.quest();

  /**
   * Convenience: process a server award response in one call. Fires the coin
   * pop, then any badge unlocks, then the level-up takeover — canonical data
   * straight from `POST /api/score/award`.
   */
  const applyAwardResult = (
    r: ArcadeReward,
    result?: {
      leveledUp?: boolean;
      level?: number;
      levelTitle?: string;
      newBadges?: { name: string; icon: string; description: string }[];
    } | null,
  ) => {
    reward(r);
    if (!result) return;
    for (const b of result.newBadges ?? []) {
      unlockBadge(b.name, b.icon, b.description);
    }
    if (result.leveledUp && result.level && result.levelTitle) {
      // Let the coin pop breathe before the takeover.
      if (import.meta.client) {
        window.setTimeout(
          () => celebrateLevelUp(result.level!, result.levelTitle!),
          650,
        );
      }
    }
  };

  return {
    // state (read-only to consumers)
    pops: readonly(pops),
    badgeToasts: readonly(badgeToasts),
    combo: readonly(combo),
    levelUp: readonly(levelUp),
    sessionEP: readonly(sessionEP),
    // actions
    reward,
    celebrateLevelUp,
    unlockBadge,
    dismissBadge,
    questChime,
    applyAwardResult,
    // helpers
    dimensionColor,
  };
}
