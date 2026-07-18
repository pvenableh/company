<script setup lang="ts">
// THROWAWAY design prototype for the immersive Director's Office (Boardroom
// reshape). Not shipped — delete before merge. Real <EarnestAura>,
// <CommandCenterDirectorSlides> + GSAP. Viewable unauth at /director-preview.
import { gsap } from 'gsap';
import { useEarnestPresence } from '~/composables/useEarnestPresence';

definePageMeta({ layout: 'blank', auth: false });
if (import.meta.client) (window as any).__gsap = gsap;

const presence = useEarnestPresence({ initial: 'present' });
const MANTRAS = ['Do good work.', 'Know thyself.', 'A trusted partner.'];

// ── Mock boardroom data ──────────────────────────────────────────────────────
const convening = ref(true);
const agenda = [
  { subject: 'money', label: 'Money', icon: 'lucide:receipt', title: '3 invoices overdue', summary: '$4,200 aging past 30 days — two are fresh and close to reach.', accent: '#e0a13f', count: '$4.2k', badge: '3' },
  { subject: 'projects', label: 'Projects', icon: 'lucide:folder', title: '2 projects stalled', summary: 'No activity in 14+ days on Website 5.0 and Antique Page.', accent: '#e5735b', count: '2', badge: '2' },
  { subject: 'leads', label: 'Leads', icon: 'lucide:user-plus', title: '4 leads going cold', summary: 'No touch in a week — worth a nudge before they drift.', accent: '#4da6ff', count: '4', badge: '4' },
  { subject: 'clients', label: 'Clients', icon: 'lucide:smile', title: 'CSAT holding at 4.6', summary: 'Steady this month. One client left a note worth reading.', accent: '#3fbe82', count: '4.6', badge: '1' },
];

// Half-circle seat positions — departments fanned around the director (below).
// yPx / xPct = the CHIP CENTER (seats are anchored to their circle center via a
// translate that offsets the label+count below), so the connector lines land
// dead-centre on each department's icon.
const ARC_H = 320;
const arcSeats = computed(() => {
  const n = agenda.length;
  const startDeg = 158, endDeg = 22;
  return agenda.map((a, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    const xPct = 50 + 40 * Math.cos(rad);
    const yPx = 214 - 150 * Math.sin(rad);
    return { ...a, xPct, yPx, left: `${xPct}%`, top: `${yPx}px` };
  });
});
const DIRECTOR = { xPct: 50, yPx: 250 };

// Live multiplayer — teammates seated with you; one is presenting a department.
const attendees = [
  { id: 'a', name: 'Priya', initials: 'PN', color: '#7fd7ff' },
  { id: 'b', name: 'Marcus', initials: 'MB', color: '#f0a838' },
  { id: 'c', name: 'Dev', initials: 'DK', color: '#3fbe82' },
];
const presentingSubject = ref('projects');
const presenter = computed(() => attendees[1]);

const agendaLayout = ref<'arc' | 'cards'>('arc');

// Department focus — pick a seat to convene on just that subject.
const activeSubject = ref<string | null>(null);
const activeAgenda = computed(() => agenda.find((a) => a.subject === activeSubject.value) || null);
function focusDepartment(subject: string) {
  activeSubject.value = activeSubject.value === subject ? null : subject;
  presence.bump(0.5);
}
function resetFocus() { activeSubject.value = null; presence.bump(0.3); }

// Plan (outline ⇆ slides).
const viewMode = ref<'outline' | 'slides'>('outline');
const steps = ref([
  { id: 1, icon: 'lucide:mail', action_type: 'send_email', title: 'Nudge the two fresh overdue invoices', description: 'One friendly email each to Broome County ($1,500) and Frayednot ($1,500).', detail: 'One friendly email each to Broome County ($1,500) and Frayednot ($1,500).', status: 'pending', preview: { to: 'Broome County', subject: 'A quick nudge on invoice #1042', body: 'Hi — just a gentle reminder that invoice #1042 ($1,500) is a little past due. No rush, but wanted to keep it on your radar.' } },
  { id: 2, icon: 'lucide:calendar-clock', action_type: 'reschedule_project', title: 'Reschedule Website 5.0', description: 'Push dates out two weeks and cascade to events + tasks.', detail: 'Push dates out two weeks and cascade to events + tasks.', status: 'pending' },
  { id: 3, icon: 'lucide:sparkles', action_type: 'draft', title: 'Draft a re-engagement note', description: 'A short, warm check-in for the 4 cold leads.', detail: 'A short, warm check-in for the 4 cold leads.', status: 'pending' },
]);
const openSteps = computed(() => steps.value.filter((s) => s.status === 'pending').length);
function setStep(id: number, status: 'approved' | 'skipped') {
  const s = steps.value.find((x) => x.id === id);
  if (s) s.status = status;
  presence.bump(0.5);
}

