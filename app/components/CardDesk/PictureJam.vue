<script setup lang="ts">
/**
 * CardDeskPictureJam — a calm Block-Blast-style puzzle modelled on the iOS game
 * "Picture Block Jam", ported into Earnest's CardDesk surface.
 *
 * Drag the three tray pieces onto an 8×8 grid; completing a full row or column
 * "blasts" it clear, and every cleared cell permanently uncovers a slice of the
 * picture hiding behind the board. The picture is a CardDesk contact who's gone
 * quiet (drawn from the same "Needs follow-up" pool the dashboard surfaces) — so
 * the relaxing puzzle doubles as a reconnect nudge. Once they're uncovered, you
 * log a real touchpoint (cd_activities), which is what actually moves XP
 * server-side. Running out of moves keeps the picture you've uncovered so far,
 * so a board is always winnable across a couple of tries.
 */
const open = defineModel<boolean>('open', { default: false });

const { stats, fetchStats, fetchContacts, addActivity } = useCardDesk();
const { triggerHaptic } = useHaptic();

// ── board geometry ──
const COLS = 8;
const ROWS = 8;
const N = COLS * ROWS;
const WIN_THRESHOLD = 0.72; // picture is plainly readable well before 100%
const TRAY_CELL = 17; // px — tray pieces render mini; the drag ghost uses board scale
const LIFT = 18; // px the floating piece sits above the finger so you can see it

const board = ref<(string | null)[]>(Array(N).fill(null));
const revealed = ref<boolean[]>(Array(N).fill(false));
const clearing = ref<Set<number>>(new Set());
const score = ref(0);
const won = ref(false);
const dead = ref(false);
const logged = ref(false);
const busy = ref(false);
const loading = ref(false);
const combo = ref<{ id: number; lines: number } | null>(null);
let comboId = 0;

// ── the hidden picture: a quiet CardDesk contact ──
interface JamContact {
  id: string;
  name: string;
  company: string | null;
  rating: string | null;
  email: string | null;
  phone: string | null;
  daysSince: number | null;
}
const pool = ref<JamContact[]>([]);
const contact = ref<JamContact | null>(null);
const seen = ref<Set<string>>(new Set());

// Calm "Picture Block Jam"-style scenes for free play — used when nobody's
// quiet (or you have no contacts yet) so the game is always playable.
const SCENES = [
  { name: 'Sunrise Coast', emoji: '🌅', accent: '#ff9e57' },
  { name: 'Quiet Peak', emoji: '🏔️', accent: '#7db8ff' },
  { name: 'Curious Fox', emoji: '🦊', accent: '#ff8a4d' },
  { name: 'Calm Tide', emoji: '🌊', accent: '#3fc7c2' },
  { name: 'Cherry Bloom', emoji: '🌸', accent: '#ff8fbf' },
  { name: 'Cozy Cabin', emoji: '🏡', accent: '#c79a6b' },
  { name: 'Starry Night', emoji: '🌌', accent: '#8f7dff' },
  { name: 'Forest Path', emoji: '🌲', accent: '#4fbf72' },
] as const;
type Scene = typeof SCENES[number];
const scene = ref<Scene | null>(null);

const RATING_ACCENT: Record<string, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  nurture: '#22c55e',
  cold: '#3b82f6',
};
const isFree = computed(() => !contact.value && !!scene.value);
const accent = computed(() =>
  contact.value
    ? RATING_ACCENT[contact.value.rating ?? ''] ?? '#a855f7'
    : scene.value?.accent ?? '#a855f7');
const revealCount = computed(() => revealed.value.reduce((n, r) => n + (r ? 1 : 0), 0));
const revealPct = computed(() => Math.round((revealCount.value / N) * 100));
const firstName = computed(() => contact.value?.name?.split(' ')[0] ?? 'them');
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}
function quietLabel(c: JamContact): string {
  return c.daysSince != null ? `${c.daysSince} days quiet` : 'worth a reach-out';
}

// Build the pool from CardDesk's own "needs follow-up" list (hot/warm gone
// quiet), joined to the full contact rows for email/phone. Falls back to any
// active contact when nothing is overdue yet.
async function loadPool() {
  loading.value = true;
  try {
    const [, rows] = await Promise.all([
      fetchStats(),
      fetchContacts({ hibernated: false, limit: 100 }).catch(() => [] as any[]),
    ]);
    const byId = new Map<string, any>((rows as any[]).map((r) => [r.id, r]));
    const followUp = stats.value.needsFollowUp;
    let p: JamContact[] = [];
    if (followUp.length) {
      p = followUp.map((f) => {
        const r = byId.get(f.id) ?? {};
        return { id: f.id, name: f.name, company: f.company, rating: f.rating, email: r.email ?? null, phone: r.phone ?? null, daysSince: f.daysSinceContact };
      });
    } else {
      p = (rows as any[]).map((r) => ({
        id: r.id,
        name: r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown',
        company: r.company ?? null,
        rating: r.rating ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        daysSince: null,
      }));
    }
    pool.value = p;
  } finally {
    loading.value = false;
  }
  newContact();
}

function pickContact(): JamContact | null {
  let candidates = pool.value.filter((c) => !seen.value.has(c.id));
  if (!candidates.length) { seen.value.clear(); candidates = [...pool.value]; }
  if (!candidates.length) return null;
  const c = candidates[Math.floor(Math.random() * candidates.length)];
  seen.value.add(c.id);
  return c;
}

function pickScene(): Scene {
  const others = SCENES.filter((s) => s.name !== scene.value?.name);
  return others[Math.floor(Math.random() * others.length)];
}

// ── pieces ──
type PCell = [number, number];
interface Piece { id: number; cells: PCell[]; color: string; w: number; h: number }

const SHAPES: PCell[][] = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 1], [1, 1], [2, 1], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 1], [1, 2]],
];
const PALETTE = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#06b6d4', '#ec4899'];

let pieceId = 0;
function gen(): Piece {
  const cells = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  let w = 0, h = 0;
  for (const [r, c] of cells) { if (c + 1 > w) w = c + 1; if (r + 1 > h) h = r + 1; }
  return { id: ++pieceId, cells, color, w, h };
}
const tray = ref<(Piece | null)[]>([null, null, null]);
function refillTray() { tray.value = [gen(), gen(), gen()]; }

// ── placement maths ──
function canPlaceAt(p: Piece, row: number, col: number): boolean {
  if (!Number.isFinite(row) || !Number.isFinite(col)) return false;
  for (const [dr, dc] of p.cells) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (board.value[r * COLS + c]) return false;
  }
  return true;
}
function anyPlacement(p: Piece): boolean {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canPlaceAt(p, r, c)) return true;
  return false;
}
function hasAnyMove(): boolean { return tray.value.some((p) => p && anyPlacement(p)); }

// ── drag ──
const boardEl = ref<HTMLElement | null>(null);
const dragging = ref<Piece | null>(null);
const dragSlot = ref(-1);
const ghost = reactive({ x: 0, y: 0 });
const preview = ref<number[]>([]);
const previewValid = ref(false);
const previewSet = computed(() => (previewValid.value ? new Set(preview.value) : new Set<number>()));
let dragRect: DOMRect | null = null;
let cellPx = 0;
let dropRow = NaN;
let dropCol = NaN;

function onPointerDown(e: PointerEvent, p: Piece | null, slot: number) {
  if (!p || dragging.value || won.value || dead.value || !boardEl.value) return;
  e.preventDefault();
  dragRect = boardEl.value.getBoundingClientRect();
  cellPx = dragRect.width / COLS;
  dragging.value = p;
  dragSlot.value = slot;
  moveGhost(e.clientX, e.clientY);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
}

function moveGhost(px: number, py: number) {
  const p = dragging.value;
  if (!p || !dragRect) return;
  ghost.x = px - (p.w * cellPx) / 2;
  ghost.y = py - p.h * cellPx - LIFT;
  dropCol = Math.round((ghost.x - dragRect.left) / cellPx);
  dropRow = Math.round((ghost.y - dragRect.top) / cellPx);
  if (canPlaceAt(p, dropRow, dropCol)) {
    preview.value = p.cells.map(([dr, dc]) => (dropRow + dr) * COLS + (dropCol + dc));
    previewValid.value = true;
  } else {
    preview.value = [];
    previewValid.value = false;
  }
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  e.preventDefault();
  moveGhost(e.clientX, e.clientY);
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  const p = dragging.value;
  const slot = dragSlot.value;
  const place = previewValid.value;
  dragging.value = null;
  dragSlot.value = -1;
  preview.value = [];
  previewValid.value = false;
  if (p && place) placePiece(p, slot, dropRow, dropCol);
}