const slideIntro = computed(() => activeAgenda.value
  ? `Here's my read on ${activeAgenda.value.label.toLowerCase()}. ${activeAgenda.value.summary} I've drafted the moves below — approve what feels right.`
  : `Here's my read across the business. A few things want attention this week — mostly money and momentum. I've drafted the moves below; approve what feels right.`);
const slidePoints = computed(() => activeAgenda.value
  ? [`${activeAgenda.value.title} — ${activeAgenda.value.count}`, activeAgenda.value.summary]
  : ['3 invoices overdue — $4.2k, two are close to reach', '2 projects stalled 14+ days', '4 leads going cold', 'CSAT steady at 4.6']);

// ── GSAP reveal ──────────────────────────────────────────────────────────────
const reduceMotion = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const vReveal = {
  mounted(el: HTMLElement, binding: { value?: number; modifiers: Record<string, boolean> }) {
    if (reduceMotion) return;
    const i = typeof binding.value === 'number' ? binding.value : 0;
    const fadeOnly = !!binding.modifiers.fade;
    const prev = el.style.transition;
    el.style.transition = 'none';
    gsap.from(el, {
      opacity: 0, ...(fadeOnly ? { scale: 0.8 } : { y: 18 }), transformOrigin: '50% 50%',
      duration: fadeOnly ? 0.5 : 0.55, delay: Math.min(i, 10) * 0.07, ease: fadeOnly ? 'back.out(1.6)' : 'power3.out',
      onComplete() { el.style.transition = prev; gsap.set(el, { clearProps: 'transform,opacity' }); },
    });
  },
};

onMounted(() => {
  presence.setMood('think');
  gsap.delayedCall(reduceMotion ? 0 : 1.1, () => { convening.value = false; presence.setMood('present'); });
});
</script>