function placePiece(p: Piece, slot: number, row: number, col: number) {
  for (const [dr, dc] of p.cells) board.value[(row + dr) * COLS + (col + dc)] = p.color;
  tray.value[slot] = null;
  triggerHaptic('light');
  clearLines();
  if (tray.value.every((t) => !t)) refillTray();
  if (!won.value && !hasAnyMove()) dead.value = true;
}

async function boom(opts: any) {
  if (!import.meta.client) return;
  try { const confetti = (await import('canvas-confetti')).default; confetti(opts); } catch { /* ignore */ }
}

function clearLines() {
  const hits = new Set<number>();
  let lines = 0;
  for (let r = 0; r < ROWS; r++) {
    let full = true;
    for (let c = 0; c < COLS; c++) if (!board.value[r * COLS + c]) { full = false; break; }
    if (full) { lines++; for (let c = 0; c < COLS; c++) hits.add(r * COLS + c); }
  }
  for (let c = 0; c < COLS; c++) {
    let full = true;
    for (let r = 0; r < ROWS; r++) if (!board.value[r * COLS + c]) { full = false; break; }
    if (full) { lines++; for (let r = 0; r < ROWS; r++) hits.add(r * COLS + c); }
  }
  if (!lines) return;

  score.value += 10 * lines * lines;
  if (lines > 1) {
    combo.value = { id: ++comboId, lines };
    const id = comboId;
    setTimeout(() => { if (combo.value?.id === id) combo.value = null; }, 900);
  }

  clearing.value = new Set([...clearing.value, ...hits]);
  triggerHaptic(lines > 1 ? 'success' : 'medium');
  const rect = boardEl.value?.getBoundingClientRect();
  if (rect) boom({
    particleCount: 28 + lines * 18,
    spread: 55 + lines * 10,
    startVelocity: 32,
    origin: { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
    colors: ['#f59e0b', '#22c55e', '#3b82f6', '#ffffff'],
  });

  setTimeout(() => {
    for (const idx of hits) { board.value[idx] = null; revealed.value[idx] = true; clearing.value.delete(idx); }
    clearing.value = new Set(clearing.value);
    checkWin();
  }, 200);
}

function checkWin() {
  if (won.value) return;
  if (revealCount.value / N >= WIN_THRESHOLD) winRound();
}

function winRound() {
  won.value = true;
  revealed.value = revealed.value.map(() => true);
  triggerHaptic('success');
  boom({ particleCount: 160, spread: 115, startVelocity: 46, origin: { y: 0.5 }, colors: ['#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#ffffff'] });
}

// ── reconnect — XP is awarded server-side when the activity lands ──
async function logTouch() {
  const c = contact.value;
  if (!c || busy.value || logged.value) return;
  busy.value = true;
  try {
    await addActivity(c.id, { type: 'other', label: 'Picture Jam reconnect' });
    await fetchStats();
    logged.value = true;
    triggerHaptic('success');
  } catch (e) {
    console.warn('[PictureJam] reconnect log failed:', e);
  } finally {
    busy.value = false;
  }
}

// ── round lifecycle ──
function resetBoard() {
  board.value = Array(N).fill(null);
  clearing.value = new Set();
  score.value = 0;
  won.value = false;
  dead.value = false;
  refillTray();
}
function retry() { resetBoard(); /* keep the picture uncovered so far */ }
function newContact() {
  const next = pickContact();
  if (next) { contact.value = next; scene.value = null; }
  else { scene.value = pickScene(); contact.value = null; } // free play
  logged.value = false;
  revealed.value = Array(N).fill(false);
  resetBoard();
}

watch(open, (v) => {
  if (v && !pool.value.length) loadPool();
});
onMounted(() => { if (open.value) loadPool(); });
onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});
</script>

<template>
  <ClientOnly>
  <Teleport to="body">
    <Transition name="pj-fade">
      <div v-if="open" class="pj-root">
        <div class="pj-backdrop" @click="open = false" />

        <div class="pj-panel">
          <!-- header -->
          <div class="pj-hdr">
            <div class="pj-title">
              <Icon name="lucide:puzzle" class="size-5" :style="{ color: accent }" />
              <span>Picture Jam</span>
            </div>
            <button class="pj-x" type="button" aria-label="Close" @click="open = false">
              <Icon name="lucide:x" class="size-5" />
            </button>
          </div>

          <!-- loading -->
          <div v-if="loading" class="pj-state">
            <Icon name="lucide:loader-circle" class="size-7 animate-spin opacity-60" />
            <p>Shuffling the deck…</p>
          </div>

          <!-- truly nothing (no contacts and no scene picked yet) -->
          <div v-else-if="!contact && !scene" class="pj-state">
            <div class="pj-state-ico"><Icon name="lucide:puzzle" class="size-10" /></div>
            <div class="pj-state-title">Nobody to uncover yet</div>
            <p class="pj-state-sub">Picture Jam hides a CardDesk contact who's gone quiet behind the blocks. Once you have a few warm/hot contacts that need a follow-up, they'll show up here.</p>
          </div>

          <!-- game -->
          <div v-else class="pj-body">
            <div class="pj-hud">
              <div class="pj-hud-row">
                <span class="pj-hud-lbl">
                  <Icon name="lucide:eye-off" class="size-3.5" />
                  {{ won
                    ? (isFree ? 'Picture complete!' : 'Uncovered!')
                    : (isFree ? 'Clear the blocks to reveal the picture' : 'Someone quiet is hiding behind the blocks') }}
                </span>
                <span class="pj-hud-score">{{ score.toLocaleString() }}</span>
              </div>
              <div class="pj-bar"><div class="pj-bar-fill" :style="{ width: revealPct + '%' }" /></div>
              <div class="pj-hud-pct">{{ revealPct }}% revealed · clear rows &amp; columns to uncover them</div>
            </div>

            <div class="pj-stage">
              <div ref="boardEl" class="pj-board" :style="{ '--accent': accent }">
                <div class="pj-pic">
                  <div class="pj-pic-fallback" :style="{ opacity: 0.25 + 0.75 * (revealCount / N) }">
                    <span v-if="contact" class="pj-pic-initials">{{ initials(contact.name) }}</span>
                    <span v-else class="pj-pic-emoji">{{ scene?.emoji }}</span>
                  </div>
                </div>

                <div class="pj-grid">
                  <div
                    v-for="(_, idx) in N"
                    :key="idx"
                    class="pj-cell"
                    :class="{
                      filled: !!board[idx],
                      cover: !board[idx] && !revealed[idx],
                      open: !board[idx] && revealed[idx],
                      preview: previewSet.has(idx),
                      clearing: clearing.has(idx),
                    }"
                    :style="board[idx] ? { '--bc': board[idx] } : undefined"
                  />
                </div>

                <Transition name="pj-combo">
                  <div v-if="combo" :key="combo.id" class="pj-comboPop">{{ combo.lines }}× blast!</div>
                </Transition>
              </div>
            </div>

            <div class="pj-tray">
              <div
                v-for="(p, slot) in tray"
                :key="slot"
                class="pj-slot"
                :class="{ empty: !p, grabbed: dragging && dragSlot === slot }"
              >
                <div
                  v-if="p"
                  class="pj-piece"
                  :style="{ width: p.w * TRAY_CELL + 'px', height: p.h * TRAY_CELL + 'px' }"
                  @pointerdown="onPointerDown($event, p, slot)"
                >
                  <div
                    v-for="(c, ci) in p.cells"
                    :key="ci"
                    class="pj-pc"
                    :style="{ left: c[1] * TRAY_CELL + 'px', top: c[0] * TRAY_CELL + 'px', width: TRAY_CELL + 'px', height: TRAY_CELL + 'px', '--bc': p.color }"
                  />
                </div>
              </div>
            </div>
            <div class="pj-hint">Drag a piece onto the board · fill a row or column to blast it</div>
          </div>

          <!-- floating drag ghost -->
          <div
            v-if="dragging"
            class="pj-ghost"
            :class="{ bad: !previewValid }"
            :style="{ left: ghost.x + 'px', top: ghost.y + 'px', width: dragging.w * cellPx + 'px', height: dragging.h * cellPx + 'px' }"
          >
            <div
              v-for="(c, ci) in dragging.cells"
              :key="ci"
              class="pj-pc"
              :style="{ left: c[1] * cellPx + 'px', top: c[0] * cellPx + 'px', width: cellPx + 'px', height: cellPx + 'px', '--bc': dragging.color }"
            />
          </div>

          <!-- WIN -->
          <Transition name="pj-ov">
            <div v-if="won && contact" class="pj-ov">
              <div class="pj-card">
                <div class="pj-card-eyebrow"><Icon name="lucide:party-popper" class="size-3.5" /> Picture complete</div>
                <div class="pj-reveal">
                  <span class="pj-reveal-av" :style="{ '--accent': accent }">{{ initials(contact.name) }}</span>
                  <span class="pj-reveal-info">
                    <span class="pj-reveal-name">{{ contact.name }}</span>
                    <span class="pj-reveal-sub">{{ contact.company || quietLabel(contact) }}</span>
                    <span class="pj-reveal-quiet">{{ quietLabel(contact) }}</span>
                  </span>
                </div>
                <p class="pj-card-nudge">You just uncovered {{ firstName }} — they've gone quiet. Reach out while they're top of mind.</p>
                <div class="pj-acts">
                  <a v-if="contact.phone" class="pj-act" :href="`sms:${contact.phone}`"><Icon name="lucide:message-circle" class="size-4" /> Text</a>
                  <a v-if="contact.email" class="pj-act" :href="`mailto:${contact.email}`"><Icon name="lucide:mail" class="size-4" /> Email</a>
                  <button class="pj-act log" type="button" :disabled="busy || logged" @click="logTouch">
                    <Icon :name="logged ? 'lucide:check-circle' : 'lucide:check'" class="size-4" />
                    {{ logged ? 'Logged!' : 'Log reconnect' }}
                  </button>
                </div>
                <button class="pj-again" type="button" @click="newContact"><Icon name="lucide:refresh-cw" class="size-3.5" /> Uncover someone new</button>
              </div>
            </div>
          </Transition>

          <!-- WIN (free play): a decorative scene, no contact to reconnect with -->
          <Transition name="pj-ov">
            <div v-if="won && isFree && scene" class="pj-ov">
              <div class="pj-card">
                <div class="pj-card-eyebrow"><Icon name="lucide:party-popper" class="size-3.5" /> Picture complete</div>
                <div class="pj-scene">
                  <span class="pj-scene-emoji">{{ scene.emoji }}</span>
                  <span class="pj-scene-name">{{ scene.name }}</span>
                </div>
                <p class="pj-card-nudge">Nice clearing! Add a few CardDesk contacts and your next picture becomes a real person to reconnect with.</p>
                <div class="pj-acts">
                  <button class="pj-act log" type="button" @click="newContact"><Icon name="lucide:refresh-cw" class="size-4" /> New picture</button>
                  <button class="pj-act" type="button" @click="open = false"><Icon name="lucide:x" class="size-4" /> Close</button>
                </div>
              </div>
            </div>
          </Transition>

          <!-- OUT OF MOVES -->
          <Transition name="pj-ov">
            <div v-if="dead" class="pj-ov">
              <div class="pj-card">
                <div class="pj-card-eyebrow dim"><Icon name="lucide:hand" class="size-3.5" /> Out of moves</div>
                <div class="pj-dead-big">{{ revealPct }}%</div>
                <p class="pj-card-nudge">No room for the next pieces — but the {{ revealPct }}% you've uncovered stays. Pick up where you left off.</p>
                <div class="pj-acts">
                  <button class="pj-act log" type="button" @click="retry"><Icon name="lucide:rotate-ccw" class="size-4" /> Keep uncovering</button>
                  <button class="pj-act" type="button" @click="newContact"><Icon name="lucide:refresh-cw" class="size-4" /> Someone new</button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
  </ClientOnly>