<template>
  <div class="dop">
    <EarnestAura :presence="presence" :mantras="MANTRAS" :show-mantras="!convening" />

    <div class="dop__inner">
      <header class="dop__top">
        <div class="dop__brand">
          <span class="dop__chair"><DirectorChairIcon class="w-6 h-6" /></span>
          <div>
            <p class="dop__title">The Director's Office</p>
            <p class="dop__sub">
              <template v-if="activeAgenda">Focused on <span class="dop__sub-em">{{ activeAgenda.label }}</span> — the rest of the business is parked.</template>
              <template v-else>Earnest reviewed the business and drafted the work — approve each step.</template>
            </p>
          </div>
        </div>
        <div class="dop__controls">
          <a href="/director" class="dop__pill dop__pill--ghost"><Icon name="lucide:history" class="w-3.5 h-3.5" /> Past meetings</a>
          <button class="dop__pill"><Icon name="lucide:radio" class="w-3.5 h-3.5" /> Go live</button>
          <button class="dop__pill"><Icon name="lucide:user-plus" class="w-3.5 h-3.5" /> Invite</button>
          <button class="dop__icon" aria-label="Close"><Icon name="lucide:x" class="w-5 h-5" /></button>
        </div>
      </header>

      <div class="dop__scroll">
        <Transition name="dop-fade" mode="out-in">
          <div v-if="convening" key="loading" class="dop__loading">
            <span class="dop__spinner"><EarnestIcon class="w-5 h-5" /></span>
            <p>Convening the board — reviewing the business…</p>
          </div>

          <div v-else key="board" class="dop__board">
            <!-- Agenda: half-circle of departments (default) or detail cards -->
            <section>
              <div class="dop__label-row">
                <p class="dop__label">{{ agendaLayout === 'arc' ? 'The board · pick a department, or take the lot' : 'Agenda · what needs attention' }}</p>
                <div class="dop__right">
                  <button v-if="activeSubject" class="dop__reset" @click="resetFocus"><Icon name="lucide:arrow-left" class="w-3 h-3" /> Whole business</button>
                  <div class="dop__seg">
                    <button :data-on="agendaLayout === 'arc'" @click="agendaLayout = 'arc'"><Icon name="lucide:users-round" class="w-3.5 h-3.5" /> Board</button>
                    <button :data-on="agendaLayout === 'cards'" @click="agendaLayout = 'cards'"><Icon name="lucide:list" class="w-3.5 h-3.5" /> Agenda</button>
                  </div>
                </div>
              </div>

              <!-- Half-circle board -->
              <div v-if="agendaLayout === 'arc'" class="dop__arc" :style="{ height: ARC_H + 'px' }">
                <svg class="dop__arc-lines" :viewBox="`0 0 100 ${ARC_H}`" preserveAspectRatio="none" aria-hidden="true">
                  <line
                    v-for="s in arcSeats" :key="s.subject"
                    :x1="s.xPct" :y1="s.yPx" :x2="DIRECTOR.xPct" :y2="DIRECTOR.yPx"
                    :stroke="s.accent"
                    :stroke-opacity="activeSubject === s.subject ? 0.7 : (activeSubject ? 0.06 : 0.16)"
                    stroke-width="1.5" stroke-dasharray="4 6" stroke-linecap="round" vector-effect="non-scaling-stroke"
                  />
                </svg>

                <button
                  v-for="(s, i) in arcSeats" :key="s.subject"
                  v-reveal.fade="i"
                  class="dop__seat"
                  :style="{ left: s.left, top: s.top, '--accent': s.accent }"
                  :data-dim="activeSubject && activeSubject !== s.subject ? 'true' : 'false'"
                  :data-active="activeSubject === s.subject ? 'true' : 'false'"
                  :data-presenting="presentingSubject === s.subject ? 'true' : 'false'"
                  @click="focusDepartment(s.subject)"
                >
                  <span class="dop__seat-chip">
                    <Icon :name="s.icon" class="w-6 h-6" />
                    <span class="dop__seat-badge">{{ s.badge }}</span>
                    <!-- who's presenting this department -->
                    <span v-if="presentingSubject === s.subject" class="dop__seat-presenter" :title="`${presenter.name} is presenting`" :style="{ background: presenter.color }">{{ presenter.initials }}</span>
                  </span>
                  <span class="dop__seat-label">{{ s.label }}</span>
                  <span class="dop__seat-count">{{ s.count }}</span>
                </button>

                <div class="dop__director" :style="{ left: DIRECTOR.xPct + '%', top: DIRECTOR.yPx + 'px' }">
                  <span class="dop__director-chair"><DirectorChairIcon class="w-8 h-8" /></span>
                  <span class="dop__director-label">You</span>
                  <!-- live teammates, seated with you -->
                  <div v-if="attendees.length" class="dop__attendees">
                    <span v-for="a in attendees" :key="a.id" class="dop__att" :style="{ background: a.color }" :title="a.name">{{ a.initials }}</span>
                  </div>
                </div>
              </div>

              <!-- Detail cards -->
              <div v-else class="dop__grid">
                <button
                  v-for="(a, i) in agenda" :key="a.subject" v-reveal="i"
                  class="dop-card dop-card--agenda"
                  :data-dim="activeSubject && activeSubject !== a.subject ? 'true' : 'false'"
                  :data-active="activeSubject === a.subject ? 'true' : 'false'"
                  :style="{ '--accent': a.accent }"
                  @click="focusDepartment(a.subject)"
                >
                  <span class="dop-card__bar" :style="{ background: a.accent }" />
                  <span class="dop-card__icon" :style="{ color: a.accent, background: a.accent + '22' }"><Icon :name="a.icon" class="w-4 h-4" /></span>
                  <span class="dop-card__body">
                    <span class="dop-card__kicker">{{ a.label }}</span>
                    <span class="dop-card__title">{{ a.title }}</span>
                    <span class="dop-card__summary">{{ a.summary }}</span>
                  </span>
                  <span class="dop-card__count" :style="{ color: a.accent }">{{ a.count }}</span>
                </button>
              </div>
            </section>

            <!-- Plan -->
            <section>
              <div class="dop__label-row">
                <p class="dop__label">{{ activeAgenda ? activeAgenda.label + ' plan' : 'Proposed plan' }} · {{ openSteps }} awaiting you</p>
                <div class="dop__seg">
                  <button :data-on="viewMode === 'outline'" @click="viewMode = 'outline'"><Icon name="lucide:list" class="w-3.5 h-3.5" /> Outline</button>
                  <button :data-on="viewMode === 'slides'" @click="viewMode = 'slides'"><Icon name="lucide:gallery-horizontal-end" class="w-3.5 h-3.5" /> Slides</button>
                </div>
              </div>

              <div v-if="viewMode === 'outline'" class="dop__steps">
                <div v-for="(s, i) in steps" :key="s.id" v-reveal="i" class="dop-card dop-card--step" :data-status="s.status">
                  <span class="dop-card__icon dop-card__icon--step"><Icon :name="s.icon" class="w-4 h-4" /></span>
                  <span class="dop-card__body">
                    <span class="dop-card__title">{{ s.title }}</span>
                    <span class="dop-card__summary">{{ s.detail }}</span>
                  </span>
                  <span v-if="s.status === 'pending'" class="dop-card__actions">
                    <button class="dop-btn dop-btn--approve" @click="setStep(s.id, 'approved')"><Icon name="lucide:check" class="w-4 h-4" /> Approve</button>
                    <button class="dop-btn dop-btn--skip" @click="setStep(s.id, 'skipped')">Skip</button>
                  </span>
                  <span v-else class="dop-card__done" :data-status="s.status">
                    <Icon :name="s.status === 'approved' ? 'lucide:check-circle-2' : 'lucide:circle-slash'" class="w-4 h-4" />
                    {{ s.status === 'approved' ? 'Approved' : 'Skipped' }}
                  </span>
                </div>
              </div>

              <div v-else class="dop__slides">
                <CommandCenterDirectorSlides
                  :subject="activeSubject"
                  :scope-label="activeAgenda ? activeAgenda.label.toLowerCase() : 'the whole business'"
                  :intro="slideIntro" :points="slidePoints"
                  :finance="null" :opportunity="null" :client-rating="null"
                  :steps="steps as any"
                  @approve="(s:any) => setStep(s.id, 'approved')" @skip="(s:any) => setStep(s.id, 'skipped')"
                />
              </div>
            </section>
          </div>
        </Transition>
      </div>

      <footer class="dop__composer">
        <Icon name="lucide:message-circle" class="w-4 h-4 opacity-50" />
        <input :placeholder="activeAgenda ? `Ask about ${activeAgenda.label.toLowerCase()}…` : 'Raise a topic — “Are we on track to hit Q3 revenue?”'" />
        <button class="dop__send"><Icon name="lucide:arrow-up" class="w-4 h-4" /></button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.dop { position: fixed; inset: 0; color: #eef2f8; overflow: hidden; background: radial-gradient(140% 120% at 50% 8%, #0c1424 0%, #070b14 52%, #04060c 100%); }
.dop__inner { position: relative; z-index: 3; display: flex; flex-direction: column; height: 100%; max-width: 900px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 36px); }