</template>

<style scoped>
.pj-root { position: fixed; inset: 0; z-index: 120; display: flex; align-items: center; justify-content: center; padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)); }
.pj-backdrop { position: absolute; inset: 0; background: rgba(8, 8, 12, 0.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }

.pj-panel {
  position: relative; z-index: 1;
  width: min(460px, 100%); height: min(820px, 100%);
  display: flex; flex-direction: column;
  background: #0d0f14; color: #f4f5f7;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px; overflow: hidden;
  box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.8);
}

.pj-hdr { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 10px; }
.pj-title { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 18px; letter-spacing: -0.01em; }
.pj-x { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9999px; color: #9aa0aa; background: rgba(255, 255, 255, 0.06); border: none; cursor: pointer; transition: color 0.15s, background 0.15s; }
.pj-x:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }

.pj-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 28px; color: #c7ccd4; }
.pj-state-ico { color: #6b7280; }
.pj-state-title { font-size: 19px; font-weight: 800; color: #f4f5f7; }
.pj-state-sub { font-size: 13px; color: #9aa0aa; line-height: 1.55; max-width: 300px; }

.pj-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 4px 18px 18px; }

/* ── HUD ── */
.pj-hud { flex-shrink: 0; }
.pj-hud-row { display: flex; align-items: center; gap: 8px; }
.pj-hud-lbl { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #c7ccd4; }
.pj-hud-score { margin-left: auto; font-weight: 800; font-size: 18px; color: #f5b400; font-variant-numeric: tabular-nums; }
.pj-bar { margin-top: 8px; height: 6px; border-radius: 9999px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }
.pj-bar-fill { height: 100%; border-radius: 9999px; background: linear-gradient(90deg, #22c55e, #f5b400); transition: width 0.4s ease; }
.pj-hud-pct { margin-top: 6px; font-size: 10px; font-weight: 600; color: #7a818c; }

/* ── stage / board ── */
.pj-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.pj-board {
  position: relative; width: min(100%, 56vh, 420px); aspect-ratio: 1;
  border-radius: 18px; overflow: hidden; background: #15181f;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 18px 44px -22px rgba(0, 0, 0, 0.7);
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.pj-pic { position: absolute; inset: 0; }
.pj-pic-fallback {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, var(--accent) 60%, transparent), transparent 70%),
    linear-gradient(150deg, color-mix(in srgb, var(--accent) 34%, #15181f), #15181f);
  transition: opacity 0.4s ease;
}
.pj-pic-initials { font-size: clamp(48px, 16vw, 96px); font-weight: 800; letter-spacing: 1px; color: color-mix(in srgb, var(--accent) 70%, white); }
.pj-pic-emoji { font-size: clamp(54px, 18vw, 104px); line-height: 1; filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.4)); }

.pj-grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr); }
.pj-cell { position: relative; transition: background 0.18s ease, opacity 0.2s ease, transform 0.18s ease; }
.pj-cell.cover { background: rgba(12, 14, 19, 0.86); box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.05); }
.pj-cell.open { background: transparent; box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.04); }
.pj-cell.filled {
  border-radius: 4px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--bc) 92%, white) 0%, var(--bc) 45%, color-mix(in srgb, var(--bc) 78%, black) 100%);
  box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 3px rgba(0, 0, 0, 0.28), 0 0 0 0.5px rgba(0, 0, 0, 0.25);
}
.pj-cell.preview { border-radius: 4px; background: color-mix(in srgb, var(--accent) 42%, transparent); box-shadow: inset 0 0 0 1px var(--accent); }
.pj-cell.clearing { animation: pj-blast 0.22s ease forwards; z-index: 2; }
@keyframes pj-blast {
  0% { transform: scale(1); filter: brightness(1); }
  45% { transform: scale(1.18); filter: brightness(2.2); }
  100% { transform: scale(0.2); opacity: 0; filter: brightness(2.6); }
}

.pj-comboPop { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 34px; font-weight: 900; letter-spacing: 0.5px; color: #f5b400; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.7); z-index: 3; pointer-events: none; }
.pj-combo-enter-active { animation: pj-combo-in 0.3s ease; }
.pj-combo-leave-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.pj-combo-leave-to { opacity: 0; transform: translate(-50%, -120%) scale(1.2); }
@keyframes pj-combo-in { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); } 60% { transform: translate(-50%, -50%) scale(1.18); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

/* ── tray ── */
.pj-tray { flex-shrink: 0; display: flex; align-items: center; justify-content: space-around; gap: 8px; min-height: 78px; }
.pj-slot { flex: 1; min-height: 72px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); transition: border-color 0.18s, opacity 0.18s, transform 0.12s; }
.pj-slot.empty { opacity: 0.4; border-style: dashed; }
.pj-slot.grabbed { opacity: 0.3; transform: scale(0.96); }
.pj-piece { position: relative; cursor: grab; touch-action: none; }
.pj-piece:active { cursor: grabbing; }
.pj-pc { position: absolute; border-radius: 4px; background: linear-gradient(160deg, color-mix(in srgb, var(--bc) 92%, white) 0%, var(--bc) 45%, color-mix(in srgb, var(--bc) 78%, black) 100%); box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 3px rgba(0, 0, 0, 0.28); }
.pj-hint { flex-shrink: 0; text-align: center; font-size: 10px; font-weight: 600; color: #7a818c; }

/* ── floating drag ghost ── */
.pj-ghost { position: fixed; z-index: 130; pointer-events: none; filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.5)); transition: opacity 0.1s ease; }
.pj-ghost.bad { opacity: 0.55; }
.pj-ghost .pj-pc { border-radius: 5px; }