.dop__top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 22px 2px 12px; }
.dop__brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
.dop__chair { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(12px); flex: none; }
.dop__title { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.dop__sub { margin: 2px 0 0; font-size: 12.5px; color: rgba(238,242,248,.5); }
.dop__sub-em { color: #eef2f8; font-weight: 600; }
.dop__controls { display: flex; align-items: center; gap: 8px; flex: none; }
.dop__pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; padding: 7px 13px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: rgba(238,242,248,.85); cursor: pointer; backdrop-filter: blur(12px); text-decoration: none; transition: background .2s, transform .25s cubic-bezier(.34,1.4,.5,1); }
.dop__pill:hover { background: rgba(255,255,255,.1); transform: translateY(-1px); }
.dop__pill--ghost { border-style: dashed; color: rgba(238,242,248,.6); }
.dop__icon { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; border: 0; background: transparent; color: rgba(238,242,248,.7); cursor: pointer; transition: background .2s; }
.dop__icon:hover { background: rgba(255,255,255,.08); color: #eef2f8; }

.dop__scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; padding: 6px 2px 10px; }
.dop__scroll::-webkit-scrollbar { display: none; }

.dop__loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; height: 100%; min-height: 300px; color: rgba(238,242,248,.6); }
.dop__spinner { position: relative; width: 52px; height: 52px; display: grid; place-items: center; color: #7fd7ff; }
.dop__spinner::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(127,215,255,.2); border-top-color: #7fd7ff; animation: dop-spin 0.9s linear infinite; }
@keyframes dop-spin { to { transform: rotate(360deg); } }

.dop__board { display: flex; flex-direction: column; gap: 22px; padding-bottom: 8px; }
.dop__label-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
.dop__label { margin: 0; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.42); }
.dop__right { display: flex; align-items: center; gap: 8px; }
.dop__reset { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: rgba(238,242,248,.7); cursor: pointer; transition: background .2s, color .2s; }
.dop__reset:hover { background: rgba(255,255,255,.1); color: #eef2f8; }
.dop__seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); }
.dop__seg button { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; padding: 4px 11px; border-radius: 999px; border: 0; background: transparent; color: rgba(238,242,248,.5); cursor: pointer; transition: background .2s, color .2s; }
.dop__seg button[data-on="true"] { background: rgba(255,255,255,.14); color: #eef2f8; }

/* Half-circle board */
.dop__arc { position: relative; margin: 2px 0 6px; }
.dop__arc-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
/* anchored to the CHIP centre (translate -30px = half the 60px chip) so the
   connector lines land dead-centre; label + count flow below the anchor. */
.dop__seat { position: absolute; transform: translate(-50%, -30px); display: flex; flex-direction: column; align-items: center; gap: 6px; width: 96px; background: transparent; border: 0; cursor: pointer; transition: opacity .3s; }
.dop__seat[data-dim="true"] { opacity: .38; }
.dop__seat-chip { position: relative; width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.14); background: color-mix(in oklab, var(--accent) 16%, rgba(255,255,255,.05)); color: color-mix(in oklab, var(--accent), white 22%); backdrop-filter: blur(12px); box-shadow: 0 12px 30px -14px rgba(0,0,0,.7); transition: transform .34s cubic-bezier(.34,1.5,.5,1), box-shadow .3s, border-color .25s; }
.dop__seat:hover .dop__seat-chip { transform: translateY(-4px) scale(1.06); border-color: color-mix(in oklab, var(--accent), white 20%); }
.dop__seat[data-active="true"] .dop__seat-chip { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), 0 14px 34px -12px color-mix(in oklab, var(--accent) 60%, transparent); }
.dop__seat-badge { position: absolute; top: -5px; right: -5px; min-width: 21px; height: 21px; padding: 0 6px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #06121f; background: var(--accent); box-shadow: 0 2px 8px -2px rgba(0,0,0,.6); }
.dop__seat-label { font-size: 12px; font-weight: 600; letter-spacing: -0.01em; }
.dop__seat-count { font-size: 10.5px; color: rgba(238,242,248,.5); margin-top: -3px; }
/* presenter avatar + pulse ring on the department a teammate is presenting */
.dop__seat-presenter { position: absolute; bottom: -5px; left: -5px; width: 21px; height: 21px; border-radius: 50%; border: 2px solid #0a1220; display: grid; place-items: center; font-size: 8.5px; font-weight: 700; color: #06121f; }
.dop__seat[data-presenting="true"] .dop__seat-chip::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; border: 2px solid var(--accent); animation: dop-ring 1.9s ease-out infinite; pointer-events: none; }
@keyframes dop-ring { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(1.42); opacity: 0; } }