/* ── overlays (win / dead) ── */
.pj-ov { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(6, 7, 10, 0.66); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.pj-card { width: min(360px, 100%); padding: 20px; border-radius: 22px; text-align: center; background: #14171e; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 30px 70px -20px rgba(0, 0, 0, 0.7); }
.pj-card-eyebrow { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 14px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #22c55e; }
.pj-card-eyebrow.dim { color: #9aa0aa; }
.pj-reveal { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 12px; }
.pj-reveal-av { width: 52px; height: 52px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, #14171e); border: 2px solid var(--accent); }
.pj-reveal-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pj-reveal-name { font-size: 17px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pj-reveal-sub { font-size: 11.5px; color: #9aa0aa; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pj-reveal-quiet { font-size: 10px; color: #f5b400; font-weight: 700; margin-top: 1px; }
.pj-card-nudge { font-size: 12.5px; line-height: 1.5; color: #9aa0aa; margin: 14px 0; }
.pj-dead-big { font-size: 56px; line-height: 1; font-weight: 800; color: #22c55e; margin: 6px 0; }
.pj-scene { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px 0; }
.pj-scene-emoji { font-size: 64px; line-height: 1; filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45)); }
.pj-scene-name { font-size: 18px; font-weight: 800; color: #f4f5f7; }

.pj-acts { display: flex; gap: 7px; justify-content: center; flex-wrap: wrap; }
.pj-act { display: inline-flex; align-items: center; gap: 5px; padding: 9px 14px; border-radius: 9999px; cursor: pointer; text-decoration: none; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #c7ccd4; font-size: 12px; font-weight: 800; transition: transform 0.1s, border-color 0.15s, color 0.15s; }
.pj-act:active { transform: scale(0.95); }
.pj-act.log { color: #22c55e; border-color: rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.1); }
.pj-act:disabled { opacity: 0.6; cursor: default; }
.pj-again { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; background: none; border: none; cursor: pointer; color: #7a818c; font-size: 11.5px; font-weight: 700; }
.pj-again:hover { color: #f4f5f7; }

.pj-ov-enter-active, .pj-ov-leave-active { transition: opacity 0.25s ease; }
.pj-ov-enter-active .pj-card { transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1); }
.pj-ov-enter-from, .pj-ov-leave-to { opacity: 0; }
.pj-ov-enter-from .pj-card { transform: scale(0.85) translateY(20px); }

/* root transition */
.pj-fade-enter-active, .pj-fade-leave-active { transition: opacity 0.25s ease; }
.pj-fade-enter-active .pj-panel, .pj-fade-leave-active .pj-panel { transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1); }
.pj-fade-enter-from, .pj-fade-leave-to { opacity: 0; }
.pj-fade-enter-from .pj-panel, .pj-fade-leave-to .pj-panel { transform: scale(0.94) translateY(12px); }
</style>