.dop__director { position: absolute; transform: translate(-50%, -30px); display: flex; flex-direction: column; align-items: center; gap: 5px; }
.dop__director-chair { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; color: #eef2f8; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(14px); box-shadow: 0 0 44px -6px rgba(120,150,220,.5); }
.dop__director-label { font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.55); }
.dop__attendees { display: flex; margin-top: 3px; }
.dop__att { width: 23px; height: 23px; border-radius: 50%; margin-left: -7px; border: 2px solid #0a1220; display: grid; place-items: center; font-size: 9px; font-weight: 700; color: #06121f; box-shadow: 0 2px 6px -2px rgba(0,0,0,.6); }
.dop__att:first-child { margin-left: 0; }

.dop__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dop__steps { display: flex; flex-direction: column; gap: 10px; }

.dop-card { position: relative; display: flex; gap: 13px; align-items: flex-start; text-align: left; padding: 15px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); backdrop-filter: blur(20px); color: inherit; cursor: pointer; overflow: hidden; box-shadow: 0 18px 44px -28px rgba(0,0,0,.8); transition: background .25s, border-color .25s, transform .34s cubic-bezier(.34,1.4,.5,1), box-shadow .3s, opacity .25s; }
.dop-card:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.2); transform: translateY(-3px); box-shadow: 0 26px 54px -26px rgba(0,0,0,.85); }
.dop-card[data-dim="true"] { opacity: .4; }
.dop-card[data-active="true"] { border-color: color-mix(in oklab, var(--accent), white 10%); background: color-mix(in oklab, var(--accent) 14%, rgba(255,255,255,.05)); box-shadow: 0 22px 50px -24px rgba(0,0,0,.85), 0 0 0 1px var(--accent) inset; }
.dop-card__bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; opacity: .9; }
.dop-card__icon { width: 32px; height: 32px; border-radius: 11px; display: grid; place-items: center; flex: none; }
.dop-card__icon--step { color: #9fb4d8; background: rgba(159,180,216,.14); }
.dop-card__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.dop-card__kicker { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(238,242,248,.4); }
.dop-card__title { font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em; }
.dop-card__summary { font-size: 12.5px; line-height: 1.5; color: rgba(238,242,248,.58); }
.dop-card__count { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; flex: none; }

.dop-card--step { cursor: default; align-items: center; }
.dop-card--step[data-status="skipped"] { opacity: .5; }
.dop-card__actions { display: flex; align-items: center; gap: 7px; flex: none; }
.dop-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 999px; border: 0; cursor: pointer; transition: transform .2s, filter .2s, background .2s; }
.dop-btn--approve { color: #06121f; background: linear-gradient(150deg, #7fe6b0, #3fbe82); }
.dop-btn--approve:hover { transform: translateY(-1px); filter: brightness(1.06); }
.dop-btn--skip { color: rgba(238,242,248,.6); background: rgba(255,255,255,.06); }
.dop-btn--skip:hover { background: rgba(255,255,255,.12); color: #eef2f8; }
.dop-card__done { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; flex: none; }
.dop-card__done[data-status="approved"] { color: #4fce97; }
.dop-card__done[data-status="skipped"] { color: rgba(238,242,248,.45); }

.dop__slides { border-radius: 22px; overflow: hidden; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); }

.dop__composer { display: flex; align-items: center; gap: 10px; margin: 6px 0 20px; padding: 9px 10px 9px 16px; border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.13); backdrop-filter: blur(20px); box-shadow: 0 18px 50px -24px rgba(0,0,0,.7); }
.dop__composer input { flex: 1; border: 0; background: transparent; color: #eef2f8; font: inherit; font-size: 14px; outline: none; }
.dop__composer input::placeholder { color: rgba(238,242,248,.4); }
.dop__send { width: 38px; height: 38px; flex: none; border-radius: 50%; border: 0; display: grid; place-items: center; color: #06121f; background: linear-gradient(150deg, #8fd3ff, #4da6ff); cursor: pointer; transition: transform .18s; }
.dop__send:hover { transform: scale(1.06); }

.dop-fade-enter-active, .dop-fade-leave-active { transition: opacity .4s ease; }
.dop-fade-enter-from, .dop-fade-leave-to { opacity: 0; }

@media (max-width: 640px) { .dop__grid { grid-template-columns: 1fr; } }
</style>
