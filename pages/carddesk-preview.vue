<script setup lang="ts">
// ─── Drop into pages/carddesk-preview.vue ────────────────────────────────────
// Route: /carddesk-preview   |   layout: false (fully isolated)
// Only dependency: canvas-confetti (already in your package.json)
definePageMeta({ layout: false })

import confettiLib from 'canvas-confetti'
import { ref, computed, onMounted } from 'vue'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Activity {
  id: string; type: string; label: string; date: string
  note: string; isResponse: boolean; responseNote?: string
}
interface Contact {
  id: string; name: string; title?: string; company?: string
  email?: string; phone?: string; industry?: string; metAt?: string
  rating: string; hibernated: boolean; hibernatedAt?: string
  activities: Activity[]; createdAt: string; notes?: string
}
type Screen = 'vibe' | 'session' | 'cold' | 'home' | 'contacts' | 'detail' | 'add'

// ─── Static data (ALL kept in script to avoid quote-in-attribute parser errors)
const RATINGS = [
  { key: 'hot',     label: 'Hot',     emoji: '🔥', color: '#ff6b35' },
  { key: 'warm',    label: 'Warm',    emoji: '👍', color: '#ffe033' },
  { key: 'nurture', label: 'Nurture', emoji: '🌱', color: '#00c268' },
  { key: 'cold',    label: 'Cold',    emoji: '❄️', color: '#4da6ff' },
]
const ACT_TYPES = [
  { key: 'email',    label: 'Email',    icon: '📧' },
  { key: 'text',     label: 'Text',     icon: '📱' },
  { key: 'call',     label: 'Call',     icon: '📞' },
  { key: 'meeting',  label: 'Meeting',  icon: '🤝' },
  { key: 'linkedin', label: 'LinkedIn', icon: '🔗' },
  { key: 'other',    label: 'Other',    icon: '💬' },
]
const INDUSTRIES = ['Technology','Finance','Healthcare','Real Estate','Legal','Marketing','Venture Capital','Other']
const EMOJIS = ['🐯','🦁','🦊','🐺','🦋','🐬','🦉','🦝','🐠','🦌','🦅','🌊']
const LEVELS = [
  { level: 1, title: 'Rookie',    xp: 0     },
  { level: 2, title: 'Hustler',   xp: 200   },
  { level: 3, title: 'Connector', xp: 500   },
  { level: 4, title: 'Player',    xp: 1000  },
  { level: 5, title: 'Rainmaker', xp: 2000  },
  { level: 6, title: 'Closer',    xp: 5000  },
  { level: 7, title: 'Networker', xp: 10000 },
  { level: 8, title: 'Dealmaker', xp: 20000 },
  { level: 9, title: 'Legend',    xp: 50000 },
]
const BADGES = [
  { key: 'card_shark',   emoji: '🃏', label: 'Card Shark',   desc: 'Scan 5 cards',           check: (s: any) => s.totalScans >= 5 },
  { key: 'hot_streak',   emoji: '🔥', label: 'Hot Streak',   desc: '7-day streak',            check: (s: any) => s.streak >= 7 },
  { key: 'speed_dialer', emoji: '⚡', label: 'Speed Dialer', desc: 'Follow up within 24h',    check: (s: any) => s.fastFollowups >= 1 },
  { key: 'networker',    emoji: '🌐', label: 'Networker',    desc: 'Add 10 contacts',         check: (s: any) => s.totalContacts >= 10 },
  { key: 'dealmaker',    emoji: '💎', label: 'Dealmaker',    desc: 'Response from Hot lead',  check: (s: any) => s.hotResponses >= 1 },
  { key: 'connector',    emoji: '🌉', label: 'Connector',    desc: 'Make 3 intros',           check: (s: any) => s.intros >= 3 },
  { key: 'legend',       emoji: '👑', label: 'Legend',       desc: 'Reach Level 9',           check: (s: any) => s.level >= 9 },
]
const MISSIONS = [
  { key: 'scan',     icon: '📷', label: 'Scan a Business Card', hype: 'Done. Like a machine.',              xp: 50  },
  { key: 'followup', icon: '✉️', label: 'Log a Follow-up',      hype: "They'll remember you.",              xp: 25  },
  { key: 'hot',      icon: '🔥', label: 'Follow Up a Hot Lead', hype: "Don't leave them hanging.",          xp: 50  },
  { key: 'response', icon: '✅', label: 'Log a Response',       hype: 'They came back. Of course they did.', xp: 100 },
]
const TOUGH_CARDS = [
  {
    q: 'Your hot leads are going cold right now.',
    b: 'These conversations could change things — sitting there, waiting. You know what to do. <em>One text.</em> Not five. <strong>One.</strong>',
  },
  {
    q: 'The follow-up window does not stay open forever.',
    b: "But it's still open <em>right now.</em> You'll feel better the second you hit send. Start. One line. Just real.",
  },
  {
    q: 'Your streak is worth protecting tonight.',
    b: "You've been showing up. Don't let tonight break it. One touchpoint. Doesn't have to be clever. Just <em>real.</em>",
  },
]
const HYPE_CARDS = [
  {
    q: 'Your response rate is well above average.',
    b: "People don't reply out of politeness — they reply because <strong>you're worth their time.</strong> Go remind someone you exist.",
  },
  {
    q: 'You are in the top tier of networkers.',
    b: "You show up, follow through, make people feel seen. That's a <em>rare</em> skill. Most people don't have it. <strong>You do. Own it.</strong>",
  },
  {
    q: 'Every great connection started with one message.',
    b: "Not a pitch deck. Not a post. <em>One message.</em> That's the whole playbook. <strong>Do it again.</strong>",
  },
]
const COLD_WARMERS = [
  "It's a bummer, but maybe they just need time to thaw out. You met for a reason.",
  "Sometimes the slow burns lead to the best leads. Your patience is a competitive advantage.",
  "Maybe they're just busy — remind them how you can enhance their world.",
]
const VIBE_MOODS = [
  { e: '😶‍🌫️', title: 'Feeling antisocial lately?',   color: 'blue',   body: "We get it. One message. You don't have to be 'on' — just human. That's always enough." },
  { e: '🔥',   title: 'You are absolutely killing it.', color: 'green',  body: "Contacts growing, streak alive. You're not just networking — you're building a career asset." },
  { e: '😴',   title: 'A little tired today?',          color: 'blue',   body: 'A 2-second LinkedIn reaction keeps the connection warm and saves your streak. Minimum effort, maximum effect.' },
  { e: '🏆',   title: 'You are brilliant at this.',     color: 'green',  body: "You show up, follow through, make people feel seen. That's not the app — that's you being exceptional." },
  { e: '🛋️',   title: 'Introverted this week?',         color: 'purple', body: "Pick your 3 hottest leads. One message each. Done in 5 minutes." },
]

// Panel reference data
const PANEL_TABS = [
  { k: 'vibe',     icon: '⚡', label: 'Vibe'      },
  { k: 'session',  icon: '🎙', label: 'Session'   },
  { k: 'cold',     icon: '❄️', label: 'Cold'      },
  { k: 'home',     icon: '🏠', label: 'Dashboard' },
  { k: 'contacts', icon: '👥', label: 'Network'   },
  { k: 'add',      icon: '📷', label: 'Add'       },
]
const PANEL_SCREENS = [
  { icon: '⚡', name: 'Vibe Feed',  tag: 'LANDING', tc: 'var(--cd-accent)', desc: 'Live hype cards, cold warmers, overdue alerts, session entry, rotating mood card, and tips. All pull from real contact data.' },
  { icon: '🎙', name: 'Session',    tag: 'NEW',     tc: 'var(--cd-purple)', desc: 'Talking to (tough love) or Picker upper (hype). 3 rotating rounds each. Anchored by the lucky ones reminder.' },
  { icon: '❄️', name: 'Cold',       tag: 'NEW',     tc: 'var(--cd-ice)',    desc: 'Cold contacts with personalised warm-up copy. Tap to expand. Hibernate instead of delete.' },
  { icon: '🏠', name: 'Dashboard',  tag: 'CORE',    tc: 'var(--cd-dim)',    desc: 'XP bar, level, 7-day streak with fire animation, daily missions, badge shelf. All live data.' },
  { icon: '👥', name: 'Network',    tag: 'CORE',    tc: 'var(--cd-dim)',    desc: 'Filtered contact list. Tap any contact to open the full detail view with activity timeline and log form.' },
  { icon: '📷', name: 'Add',        tag: 'CORE',    tc: 'var(--cd-dim)',    desc: 'Manual form + AI scan zone with confetti. Rating picker. Saves to localStorage instantly. +50 XP on scan.' },
]
const PANEL_WARMERS = [
  { icon: '❄️', text: "It's a bummer, but maybe they just need time to thaw out. That doesn't mean the connection isn't real." },
  { icon: '🕯', text: "Sometimes the slow burns lead to the best leads — don't give up. Your patience is a competitive advantage." },
  { icon: '🌍', text: "Maybe they're just busy — remind them how you can enhance their world. A genuine check-in goes further than you think." },
  { icon: '🌅', text: "Welcome back — timing is everything, and yours might be perfect right now. You're fresh on the scene again." },
]
const PANEL_XP = [
  { action: '📷 Scan a card',       pts: '50 XP'  },
  { action: '✉️ Log follow-up',      pts: '25 XP'  },
  { action: '🎉 Got a response',     pts: '100 XP' },
  { action: '🔥 Follow up Hot lead', pts: '50 XP'  },
  { action: '🎯 Complete mission',   pts: '50 XP'  },
  { action: '🔥 7-day streak bonus', pts: '200 XP' },
  { action: '🌉 Make an intro',      pts: '150 XP' },
  { action: '🏅 Unlock badge',       pts: '75 XP'  },
]

const XP_ACTIONS: Record<string, { xp: number; icon: string; msg: string }> = {
  scan_card:       { xp: 50,  icon: '📷', msg: 'Card scanned!' },
  log_followup:    { xp: 25,  icon: '✉️', msg: "They'll remember you." },
  got_response:    { xp: 100, icon: '🎉', msg: 'They came back. Of course they did.' },
  hot_followup:    { xp: 50,  icon: '⚡', msg: "Don't leave them hanging." },
  complete_mission:{ xp: 50,  icon: '🎯', msg: 'Mission complete.' },
  save_contact:    { xp: 25,  icon: '💾', msg: "They're in your network." },
}

// ─── Reactive state ────────────────────────────────────────────────────────────
const screen     = ref<Screen>('vibe')
const contacts   = ref<Contact[]>([])
const xp         = ref({
  totalXP: 0, level: 1, streak: 0, lastActivityDate: '',
  totalScans: 0, totalContacts: 0, fastFollowups: 0, hotResponses: 0, intros: 0,
  unlockedBadges: [] as string[], completedMissions: [] as string[], missionsDate: '',
})
const toast      = ref<{ xp: string; icon: string; msg: string } | null>(null)
const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const moodIdx    = ref(0)
const toughIdx   = ref(0)
const hypeIdx    = ref(0)
const sessionMode = ref<'tough' | 'hype' | null>(null)
const openCold   = ref<string[]>([])
const selectedId = ref<string | null>(null)
const editing    = ref(false)
const editForm   = ref<Partial<Contact>>({})
const cSearch    = ref('')
const cFilter    = ref('')
const cSort      = ref('recent')
const actType    = ref('email')
const actNote    = ref('')
const actDate    = ref(todayStr())
const addForm    = ref({ firstName: '', lastName: '', title: '', company: '', email: '', phone: '', industry: '', metAt: '', rating: '', notes: '' })

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function todayStr() { return new Date().toISOString().slice(0, 10) }
function formatDate(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtShort(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function daysSince(d?: string) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}
function cEmoji(c: Contact) {
  return EMOJIS[Math.abs((c.id.charCodeAt(0) || 0) + (c.id.charCodeAt(1) || 0)) % EMOJIS.length]
}
function getRating(k: string) { return RATINGS.find(r => r.key === k) || null }
function getAct(k: string)    { return ACT_TYPES.find(a => a.key === k) || ACT_TYPES[5] }
function lastAct(c: Contact) {
  if (!c.activities?.length) return null
  return [...c.activities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
}
function daysSinceLast(c: Contact) { return daysSince(lastAct(c)?.date) }
function fuStatus(c: Contact): 'overdue' | 'due' | 'ok' | 'new' {
  if (!c.activities?.length) return 'new'
  const la = lastAct(c); if (!la) return 'new'
  const d = daysSince(la.date) ?? 0
  if (d >= 10 && !la.isResponse) return 'overdue'
  if (d >= 7) return 'due'
  return 'ok'
}
function needsFU(c: Contact) { return !c.hibernated && fuStatus(c) === 'overdue' }
function fuInfo(c: Contact) {
  const s = fuStatus(c), la = lastAct(c), d = la ? daysSince(la.date) : null
  const map = {
    overdue: { ico: '⚡', cls: 'overdue', title: `${d} days overdue — don't let this one slip`,           sub: `Last: ${la?.label || 'Contact'} on ${formatDate(la?.date)} · ${la?.isResponse ? '✓ Replied' : 'No reply yet'}` },
    due:     { ico: '⏰', cls: 'due',     title: `${d} days since last contact — right on the line`,        sub: 'A quick touch now resets the clock.' },
    ok:      { ico: '✓',  cls: 'ok',     title: "You're on top of this one",                               sub: `Last: ${la?.label || 'Contact'} on ${formatDate(la?.date)} · ${la?.isResponse ? '✓ Replied' : 'Awaiting reply'}` },
    new:     { ico: '👋', cls: 'new',    title: 'No activity logged yet',                                  sub: 'Use the form below to log your first touchpoint.' },
  }
  return map[s]
}
function coldWarmer(c: Contact) {
  const d = daysSinceLast(c) || 0
  if (d >= 30) return COLD_WARMERS[1]
  return COLD_WARMERS[Math.abs(c.id.charCodeAt(0)) % 3]
}

// ─── Persistence ──────────────────────────────────────────────────────────────
function save() {
  if (typeof window === 'undefined') return
  localStorage.setItem('cd2_c', JSON.stringify(contacts.value))
  localStorage.setItem('cd2_x', JSON.stringify(xp.value))
}
function load() {
  if (typeof window === 'undefined') return
  try { const c = localStorage.getItem('cd2_c'); if (c) contacts.value = JSON.parse(c) } catch {}
  try { const x = localStorage.getItem('cd2_x'); if (x) xp.value = { ...xp.value, ...JSON.parse(x) } } catch {}
  const today = todayStr()
  if (xp.value.missionsDate !== today) {
    xp.value.completedMissions = []
    xp.value.missionsDate = today
    save()
  }
}

// ─── XP Engine ────────────────────────────────────────────────────────────────
function showToast(xpStr: string, icon: string, msg: string) {
  toast.value = { xp: xpStr, icon, msg }
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => toast.value = null, 2400)
}
function earnXP(action: string, extra: Record<string, any> = {}) {
  const a = XP_ACTIONS[action]; if (!a) return
  xp.value.totalXP += a.xp
  Object.assign(xp.value, extra)
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp.value.totalXP >= LEVELS[i].xp) { xp.value.level = LEVELS[i].level; break }
  }
  const today = todayStr()
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (xp.value.lastActivityDate !== today) {
    xp.value.streak = (xp.value.lastActivityDate === yesterday) ? xp.value.streak + 1 : 1
    xp.value.lastActivityDate = today
  }
  BADGES.forEach(b => {
    if (!xp.value.unlockedBadges.includes(b.key) && b.check(xp.value)) {
      xp.value.unlockedBadges.push(b.key)
      xp.value.totalXP += 75
      showToast('+75 XP', b.emoji, b.label + ' unlocked!')
    }
  })
  save()
  showToast('+' + a.xp + ' XP', a.icon, a.msg)
}

// ─── Computed ─────────────────────────────────────────────────────────────────
const curLvl     = computed(() => LEVELS.find(l => l.level === xp.value.level) || LEVELS[0])
const nextLvl    = computed(() => LEVELS.find(l => l.level === xp.value.level + 1) || null)
const xpPct      = computed(() => {
  if (!nextLvl.value) return 100
  const c = curLvl.value.xp, n = nextLvl.value.xp
  return Math.min(100, Math.round(((xp.value.totalXP - c) / (n - c)) * 100))
})
const xpToNext   = computed(() => nextLvl.value ? nextLvl.value.xp - xp.value.totalXP : 0)
const sDots      = computed(() => {
  const d = []
  for (let i = 0; i < 7; i++) {
    const ago = 6 - i
    if (ago === 0) d.push(xp.value.streak > 0 ? 'today' : 'empty')
    else d.push(xp.value.streak > ago ? 'done' : 'empty')
  }
  return d
})
const alertCs    = computed(() => contacts.value.filter(needsFU))
const coldCs     = computed(() => contacts.value.filter(c => c.rating === 'cold' && !c.hibernated))
const hibCs      = computed(() => contacts.value.filter(c => c.hibernated))
const hotCount   = computed(() => contacts.value.filter(c => c.rating === 'hot').length)
const curMood    = computed(() => VIBE_MOODS[moodIdx.value % VIBE_MOODS.length])
const curTough   = computed(() => TOUGH_CARDS[toughIdx.value % TOUGH_CARDS.length])
const curHype    = computed(() => HYPE_CARDS[hypeIdx.value % HYPE_CARDS.length])
const selContact = computed(() => contacts.value.find(c => c.id === selectedId.value) || null)
const sortedActs = computed(() => {
  if (!selContact.value?.activities?.length) return []
  return [...selContact.value.activities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})
const addName    = computed(() => [addForm.value.firstName, addForm.value.lastName].filter(Boolean).join(' '))
const RORD: Record<string, number> = { hot: 0, warm: 1, nurture: 2, cold: 3, '': 4 }
const filteredCs = computed(() => {
  const q = cSearch.value.toLowerCase()
  let list = contacts.value.filter(c =>
    !c.hibernated &&
    (c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)) &&
    (cFilter.value === '' || c.rating === cFilter.value)
  )
  if (cSort.value === 'hot') list = [...list].sort((a, b) => (RORD[a.rating || ''] ?? 4) - (RORD[b.rating || ''] ?? 4))
  else if (cSort.value === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return list
})

// ─── Actions ──────────────────────────────────────────────────────────────────
function nav(s: Screen) { screen.value = s }
function goDetail(id: string) { selectedId.value = id; nav('detail') }
function toggleCold(id: string) {
  openCold.value = openCold.value.includes(id)
    ? openCold.value.filter(x => x !== id)
    : [...openCold.value, id]
}
function hibernate(id: string) {
  contacts.value = contacts.value.map(c => c.id === id ? { ...c, hibernated: true, hibernatedAt: todayStr() } : c)
  openCold.value = openCold.value.filter(x => x !== id && x !== id + '_h')
  save()
  showToast('', '😴', 'On ice — not gone.')
}
function wake(id: string) {
  contacts.value = contacts.value.map(c => c.id === id ? { ...c, hibernated: false, hibernatedAt: undefined } : c)
  save()
  earnXP('log_followup')
}
function logAct(isResp: boolean) {
  if (!selContact.value) return
  const act: Activity = {
    id: uid(), type: actType.value,
    label: getAct(actType.value).label,
    date: actDate.value || todayStr(),
    note: actNote.value, isResponse: isResp,
  }
  contacts.value = contacts.value.map(c =>
    c.id === selectedId.value ? { ...c, activities: [act, ...(c.activities || [])] } : c
  )
  save()
  actNote.value = ''
  actDate.value = todayStr()
  if (isResp) {
    const extra = selContact.value?.rating === 'hot' ? { hotResponses: (xp.value.hotResponses || 0) + 1 } : {}
    earnXP('got_response', extra)
    fireConfetti()
  } else {
    selContact.value?.rating === 'hot' ? earnXP('hot_followup') : earnXP('log_followup')
  }
}
function toggleResp(actId: string) {
  if (!selContact.value) return
  contacts.value = contacts.value.map(c => {
    if (c.id !== selectedId.value) return c
    return { ...c, activities: c.activities.map(a => a.id === actId ? { ...a, isResponse: true, responseNote: 'Responded' } : a) }
  })
  save()
  earnXP('got_response')
  fireConfetti()
}
function saveContact() {
  if (!addName.value) return
  const id = uid()
  const c: Contact = {
    id, name: addName.value,
    title: addForm.value.title, company: addForm.value.company,
    email: addForm.value.email, phone: addForm.value.phone,
    industry: addForm.value.industry, metAt: addForm.value.metAt,
    notes: addForm.value.notes, rating: addForm.value.rating,
    hibernated: false, activities: [], createdAt: todayStr(),
  }
  contacts.value = [c, ...contacts.value]
  save()
  earnXP('save_contact', { totalContacts: contacts.value.length })
  addForm.value = { firstName: '', lastName: '', title: '', company: '', email: '', phone: '', industry: '', metAt: '', rating: '', notes: '' }
  nav('contacts')
}
function doMission(key: string) {
  if (xp.value.completedMissions.includes(key)) return
  xp.value.completedMissions.push(key)
  earnXP('complete_mission' as any)
}
function startEdit() {
  if (!selContact.value) return
  editForm.value = { ...selContact.value }
  editing.value = true
}
function saveEdit() {
  contacts.value = contacts.value.map(c => c.id === selectedId.value ? { ...c, ...editForm.value } : c)
  save()
  editing.value = false
}
function fireConfetti() {
  confettiLib({ particleCount: 60, spread: 70, origin: { y: 0.6 }, colors: ['#00ff87','#ffd700','#ff6b35','#4da6ff','#b87dff'] })
}

// ─── Demo seed ────────────────────────────────────────────────────────────────
function seed() {
  if (contacts.value.length > 0) return
  const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
  contacts.value = [
    {
      id: uid(), name: 'Sarah Chen', title: 'VP Product', company: 'Orion Health',
      email: 'sarah@orion.com', industry: 'Technology', metAt: 'SaaS Summit NYC',
      rating: 'hot', hibernated: false, createdAt: ago(28),
      activities: [
        { id: uid(), type: 'email',    label: 'Email',    date: ago(15), note: 'Follow-up after SaaS Summit — asked about the Orion Q3 roadmap.',                              isResponse: false },
        { id: uid(), type: 'linkedin', label: 'LinkedIn', date: ago(27), note: 'Connected on LinkedIn with a personalised note referencing the AI in healthcare conversation.', isResponse: true, responseNote: 'Accepted within the hour' },
        { id: uid(), type: 'meeting',  label: 'Meeting',  date: ago(28), note: 'Met at SaaS Summit NYC. Really aligned on AI in healthcare workflows. Q3 budget coming up.',    isResponse: true, responseNote: 'Great conversation' },
      ],
    },
    {
      id: uid(), name: 'Marcus Webb', title: 'MD', company: 'Meridian Capital',
      email: 'mwebb@meridian.com', industry: 'Finance', metAt: 'Meridian Investor Dinner',
      rating: 'hot', hibernated: false, createdAt: ago(19),
      activities: [
        { id: uid(), type: 'call',    label: 'Call',    date: ago(8),  note: 'Quick call — interested in platform overview. Said to send deck this week.', isResponse: true, responseNote: 'Send the deck' },
        { id: uid(), type: 'email',   label: 'Email',   date: ago(16), note: 'Sent over the one-pager he asked for at dinner.',                            isResponse: true, responseNote: 'Replied same day' },
        { id: uid(), type: 'meeting', label: 'Meeting', date: ago(19), note: 'Met at Meridian Investor Dinner. MD, knows everyone. Very warm energy.',     isResponse: true, responseNote: 'Great energy' },
      ],
    },
    {
      id: uid(), name: 'James Okafor', title: 'Partner', company: 'Vantage Law',
      industry: 'Legal', metAt: 'Networking Breakfast', rating: 'warm', hibernated: false, createdAt: ago(26),
      activities: [
        { id: uid(), type: 'email',   label: 'Email',   date: ago(6),  note: 'Offered to connect him with the Orion team if useful.',   isResponse: false },
        { id: uid(), type: 'text',    label: 'Text',    date: ago(12), note: 'Congrats text on the Vantage announcement.',              isResponse: true, responseNote: "Thanks! Coffee soon" },
        { id: uid(), type: 'meeting', label: 'Meeting', date: ago(26), note: 'Met at Networking Breakfast. Partner at Vantage Law M&A.', isResponse: true, responseNote: 'Solid connection' },
      ],
    },
    {
      id: uid(), name: 'Diana Russo', title: 'CEO', company: 'Flux Studio',
      industry: 'Design', metAt: 'Founders Dinner', rating: 'nurture', hibernated: false, createdAt: ago(30),
      activities: [
        { id: uid(), type: 'text',    label: 'Text',    date: ago(4),  note: 'Congrats text on the Flux Studio rebrand.', isResponse: true, responseNote: 'Thanks! Love that you noticed' },
        { id: uid(), type: 'meeting', label: 'Meeting', date: ago(30), note: 'Met at Founders Dinner. CEO of Flux Studio. Long game.', isResponse: true, responseNote: 'Warm connection' },
      ],
    },
    {
      id: uid(), name: 'Priya Mehta', title: 'Director', company: 'WestBridge RE',
      industry: 'Real Estate', metAt: 'RE Investors Forum', rating: 'cold', hibernated: false, createdAt: ago(22),
      activities: [
        { id: uid(), type: 'email',   label: 'Email',   date: ago(18), note: 'Following up from the RE Investors Forum — offered to share commercial trend data.', isResponse: false },
        { id: uid(), type: 'meeting', label: 'Meeting', date: ago(22), note: 'Met at RE Investors Forum. Polite but guarded. Gave her card.',                      isResponse: false },
      ],
    },
    {
      id: uid(), name: 'Noel Patterson', title: 'Partner', company: 'Criterion Ventures',
      industry: 'Venture Capital', metAt: 'VC Summit', rating: 'cold',
      hibernated: true, hibernatedAt: ago(6), createdAt: ago(45),
      activities: [
        { id: uid(), type: 'email', label: 'Email', date: ago(38), note: 'Follow-up after VC Summit. No reply.', isResponse: false },
      ],
    },
  ]
  xp.value = {
    ...xp.value,
    totalXP: 1340, level: 7, streak: 7, lastActivityDate: todayStr(),
    totalScans: 5, totalContacts: 6,
    unlockedBadges: ['card_shark', 'hot_streak', 'networker'],
    completedMissions: ['scan', 'followup'],
    missionsDate: todayStr(),
  }
  save()
}

onMounted(() => { load(); seed() })
</script>

<template>
<div class="cd-root">

  <!-- ══ PHONE SHELL ══════════════════════════════════════════════════════════ -->
  <div class="cd-phone-col">
    <div class="cd-phone">
      <div class="cd-notch"></div>
      <div class="cd-inner">
        <div class="cd-sbar">
          <span>9:41</span>
          <span style="font-family:var(--cd-mono);font-size:11px">Card<span style="color:var(--cd-accent)">Desk</span></span>
        </div>

        <!-- ■■ VIBE FEED ■■ -->
        <div class="cd-screen" :class="{on:screen==='vibe'}">
          <div class="cd-shdr">
            <div class="cd-stitle">Your Vibe ⚡</div>
            <div class="cd-ssub">What's happening in your world right now</div>
          </div>
          <div class="cd-scrl cd-pad">

            <!-- Session entry -->
            <div class="cd-sess-entry" @click="nav('session')">
              <div class="cd-se-top">
                <span style="font-size:26px">🎙</span>
                <div>
                  <div class="cd-se-ttl">Need a session?</div>
                  <div class="cd-se-sub">30 seconds. You'll feel better. Promise.</div>
                </div>
              </div>
              <div class="cd-se-modes">
                <button class="cd-semp tg" @click.stop="nav('session');sessionMode='tough'">💪 Talking to</button>
                <button class="cd-semp pk" @click.stop="nav('session');sessionMode='hype'">🏆 Picker upper</button>
              </div>
            </div>

            <!-- Hype card -->
            <div class="cd-vc hype" @click="fireConfetti();earnXP('log_followup')">
              <div class="cd-vct">
                <span class="cd-vci">🏆</span>
                <div style="flex:1">
                  <div class="cd-vch" style="color:var(--cd-accent)">Nobody crushes it like you.</div>
                  <div class="cd-vcb">{{ contacts.length }} contacts in your network, {{ xp.streak }}-day streak. <strong>You're building something real here.</strong></div>
                </div>
                <span class="cd-xpb">+20 XP</span>
              </div>
              <button class="cd-abtn g">🤘 Claim your glory</button>
            </div>

            <!-- Cold warmer -->
            <div v-if="coldCs.length" class="cd-vc cold-vc" @click="nav('cold')">
              <div class="cd-vct">
                <span class="cd-vci">❄️</span>
                <div style="flex:1">
                  <div class="cd-vch" style="color:var(--cd-ice)">{{ coldCs[0].name }} has gone quiet.</div>
                  <div class="cd-vcb">Sometimes the slow burns lead to the best leads. One check-in could be all it takes.</div>
                </div>
              </div>
              <button class="cd-abtn ice" @click.stop="nav('cold')">🌡 See cold contacts</button>
            </div>

            <!-- Overdue alert -->
            <div v-if="alertCs.length" class="cd-vc warn" @click="goDetail(alertCs[0].id)">
              <div class="cd-vct">
                <span class="cd-vci">⚡</span>
                <div style="flex:1">
                  <div class="cd-vch" style="color:var(--cd-orange)">{{ alertCs[0].name }} is slipping away.</div>
                  <div class="cd-vcb">{{ daysSinceLast(alertCs[0]) }} days without a follow-up.<span v-if="alertCs[0].rating==='hot'"> They were 🔥 Hot. That window is still open.</span></div>
                </div>
              </div>
              <button class="cd-abtn o" @click.stop="goDetail(alertCs[0].id)">⚡ Follow up now</button>
              <div class="cd-vtime">{{ alertCs.length }} overdue contact{{ alertCs.length > 1 ? 's' : '' }}</div>
            </div>

            <!-- Mood card -->
            <div class="cd-mood" @click="moodIdx++">
              <div style="font-size:24px;margin-bottom:5px">{{ curMood.e }}</div>
              <div class="cd-mc-t" :class="curMood.color">{{ curMood.title }}</div>
              <div class="cd-mc-b">{{ curMood.body }}</div>
              <div style="font-size:10px;color:var(--cd-dim);margin-top:7px;font-family:var(--cd-mono)">tap to rotate</div>
            </div>

            <!-- Tips -->
            <div class="cd-vc tip-vc">
              <div class="cd-vct">
                <span class="cd-vci">💡</span>
                <div style="flex:1">
                  <div class="cd-vch" style="color:var(--cd-purple)">Pro tip: the 48-hour rule</div>
                  <div class="cd-vcb">Follow up within 48 hours of meeting someone and you're <strong>5x more likely</strong> to get a response.</div>
                </div>
              </div>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                <span class="cd-tip-tag">⏰ 48hrs</span>
                <span class="cd-tip-tag">📧 Personal email</span>
                <span class="cd-tip-tag">🎯 Reference the convo</span>
              </div>
            </div>

            <div class="cd-vc tip-vc">
              <div class="cd-vct">
                <span class="cd-vci">😴</span>
                <div style="flex:1">
                  <div class="cd-vch" style="color:var(--cd-purple)">Hibernate, don't delete.</div>
                  <div class="cd-vcb">Nobody gets deleted — just paused. <strong>The person who ghosted you in Q1 might be your best intro in Q3.</strong></div>
                </div>
              </div>
              <button class="cd-abtn p" @click="nav('cold')">❄️ See cold contacts</button>
            </div>

          </div>
          <nav class="cd-bnav">
            <button class="cd-bn on"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn" @click="nav('session')"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn" @click="nav('cold')"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn" @click="nav('home')"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn" @click="nav('contacts')" style="position:relative">
              <span v-if="alertCs.length" class="cd-nav-dot"></span>
              <span class="cd-bni">👥</span>Network
            </button>
          </nav>
        </div>

        <!-- ■■ SESSION ■■ -->
        <div class="cd-screen" :class="{on:screen==='session'}">
          <div class="cd-scrl cd-pad" style="background:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(0,255,135,0.06) 0%,transparent 60%)">
            <div style="text-align:center;padding:12px 0 16px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--cd-accent);margin-bottom:4px">Your moment</div>
              <div style="font-family:var(--cd-bebas);font-size:44px;letter-spacing:1px;line-height:1;margin-bottom:6px">Need a session?</div>
              <div style="font-size:12px;color:var(--cd-muted);line-height:1.6">Pick your vibe. All you need is one text.</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
              <div class="cd-mcard tg" :class="{sel:sessionMode==='tough'}" @click="sessionMode='tough'">
                <div style="font-size:28px;margin-bottom:6px">💪</div>
                <div class="cd-mc-lbl">Need a talking to</div>
                <div class="cd-mc-sub">Real talk. No fluff. Time to move.</div>
              </div>
              <div class="cd-mcard pk" :class="{sel:sessionMode==='hype'}" @click="sessionMode='hype'">
                <div style="font-size:28px;margin-bottom:6px">🏆</div>
                <div class="cd-mc-lbl">Picker upper</div>
                <div class="cd-mc-sub">Pure hype. Your numbers say it all.</div>
              </div>
            </div>

            <Transition name="cd-pop">
              <div v-if="sessionMode==='tough'" class="cd-scard tc">
                <div class="cd-sc-eye orange">Talking to · Round {{ (toughIdx % 3) + 1 }} of 3</div>
                <div class="cd-sc-q">"{{ curTough.q }}"</div>
                <div class="cd-sc-b" v-html="curTough.b"></div>
                <button class="cd-abtn o" @click="earnXP('log_followup');toughIdx++">
                  ✉ Send one text now
                  <span class="cd-xpb" style="background:rgba(0,0,0,0.2);border:none;color:rgba(255,255,255,0.8)">+25 XP</span>
                </button>
                <div class="cd-nxt" @click="toughIdx++">Give me another one →</div>
              </div>
            </Transition>

            <Transition name="cd-pop">
              <div v-if="sessionMode==='hype'" class="cd-scard hc">
                <div class="cd-sc-eye green">Picker upper · Round {{ (hypeIdx % 3) + 1 }} of 3</div>
                <div class="cd-sc-q">"{{ curHype.q }}"</div>
                <div class="cd-sc-b" v-html="curHype.b"></div>
                <button class="cd-abtn g" @click="earnXP('log_followup');hypeIdx++">
                  🚀 Log a touchpoint
                  <span class="cd-xpb" style="background:rgba(0,0,0,0.15);border:none;color:rgba(0,0,0,0.65)">+25 XP</span>
                </button>
                <div class="cd-nxt" @click="hypeIdx++">Another one →</div>
              </div>
            </Transition>

            <div v-if="sessionMode" class="cd-lucky">
              <div style="font-size:18px;margin-bottom:5px">✨</div>
              <div style="font-family:var(--cd-cond);font-size:15px;font-weight:800;color:var(--cd-accent);margin-bottom:4px">Remember</div>
              <div style="font-size:12px;color:var(--cd-muted);line-height:1.6">
                <em style="font-style:normal;color:var(--cd-text)">They are the lucky ones to hear from you.</em><br>
                You reaching out is a gift. Own it.
              </div>
            </div>
          </div>
          <nav class="cd-bnav">
            <button class="cd-bn" @click="nav('vibe')"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn on"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn" @click="nav('cold')"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn" @click="nav('home')"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn" @click="nav('contacts')"><span class="cd-bni">👥</span>Network</button>
          </nav>
        </div>

        <!-- ■■ COLD ■■ -->
        <div class="cd-screen" :class="{on:screen==='cold'}">
          <div class="cd-shdr">
            <div class="cd-stitle">❄️ Cold Contacts</div>
            <div class="cd-ssub">Slow burns can still catch fire.</div>
          </div>
          <div class="cd-scrl cd-pad">
            <div class="cd-cold-banner">
              <span style="font-size:22px;flex-shrink:0">🌡</span>
              <div>
                <div style="font-family:var(--cd-cond);font-size:14px;font-weight:800;color:var(--cd-ice);margin-bottom:2px">The Slow Burn Section</div>
                <div style="font-size:11px;color:var(--cd-muted);line-height:1.5">Tap any contact for a warm-up nudge. Hibernate instead of delete.</div>
              </div>
            </div>

            <div v-if="!coldCs.length && !hibCs.length" class="cd-empty">
              <div style="font-size:40px;margin-bottom:10px">❄️</div>
              <div style="font-family:var(--cd-cond);font-size:18px;font-weight:800;margin-bottom:6px">No cold contacts yet</div>
              <div style="font-size:12px;color:var(--cd-muted)">Rate a contact ❄️ Cold and they'll appear here.</div>
            </div>

            <template v-if="coldCs.length">
              <div class="cd-sec-lbl">❄️ Cold — tap for your warm-up</div>
              <div v-for="c in coldCs" :key="c.id" class="cd-cold-card" :class="{open:openCold.includes(c.id)}">
                <div class="cd-cc-top" @click="toggleCold(c.id)">
                  <div class="cd-cc-av">{{ cEmoji(c) }}</div>
                  <div style="flex:1;min-width:0">
                    <div class="cd-cc-nm">{{ c.name }}</div>
                    <div class="cd-cc-sb">{{ [c.title, c.company].filter(Boolean).join(' · ') }}</div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                    <span class="cd-cpill">❄️ Cold</span>
                    <span class="cd-dlbl" v-if="daysSinceLast(c)">{{ daysSinceLast(c) }}d ago</span>
                  </div>
                </div>
                <Transition name="cd-expand">
                  <div v-if="openCold.includes(c.id)" class="cd-cw">
                    <div class="cd-cw-q">"{{ coldWarmer(c) }}"</div>
                    <div v-if="c.metAt" style="font-size:10px;color:var(--cd-dim);margin-bottom:8px">Met @ {{ c.metAt }}</div>
                    <div style="display:flex;gap:6px">
                      <button class="cd-cwb reach" @click="earnXP('log_followup');toggleCold(c.id)">📧 Reach out +25 XP</button>
                      <button class="cd-cwb hib" @click="hibernate(c.id)">Hibernate 😴</button>
                    </div>
                  </div>
                </Transition>
              </div>
            </template>

            <template v-if="hibCs.length">
              <div class="cd-sec-lbl" style="margin-top:16px">😴 Hibernating — on ice, not gone</div>
              <div v-for="c in hibCs" :key="c.id" class="cd-cold-card" style="opacity:0.65" :class="{open:openCold.includes(c.id+'_h')}">
                <div class="cd-cc-top" @click="toggleCold(c.id + '_h')">
                  <div class="cd-cc-av" style="filter:grayscale(0.5)">{{ cEmoji(c) }}</div>
                  <div style="flex:1;min-width:0">
                    <div class="cd-cc-nm">{{ c.name }}</div>
                    <div class="cd-cc-sb">{{ [c.title, c.company].filter(Boolean).join(' · ') }}</div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                    <span class="cd-hpill">😴 Hibernating</span>
                    <span class="cd-dlbl" v-if="c.hibernatedAt">since {{ fmtShort(c.hibernatedAt) }}</span>
                  </div>
                </div>
                <Transition name="cd-expand">
                  <div v-if="openCold.includes(c.id + '_h')" class="cd-cw">
                    <div class="cd-cw-q" style="color:var(--cd-dim)">Smart networkers know when to pause, not delete. They always come back around.</div>
                    <div style="display:flex;gap:6px;margin-top:8px">
                      <button class="cd-cwb wake" @click="wake(c.id);toggleCold(c.id+'_h')">Wake up 🌅 +10 XP</button>
                    </div>
                  </div>
                </Transition>
              </div>
            </template>
          </div>
          <nav class="cd-bnav">
            <button class="cd-bn" @click="nav('vibe')"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn" @click="nav('session')"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn on"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn" @click="nav('home')"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn" @click="nav('contacts')"><span class="cd-bni">👥</span>Network</button>
          </nav>
        </div>

        <!-- ■■ HOME / DASHBOARD ■■ -->
        <div class="cd-screen" :class="{on:screen==='home'}">
          <div class="cd-scrl cd-pad">

            <!-- Hero card -->
            <div class="cd-hero">
              <div style="font-family:var(--cd-bebas);font-size:11px;letter-spacing:2px;color:var(--cd-accent);margin-bottom:2px">🏆 Rockstar Networker</div>
              <div style="font-family:var(--cd-bebas);font-size:40px;line-height:1;letter-spacing:1px">{{ curLvl.title }}</div>
              <div style="font-size:11px;color:var(--cd-muted);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Level {{ xp.level }} · {{ xp.totalXP }} XP total</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:10px;font-weight:700;color:var(--cd-dim);text-transform:uppercase;letter-spacing:0.8px">XP to {{ nextLvl?.title || 'Max' }}</span>
                <span style="font-family:var(--cd-mono);font-size:11px;color:var(--cd-accent)">{{ xp.totalXP }} / {{ nextLvl?.xp || '∞' }}</span>
              </div>
              <div class="cd-xp-track"><div class="cd-xp-fill" :style="'width:' + xpPct + '%'"></div></div>
              <div style="display:flex;gap:7px;margin-top:10px">
                <span style="background:rgba(0,255,135,0.1);border:1px solid rgba(0,255,135,0.25);border-radius:8px;padding:4px 11px;font-family:var(--cd-cond);font-size:13px;font-weight:800;color:var(--cd-accent)">LVL {{ xp.level }} · {{ curLvl.title }}</span>
                <span v-if="nextLvl" style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.25);border-radius:8px;padding:4px 11px;font-family:var(--cd-cond);font-size:13px;font-weight:800;color:var(--cd-gold)">{{ xpToNext }} XP to {{ nextLvl.title }}</span>
              </div>
            </div>

            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:11px">
              <div class="cd-stat" @click="nav('contacts')">
                <div class="cd-stat-n" style="color:var(--cd-accent)">{{ contacts.length }}</div>
                <div class="cd-stat-l">Contacts</div>
              </div>
              <div class="cd-stat" @click="nav('contacts')">
                <div class="cd-stat-n" style="color:var(--cd-orange)">🔥{{ hotCount }}</div>
                <div class="cd-stat-l">Hot Leads</div>
              </div>
              <div class="cd-stat" @click="nav('contacts')">
                <div class="cd-stat-n" style="color:var(--cd-yellow)">{{ alertCs.length }}</div>
                <div class="cd-stat-l">Overdue</div>
              </div>
            </div>

            <!-- Streak -->
            <div class="cd-streak">
              <div style="font-size:34px;animation:cd-wig 1.8s ease-in-out infinite;flex-shrink:0">🔥</div>
              <div style="flex:1">
                <div style="font-family:var(--cd-bebas);font-size:40px;color:var(--cd-fire);line-height:1;letter-spacing:-1px">{{ xp.streak }}</div>
                <div style="font-size:11px;font-weight:700;color:var(--cd-muted);text-transform:uppercase;letter-spacing:0.8px">Day Streak</div>
                <div style="font-size:10px;color:var(--cd-dim);margin-top:1px;font-style:italic">
                  {{ xp.streak >= 7 ? 'You show up. Every. Single. Day. 🤘' : xp.streak > 0 ? (7 - xp.streak) + ' more days to 200 XP bonus' : 'Start today — log anything.' }}
                </div>
              </div>
              <div>
                <div style="display:flex;gap:4px;margin-bottom:3px">
                  <div v-for="(d,i) in sDots" :key="i" class="cd-sdot" :class="d"></div>
                </div>
                <div style="font-size:8px;color:var(--cd-dim);text-align:center;font-weight:700;letter-spacing:0.5px">MON → SUN</div>
              </div>
            </div>

            <!-- Missions -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
              <div style="font-family:var(--cd-bebas);font-size:20px;letter-spacing:1px;color:var(--cd-muted)">Daily Missions</div>
              <div style="font-size:11px;color:var(--cd-accent);font-weight:700">{{ xp.completedMissions.length }} / {{ MISSIONS.length }}</div>
            </div>
            <div v-for="m in MISSIONS" :key="m.key" class="cd-mission" :class="{done:xp.completedMissions.includes(m.key)}" @click="doMission(m.key)">
              <div class="cd-msn-glow" :class="xp.completedMissions.includes(m.key) ? 'g' : 'o'"></div>
              <span style="font-size:20px;width:30px;text-align:center;flex-shrink:0">{{ m.icon }}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:700">{{ m.label }}</div>
                <div style="font-size:10px;color:var(--cd-dim);margin-top:1px;font-style:italic">{{ m.hype }}</div>
              </div>
              <span v-if="!xp.completedMissions.includes(m.key)" class="cd-xpb">+{{ m.xp }} XP</span>
              <span v-else style="font-size:20px">✅</span>
            </div>

            <!-- Badges -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 9px">
              <div style="font-family:var(--cd-bebas);font-size:20px;letter-spacing:1px;color:var(--cd-muted)">Badges</div>
              <div style="font-size:11px;color:var(--cd-accent);font-weight:700">{{ xp.unlockedBadges.length }} unlocked</div>
            </div>
            <div style="display:flex;gap:7px;overflow-x:auto;padding-bottom:4px">
              <div v-for="b in BADGES" :key="b.key" class="cd-badge" :class="{ul:xp.unlockedBadges.includes(b.key)}" :title="b.desc">
                <div style="font-size:22px;margin-bottom:3px" :style="xp.unlockedBadges.includes(b.key) ? '' : 'filter:grayscale(1);opacity:0.2'">{{ b.emoji }}</div>
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.3px;line-height:1.2;font-weight:700" :style="xp.unlockedBadges.includes(b.key) ? 'color:var(--cd-gold)' : 'color:var(--cd-dim)'">{{ b.label }}</div>
              </div>
            </div>

          </div>
          <nav class="cd-bnav">
            <button class="cd-bn" @click="nav('vibe')"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn" @click="nav('session')"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn" @click="nav('cold')"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn on"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn" @click="nav('contacts')"><span class="cd-bni">👥</span>Network</button>
          </nav>
        </div>

        <!-- ■■ CONTACTS ■■ -->
        <div class="cd-screen" :class="{on:screen==='contacts'}">
          <div class="cd-shdr" style="padding-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div class="cd-stitle">My Network</div>
              <button class="cd-abtn g" style="width:auto;padding:7px 12px;font-size:12px" @click="nav('add')">📷 Add</button>
            </div>
            <div style="position:relative;margin-bottom:8px">
              <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--cd-dim);font-size:15px">⌕</span>
              <input v-model="cSearch" class="cd-inp" style="padding-left:32px" placeholder="Search contacts..." />
            </div>
            <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:2px">
              <button class="cd-pill" :class="{on:cFilter===''}" @click="cFilter=''">All {{ contacts.length }}</button>
              <button v-for="r in RATINGS" :key="r.key" class="cd-pill" :class="[{on:cFilter===r.key}, r.key]" @click="cFilter = cFilter===r.key ? '' : r.key">
                {{ r.emoji }} {{ r.label }}
              </button>
              <select v-model="cSort" class="cd-sort-sel">
                <option value="recent">Recent</option>
                <option value="hot">🔥 Hottest</option>
                <option value="name">A–Z</option>
              </select>
            </div>
          </div>
          <div class="cd-scrl" style="padding:4px 14px 8px">
            <div v-if="!contacts.length" class="cd-empty">
              <div style="font-size:40px;margin-bottom:10px">🃏</div>
              <div style="font-family:var(--cd-cond);font-size:18px;font-weight:800;margin-bottom:6px">No contacts yet</div>
              <div style="font-size:12px;color:var(--cd-muted);margin-bottom:14px">Tap Add to get started.</div>
              <button class="cd-abtn g" @click="nav('add')">📷 Add First Contact</button>
            </div>
            <div v-for="c in filteredCs" :key="c.id" class="cd-crd" :class="{alrt:needsFU(c)}" @click="goDetail(c.id)">
              <div class="cd-cbar" :class="c.rating || 'none'"></div>
              <div class="cd-cav">{{ cEmoji(c) }}</div>
              <div style="flex:1;min-width:0">
                <div class="cd-cnm">{{ c.name }}</div>
                <div class="cd-csb">{{ [c.title, c.company].filter(Boolean).join(' · ') }}</div>
                <div v-if="lastAct(c)" class="cd-cmeta">{{ getAct(lastAct(c)!.type).icon }} {{ lastAct(c)!.label }} · {{ fmtShort(lastAct(c)!.date) }}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                <span v-if="c.rating" class="cd-rpill" :class="c.rating">{{ getRating(c.rating)?.emoji }} {{ getRating(c.rating)?.label }}</span>
                <span v-if="needsFU(c)" style="font-size:9px;color:var(--cd-orange);font-weight:700;text-transform:uppercase;letter-spacing:0.5px">⚡ overdue</span>
                <span v-else-if="daysSinceLast(c)" style="font-family:var(--cd-mono);font-size:10px;color:var(--cd-dim)">{{ daysSinceLast(c) }}d</span>
              </div>
            </div>
          </div>
          <nav class="cd-bnav">
            <button class="cd-bn" @click="nav('vibe')"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn" @click="nav('session')"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn" @click="nav('cold')"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn" @click="nav('home')"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn on"><span class="cd-bni">👥</span>Network</button>
          </nav>
        </div>

        <!-- ■■ CONTACT DETAIL ■■ -->
        <div class="cd-screen" :class="{on:screen==='detail'}">
          <template v-if="selContact">

            <!-- Edit mode -->
            <template v-if="editing">
              <div class="cd-scrl cd-pad">
                <button class="cd-back" @click="editing=false">← Cancel</button>
                <div style="font-family:var(--cd-cond);font-size:18px;font-weight:800;margin-bottom:12px">Edit Contact</div>
                <label class="cd-lbl">Name</label><input v-model="editForm.name" class="cd-inp" />
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <div><label class="cd-lbl">Title</label><input v-model="editForm.title" class="cd-inp" /></div>
                  <div><label class="cd-lbl">Company</label><input v-model="editForm.company" class="cd-inp" /></div>
                </div>
                <label class="cd-lbl">Email</label><input v-model="editForm.email" type="email" class="cd-inp" />
                <label class="cd-lbl">Rating</label>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
                  <button v-for="r in RATINGS" :key="r.key" class="cd-rpick"
                    :style="editForm.rating===r.key ? 'background:' + r.color + '22;border-color:' + r.color + ';color:' + r.color : ''"
                    @click="editForm.rating = editForm.rating===r.key ? '' : r.key">
                    {{ r.emoji }} {{ r.label }}
                  </button>
                </div>
                <label class="cd-lbl">Where We Met</label><input v-model="editForm.metAt" class="cd-inp" />
                <label class="cd-lbl">Notes</label><textarea v-model="editForm.notes" class="cd-inp" style="min-height:60px;resize:vertical"></textarea>
                <div style="display:flex;gap:8px;margin-top:4px">
                  <button class="cd-abtn g" style="font-size:13px;padding:10px" @click="saveEdit">Save</button>
                  <button class="cd-abtn" style="background:transparent;color:var(--cd-muted);border-color:var(--cd-bdr);font-size:13px;padding:10px" @click="editing=false">Cancel</button>
                </div>
              </div>
            </template>

            <!-- View mode -->
            <template v-else>
              <div class="cd-scrl cd-pad">
                <button class="cd-back" @click="nav('contacts')">← Back to Network</button>

                <!-- Hero -->
                <div class="cd-det-hero">
                  <div style="display:flex;align-items:center;gap:11px;margin-bottom:10px">
                    <div class="cd-det-av">{{ cEmoji(selContact) }}</div>
                    <div>
                      <div style="font-family:var(--cd-bebas);font-size:26px;letter-spacing:0.5px;line-height:1;margin-bottom:3px">{{ selContact.name }}</div>
                      <div style="font-size:12px;color:var(--cd-muted);font-weight:600">{{ [selContact.title, selContact.company].filter(Boolean).join(' · ') }}</div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <span v-if="selContact.rating" class="cd-rpill" :class="selContact.rating">{{ getRating(selContact.rating)?.emoji }} {{ getRating(selContact.rating)?.label }}</span>
                    <span v-if="selContact.industry" class="cd-tag-ind">{{ selContact.industry }}</span>
                    <span v-if="selContact.metAt" class="cd-tag-ind">Met @ {{ selContact.metAt }}</span>
                  </div>
                </div>

                <!-- Follow-up banner -->
                <div class="cd-fu-banner" :class="fuStatus(selContact)">
                  <span style="font-size:20px;flex-shrink:0">{{ fuInfo(selContact).ico }}</span>
                  <div>
                    <div class="cd-fu-t">{{ fuInfo(selContact).title }}</div>
                    <div class="cd-fu-s">{{ fuInfo(selContact).sub }}</div>
                  </div>
                </div>

                <!-- Contact info -->
                <div v-if="selContact.email || selContact.phone" class="cd-info-grid">
                  <div v-if="selContact.email" class="cd-info-row">
                    <span class="cd-info-k">📧 Email</span>
                    <a :href="'mailto:' + selContact.email" class="cd-info-v cd-link">{{ selContact.email }}</a>
                  </div>
                  <div v-if="selContact.phone" class="cd-info-row">
                    <span class="cd-info-k">📞 Phone</span>
                    <a :href="'tel:' + selContact.phone" class="cd-info-v cd-link">{{ selContact.phone }}</a>
                  </div>
                </div>

                <div v-if="selContact.notes" class="cd-note-blk">
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--cd-dim);margin-bottom:4px">Notes</div>
                  {{ selContact.notes }}
                </div>

                <!-- Log touchpoint -->
                <div class="cd-log-sec">
                  <div style="font-family:var(--cd-cond);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:var(--cd-dim);margin-bottom:8px">Log a touchpoint</div>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                    <button v-for="t in ACT_TYPES" :key="t.key" class="cd-act-type" :class="{sel:actType===t.key}" @click="actType=t.key">
                      <span style="font-size:14px;display:block;margin-bottom:2px">{{ t.icon }}</span>{{ t.label }}
                    </button>
                  </div>
                  <input v-model="actNote" class="cd-inp" placeholder="Quick note — what happened?" style="margin-bottom:7px" />
                  <div style="display:flex;gap:6px">
                    <input v-model="actDate" type="date" class="cd-inp" style="flex:0 0 130px;margin-bottom:0" />
                    <button class="cd-abtn g" style="flex:1;font-size:12px;padding:9px 6px" @click="logAct(false)">✅ Log +25 XP</button>
                    <button class="cd-abtn b" style="flex:1;font-size:12px;padding:9px 6px" @click="logAct(true)">🎉 Replied! +100</button>
                  </div>
                </div>

                <!-- Timeline -->
                <div style="margin-bottom:14px">
                  <div style="font-family:var(--cd-cond);font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:var(--cd-dim);margin-bottom:12px;display:flex;align-items:center;gap:8px">
                    Activity Timeline
                    <div style="flex:1;height:1px;background:var(--cd-bdr)"></div>
                  </div>
                  <div v-if="!sortedActs.length" style="background:var(--cd-bg2);border:1px solid var(--cd-bdr);border-radius:12px;padding:16px;text-align:center;color:var(--cd-dim);font-size:12px">
                    No activity yet — log your first touchpoint above.
                  </div>
                  <div v-for="(act, i) in sortedActs" :key="act.id" style="display:flex;gap:9px;margin-bottom:13px;position:relative">
                    <div v-if="i < sortedActs.length - 1" style="position:absolute;left:17px;top:36px;width:2px;bottom:-13px;background:var(--cd-bdr)"></div>
                    <div class="cd-tl-dot" :class="act.type">{{ getAct(act.type).icon }}</div>
                    <div style="flex:1;background:var(--cd-bg2);border:1px solid var(--cd-bdr);border-radius:12px;padding:10px 12px">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                        <div style="font-family:var(--cd-cond);font-size:14px;font-weight:800;letter-spacing:0.3px">{{ act.label }}</div>
                        <div style="font-family:var(--cd-mono);font-size:10px;color:var(--cd-dim)">{{ formatDate(act.date) }}</div>
                      </div>
                      <div v-if="act.note" style="font-size:12px;color:var(--cd-muted);line-height:1.5;margin-bottom:7px">{{ act.note }}</div>
                      <div class="cd-tl-resp" :class="act.isResponse ? 'yes' : 'no'" @click="!act.isResponse && toggleResp(act.id)">
                        {{ act.isResponse ? '✓ ' + (act.responseNote || 'Responded') : '○ No reply yet — tap to mark responded' }}
                      </div>
                    </div>
                  </div>
                  <div style="background:var(--cd-bg2);border:1px solid var(--cd-bdr);border-radius:12px;padding:12px 14px">
                    <div style="font-family:var(--cd-cond);font-size:14px;font-weight:800;color:var(--cd-muted);margin-bottom:5px">⏰ 7-Day Follow-Up Rule</div>
                    <div style="font-size:11px;color:var(--cd-dim);line-height:1.6">No reply after <strong style="color:var(--cd-muted)">7 days</strong> → surfaced in Vibe Feed. After <strong style="color:var(--cd-orange)">10 days</strong> → Overdue alert fires. 🔥 Hot contacts always surface first.</div>
                  </div>
                </div>

                <!-- Actions -->
                <div style="display:flex;gap:7px;margin-bottom:20px">
                  <button class="cd-abtn" style="flex:1;background:transparent;color:var(--cd-muted);border-color:var(--cd-bdr);font-size:12px;padding:9px" @click="startEdit">✏️ Edit</button>
                  <button class="cd-abtn" style="flex:1;background:transparent;color:var(--cd-dim);border-color:var(--cd-bdr);font-size:12px;padding:9px" @click="hibernate(selectedId!);nav('contacts')">😴 Hibernate</button>
                </div>
              </div>
            </template>

          </template>
          <nav class="cd-bnav">
            <button class="cd-bn" @click="nav('vibe')"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn" @click="nav('session')"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn" @click="nav('cold')"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn" @click="nav('home')"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn on" @click="nav('contacts')"><span class="cd-bni">👥</span>Network</button>
          </nav>
        </div>

        <!-- ■■ ADD CONTACT ■■ -->
        <div class="cd-screen" :class="{on:screen==='add'}">
          <div class="cd-shdr">
            <button class="cd-back" style="margin-bottom:6px" @click="nav('contacts')">← Back</button>
            <div class="cd-stitle">Add Contact</div>
            <div class="cd-ssub">Scan or enter manually · <span style="color:var(--cd-accent)">+50 XP</span> on scan</div>
          </div>
          <div class="cd-scrl cd-pad">
            <div class="cd-scan-zone" @click="fireConfetti();earnXP('scan_card', {totalScans:(xp.totalScans||0)+1})">
              <div style="font-size:44px;margin-bottom:8px">📷</div>
              <div style="font-family:var(--cd-bebas);font-size:20px;letter-spacing:1px;color:var(--cd-accent);margin-bottom:4px">Scan Business Card</div>
              <div style="font-size:11px;color:var(--cd-dim)">AI reads name, email, phone, company — instantly</div>
              <span class="cd-xpb" style="margin-top:9px;display:inline-block">+50 XP on scan</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;color:var(--cd-dim);font-size:10px;margin:12px 0;text-transform:uppercase;letter-spacing:1px;font-weight:700">
              <div style="flex:1;height:1px;background:var(--cd-bdr)"></div>
              or enter manually
              <div style="flex:1;height:1px;background:var(--cd-bdr)"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div><label class="cd-lbl">First Name</label><input v-model="addForm.firstName" class="cd-inp" placeholder="Jane" /></div>
              <div><label class="cd-lbl">Last Name</label><input v-model="addForm.lastName" class="cd-inp" placeholder="Smith" /></div>
            </div>
            <label class="cd-lbl">Title</label><input v-model="addForm.title" class="cd-inp" placeholder="VP Product" />
            <label class="cd-lbl">Company</label><input v-model="addForm.company" class="cd-inp" placeholder="Acme Corp" />
            <label class="cd-lbl">Email</label><input v-model="addForm.email" type="email" class="cd-inp" placeholder="jane@acme.com" />
            <label class="cd-lbl">Industry</label>
            <select v-model="addForm.industry" class="cd-inp" style="cursor:pointer">
              <option value="">Select...</option>
              <option v-for="ind in INDUSTRIES" :key="ind" :value="ind">{{ ind }}</option>
            </select>
            <label class="cd-lbl">Where We Met</label><input v-model="addForm.metAt" class="cd-inp" placeholder="SaaS Summit NYC" />
            <label class="cd-lbl">Rate This Contact</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
              <button v-for="r in RATINGS" :key="r.key" class="cd-rpick"
                :style="addForm.rating===r.key ? 'background:' + r.color + '22;border-color:' + r.color + ';color:' + r.color : ''"
                @click="addForm.rating = addForm.rating===r.key ? '' : r.key">
                {{ r.emoji }} {{ r.label }}
              </button>
            </div>
            <button class="cd-abtn g" style="font-size:16px;padding:13px;margin-top:4px" :disabled="!addName" @click="saveContact">
              SAVE + EARN 25 XP →
            </button>
          </div>
          <nav class="cd-bnav">
            <button class="cd-bn" @click="nav('vibe')"><span class="cd-bni">⚡</span>Vibe</button>
            <button class="cd-bn" @click="nav('session')"><span class="cd-bni">🎙</span>Session</button>
            <button class="cd-bn" @click="nav('cold')"><span class="cd-bni">❄️</span>Cold</button>
            <button class="cd-bn" @click="nav('home')"><span class="cd-bni">🏠</span>Home</button>
            <button class="cd-bn on"><span class="cd-bni">📷</span>Add</button>
          </nav>
        </div>

        <!-- XP Toast -->
        <Transition name="cd-toast">
          <div v-if="toast" class="cd-toast">
            <span style="font-size:18px">{{ toast.icon }}</span>
            <span style="font-family:var(--cd-bebas);font-size:20px;color:var(--cd-accent);letter-spacing:1px">{{ toast.xp }}</span>
            <span style="font-size:11px;color:var(--cd-muted);font-weight:600">{{ toast.msg }}</span>
          </div>
        </Transition>

      </div><!-- /cd-inner -->
    </div><!-- /cd-phone -->
  </div><!-- /cd-phone-col -->

  <!-- ══ RIGHT PANEL ══════════════════════════════════════════════════════════ -->
  <div class="cd-panel">
    <div class="cd-panel-logo">CARD<span style="color:var(--cd-accent)">DESK</span></div>
    <div style="font-size:13px;color:var(--cd-dim);font-weight:600;margin-bottom:22px">Interactive Prototype · 6 Screens · Data persists in localStorage</div>

    <!-- Navigation tabs -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px">
      <button v-for="t in PANEL_TABS" :key="t.k" class="cd-tab" :class="{on:screen===t.k}" @click="nav(t.k as Screen)">
        {{ t.icon }} {{ t.label }}
      </button>
    </div>

    <div class="cd-divider"></div>
    <div class="cd-panel-sec">Screen Guide</div>
    <div class="cd-guide-grid">
      <div v-for="s in PANEL_SCREENS" :key="s.name" class="cd-guide-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:18px">{{ s.icon }}</span>
          <div>
            <div style="font-family:var(--cd-cond);font-size:15px;font-weight:800;letter-spacing:0.3px">{{ s.name }}</div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px" :style="'color:' + s.tc">{{ s.tag }}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--cd-muted);line-height:1.6">{{ s.desc }}</div>
      </div>
    </div>

    <div class="cd-divider"></div>
    <div class="cd-panel-sec">Cold Warmer Copy</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:22px">
      <div v-for="w in PANEL_WARMERS" :key="w.icon" class="cd-warmer-card">
        <span style="font-size:18px;flex-shrink:0">{{ w.icon }}</span>
        <div style="font-family:var(--cd-cond);font-size:14px;font-weight:800;color:var(--cd-ice);line-height:1.3">{{ w.text }}</div>
      </div>
    </div>

    <div class="cd-divider"></div>
    <div class="cd-panel-sec">XP Reference</div>
    <div class="cd-xp-table">
      <div v-for="row in PANEL_XP" :key="row.action" class="cd-xp-row">
        <span style="font-size:13px;color:var(--cd-muted)">{{ row.action }}</span>
        <span style="font-family:var(--cd-mono);font-size:12px;color:var(--cd-accent);font-weight:700">{{ row.pts }}</span>
      </div>
    </div>

  </div><!-- /cd-panel -->

</div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@600;700;800;900&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
</style>

<style scoped>
/* ── Root & CSS vars ─────────────────────────────────────────────────────── */
.cd-root {
  --cd-bg: #060810; --cd-bg2: #0d1018; --cd-bg3: #131820; --cd-bg4: #19202a;
  --cd-bdr: #1c2330; --cd-bdr2: #283245;
  --cd-text: #f0f4ff; --cd-muted: #8898b0; --cd-dim: #3e4f68;
  --cd-accent: #00ff87; --cd-ac2: #00c268;
  --cd-blue: #4da6ff; --cd-orange: #ff6b35; --cd-yellow: #ffe033;
  --cd-purple: #b87dff; --cd-gold: #ffd700; --cd-fire: #ff4500; --cd-ice: #a8d8ea;
  --cd-bebas: 'Bebas Neue', sans-serif;
  --cd-cond:  'Barlow Condensed', sans-serif;
  --cd-sans:  'Barlow', sans-serif;
  --cd-mono:  'JetBrains Mono', monospace;
  display: flex; height: 100vh; overflow: hidden;
  background: var(--cd-bg); color: var(--cd-text); font-family: var(--cd-sans);
}

/* ── Phone shell ─────────────────────────────────────────────────────────── */
.cd-phone-col { width: 380px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 16px; background: radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,255,135,0.05) 0%, transparent 60%), var(--cd-bg); border-right: 1px solid var(--cd-bdr); }
.cd-phone     { width: 354px; height: 742px; background: var(--cd-bg); border-radius: 44px; overflow: hidden; position: relative; box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.95), 0 0 80px rgba(0,255,135,0.05); }
.cd-notch     { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 88px; height: 26px; background: #000; border-radius: 20px; z-index: 100; }
.cd-inner     { height: 100%; display: flex; flex-direction: column; }
.cd-sbar      { padding: 44px 20px 0; display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; flex-shrink: 0; font-family: var(--cd-mono); color: var(--cd-muted); }

/* ── Screens ─────────────────────────────────────────────────────────────── */
.cd-screen   { display: none; flex-direction: column; flex: 1; overflow: hidden; }
.cd-screen.on { display: flex; }
.cd-scrl     { flex: 1; overflow-y: auto; }
.cd-scrl::-webkit-scrollbar { display: none; }
.cd-pad      { padding: 10px 14px 10px; }
.cd-shdr     { padding: 12px 14px 8px; flex-shrink: 0; }
.cd-stitle   { font-family: var(--cd-bebas); font-size: 28px; letter-spacing: 1px; }
.cd-ssub     { font-size: 11px; color: var(--cd-dim); font-weight: 600; margin-top: 1px; }

/* ── Bottom nav ──────────────────────────────────────────────────────────── */
.cd-bnav   { display: flex; background: rgba(6,8,16,0.97); border-top: 1px solid var(--cd-bdr); padding: 7px 0 18px; flex-shrink: 0; }
.cd-bn     { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none; cursor: pointer; font-size: 9px; font-family: var(--cd-sans); text-transform: uppercase; letter-spacing: 0.6px; color: var(--cd-dim); transition: color 0.15s; font-weight: 700; position: relative; }
.cd-bn.on,.cd-bn:hover { color: var(--cd-accent); }
.cd-bni    { font-size: 18px; line-height: 1.1; }
.cd-nav-dot { position: absolute; top: 0; right: calc(50% - 16px); width: 7px; height: 7px; background: var(--cd-orange); border-radius: 50%; border: 2px solid var(--cd-bg); animation: cd-blink 2s infinite; }
@keyframes cd-blink { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }

/* ── Shared UI ───────────────────────────────────────────────────────────── */
.cd-abtn   { width: 100%; padding: 10px; border-radius: 11px; border: 1px solid; font-family: var(--cd-cond); font-size: 14px; font-weight: 800; letter-spacing: 0.5px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 7px; text-transform: uppercase; }
.cd-abtn.g   { background: var(--cd-accent); color: #060810; border-color: var(--cd-accent); }
.cd-abtn.g:hover { background: #1affa0; }
.cd-abtn.b   { background: rgba(77,166,255,0.1); color: var(--cd-blue); border-color: rgba(77,166,255,0.3); }
.cd-abtn.b:hover { background: rgba(77,166,255,0.18); }
.cd-abtn.o   { background: rgba(255,107,53,0.1); color: var(--cd-orange); border-color: rgba(255,107,53,0.3); }
.cd-abtn.o:hover { background: rgba(255,107,53,0.18); }
.cd-abtn.p   { background: rgba(184,125,255,0.1); color: var(--cd-purple); border-color: rgba(184,125,255,0.3); }
.cd-abtn.p:hover { background: rgba(184,125,255,0.18); }
.cd-abtn.ice { background: rgba(168,216,234,0.08); color: var(--cd-ice); border-color: rgba(168,216,234,0.3); }
.cd-abtn.ice:hover { background: rgba(168,216,234,0.14); }
.cd-abtn:disabled { opacity: 0.4; cursor: not-allowed; }
.cd-xpb    { background: rgba(0,255,135,0.1); border: 1px solid rgba(0,255,135,0.2); border-radius: 6px; padding: 3px 8px; font-family: var(--cd-mono); font-size: 11px; color: var(--cd-accent); font-weight: 700; flex-shrink: 0; }
.cd-inp    { width: 100%; background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 10px; color: var(--cd-text); font-family: var(--cd-sans); font-size: 13px; padding: 9px 12px; outline: none; transition: border-color 0.15s; margin-bottom: 8px; box-sizing: border-box; }
.cd-inp:focus { border-color: var(--cd-bdr2); }
.cd-inp::placeholder { color: var(--cd-dim); }
.cd-lbl    { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--cd-dim); display: block; margin-bottom: 3px; font-weight: 700; }
.cd-back   { background: none; border: none; color: var(--cd-dim); font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; margin-bottom: 12px; font-family: var(--cd-sans); transition: color 0.15s; }
.cd-back:hover { color: var(--cd-muted); }
.cd-rpick  { flex: 1; padding: 7px 6px; border-radius: 9px; border: 1px solid var(--cd-bdr); background: var(--cd-bg2); color: var(--cd-dim); font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: var(--cd-sans); text-align: center; }
.cd-rpick:hover { color: var(--cd-muted); }
.cd-sort-sel { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 99px; color: var(--cd-muted); padding: 5px 9px; font-size: 11px; font-family: var(--cd-sans); outline: none; cursor: pointer; flex-shrink: 0; }
.cd-empty  { text-align: center; padding: 36px 16px; color: var(--cd-dim); }

/* ── Vibe feed ───────────────────────────────────────────────────────────── */
.cd-vc     { border-radius: 15px; padding: 13px; margin-bottom: 9px; cursor: pointer; transition: all 0.15s; }
.cd-vc:hover { transform: scale(1.01); }
.cd-vc.hype    { background: linear-gradient(135deg, #091808, #050d06); border: 1.5px solid rgba(0,255,135,0.2); }
.cd-vc.hype:hover { border-color: var(--cd-accent); }
.cd-vc.cold-vc { background: linear-gradient(135deg, #060c14, #050810); border: 1px solid rgba(168,216,234,0.15); }
.cd-vc.warn    { background: linear-gradient(135deg, #190800, #0d0400); border: 1px solid rgba(255,107,53,0.2); }
.cd-vc.tip-vc  { background: linear-gradient(135deg, #0e0720, #080414); border: 1px solid rgba(184,125,255,0.15); }
.cd-vct    { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 7px; }
.cd-vci    { font-size: 23px; flex-shrink: 0; width: 30px; text-align: center; }
.cd-vch    { font-family: var(--cd-cond); font-size: 15px; font-weight: 800; letter-spacing: 0.3px; line-height: 1.2; margin-bottom: 3px; }
.cd-vcb    { font-size: 11px; color: var(--cd-muted); line-height: 1.6; }
.cd-vcb strong { color: var(--cd-text); }
.cd-vtime  { font-size: 10px; color: var(--cd-dim); margin-top: 7px; font-family: var(--cd-mono); }
.cd-tip-tag { background: rgba(184,125,255,0.1); border: 1px solid rgba(184,125,255,0.2); border-radius: 99px; padding: 3px 9px; font-size: 10px; color: var(--cd-purple); font-weight: 600; }
.cd-sess-entry { background: linear-gradient(135deg, #0a1a0d, #080d0a); border: 1.5px solid rgba(0,255,135,0.2); border-radius: 16px; padding: 13px; margin-bottom: 9px; cursor: pointer; transition: all 0.18s; }
.cd-sess-entry:hover { border-color: rgba(0,255,135,0.4); transform: scale(1.01); }
.cd-se-top  { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
.cd-se-ttl  { font-family: var(--cd-cond); font-size: 18px; font-weight: 800; letter-spacing: 0.3px; color: var(--cd-accent); }
.cd-se-sub  { font-size: 11px; color: var(--cd-muted); }
.cd-se-modes { display: flex; gap: 6px; }
.cd-semp   { flex: 1; padding: 7px 6px; border-radius: 9px; font-family: var(--cd-cond); font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.15s; text-align: center; border: 1px solid; }
.cd-semp.tg { background: rgba(255,107,53,0.1); color: var(--cd-orange); border-color: rgba(255,107,53,0.3); }
.cd-semp.tg:hover { background: rgba(255,107,53,0.18); }
.cd-semp.pk { background: rgba(0,255,135,0.1); color: var(--cd-accent); border-color: rgba(0,255,135,0.3); }
.cd-semp.pk:hover { background: rgba(0,255,135,0.16); }
.cd-mood   { background: linear-gradient(135deg, #06091a, #050710); border: 1px solid rgba(77,166,255,0.18); border-radius: 14px; padding: 12px; margin-bottom: 9px; cursor: pointer; transition: all 0.2s; }
.cd-mood:hover { transform: scale(1.01); }
.cd-mc-t   { font-family: var(--cd-cond); font-size: 15px; font-weight: 800; margin-bottom: 4px; }
.cd-mc-t.blue   { color: var(--cd-blue); }
.cd-mc-t.green  { color: var(--cd-accent); }
.cd-mc-t.purple { color: var(--cd-purple); }
.cd-mc-b   { font-size: 11px; color: var(--cd-muted); line-height: 1.6; margin-bottom: 6px; }

/* ── Session ─────────────────────────────────────────────────────────────── */
.cd-mcard  { border-radius: 14px; padding: 13px 11px; border: 1.5px solid var(--cd-bdr); background: var(--cd-bg2); cursor: pointer; transition: all 0.2s; text-align: center; }
.cd-mcard.tg:hover,.cd-mcard.tg.sel { border-color: rgba(255,107,53,0.5); background: rgba(255,107,53,0.05); }
.cd-mcard.pk:hover,.cd-mcard.pk.sel { border-color: rgba(0,255,135,0.4); background: rgba(0,255,135,0.04); }
.cd-mc-lbl { font-family: var(--cd-cond); font-size: 16px; font-weight: 800; letter-spacing: 0.3px; margin-bottom: 3px; }
.cd-mcard.tg.sel .cd-mc-lbl,.cd-mcard.tg:hover .cd-mc-lbl { color: var(--cd-orange); }
.cd-mcard.pk.sel .cd-mc-lbl,.cd-mcard.pk:hover .cd-mc-lbl { color: var(--cd-accent); }
.cd-mc-sub { font-size: 11px; color: var(--cd-dim); font-weight: 500; line-height: 1.3; }
.cd-scard  { border-radius: 17px; padding: 15px; margin-bottom: 10px; }
.cd-scard.tc { background: linear-gradient(135deg, #190800, #0e0500); border: 1.5px solid rgba(255,107,53,0.3); }
.cd-scard.hc { background: linear-gradient(135deg, #041208, #050e06); border: 1.5px solid rgba(0,255,135,0.2); }
.cd-sc-eye { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
.cd-sc-eye.orange { color: var(--cd-orange); }
.cd-sc-eye.green  { color: var(--cd-accent); }
.cd-sc-q   { font-family: var(--cd-cond); font-size: 20px; font-weight: 800; line-height: 1.25; margin-bottom: 9px; }
.cd-sc-b   { font-size: 12px; color: var(--cd-muted); line-height: 1.7; margin-bottom: 12px; }
.cd-sc-b :deep(em)     { font-style: normal; color: var(--cd-orange); }
.cd-scard.hc .cd-sc-b :deep(em) { color: var(--cd-accent); }
.cd-sc-b :deep(strong) { color: var(--cd-text); }
.cd-nxt    { text-align: center; padding: 7px; color: var(--cd-dim); font-size: 11px; font-weight: 600; cursor: pointer; transition: color 0.15s; }
.cd-nxt:hover { color: var(--cd-muted); }
.cd-lucky  { background: rgba(0,255,135,0.04); border: 1px solid rgba(0,255,135,0.12); border-radius: 12px; padding: 12px 13px; text-align: center; }
.cd-pop-enter-active { animation: cd-cin 0.35s cubic-bezier(0.34,1.3,0.64,1); }
.cd-pop-leave-active { transition: opacity 0.15s; }
.cd-pop-leave-to { opacity: 0; }
@keyframes cd-cin { from { opacity: 0; transform: translateY(12px) scale(0.97) } to { opacity: 1; transform: none } }

/* ── Cold ────────────────────────────────────────────────────────────────── */
.cd-cold-banner { background: linear-gradient(135deg, rgba(168,216,234,0.07), rgba(77,166,255,0.04)); border: 1px solid rgba(168,216,234,0.18); border-radius: 13px; padding: 11px 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
.cd-sec-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--cd-dim); margin-bottom: 8px; margin-top: 4px; display: flex; align-items: center; gap: 8px; }
.cd-sec-lbl::after { content: ''; flex: 1; height: 1px; background: var(--cd-bdr); }
.cd-cold-card { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 13px; margin-bottom: 8px; overflow: hidden; cursor: pointer; transition: border-color 0.15s; }
.cd-cold-card:hover { border-color: var(--cd-bdr2); }
.cd-cc-top { padding: 10px 12px 9px; display: flex; align-items: center; gap: 9px; }
.cd-cc-av  { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: rgba(168,216,234,0.08); border: 1px solid rgba(168,216,234,0.15); flex-shrink: 0; }
.cd-cc-nm  { font-family: var(--cd-cond); font-size: 15px; font-weight: 800; }
.cd-cc-sb  { font-size: 11px; color: var(--cd-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-cpill  { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; border: 1px solid rgba(168,216,234,0.3); background: rgba(168,216,234,0.08); color: var(--cd-ice); text-transform: uppercase; letter-spacing: 0.5px; }
.cd-hpill  { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--cd-bdr); background: rgba(255,255,255,0.03); color: var(--cd-dim); text-transform: uppercase; letter-spacing: 0.5px; }
.cd-dlbl   { font-family: var(--cd-mono); font-size: 10px; color: var(--cd-dim); }
.cd-cw     { padding: 9px 12px 11px; border-top: 1px solid var(--cd-bdr); background: rgba(0,0,0,0.1); }
.cd-cw-q   { font-size: 11px; color: var(--cd-muted); line-height: 1.6; font-style: italic; margin-bottom: 7px; }
.cd-cwb    { flex: 1; padding: 7px 8px; border-radius: 9px; font-family: var(--cd-sans); font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s; text-align: center; border: 1px solid; }
.cd-cwb.reach { background: rgba(168,216,234,0.08); color: var(--cd-ice); border-color: rgba(168,216,234,0.3); }
.cd-cwb.reach:hover { background: rgba(168,216,234,0.14); }
.cd-cwb.hib { background: transparent; color: var(--cd-dim); border-color: var(--cd-bdr); }
.cd-cwb.hib:hover { color: var(--cd-muted); }
.cd-cwb.wake { background: rgba(0,255,135,0.1); color: var(--cd-accent); border-color: rgba(0,255,135,0.3); }
.cd-cwb.wake:hover { background: rgba(0,255,135,0.16); }
.cd-expand-enter-active,.cd-expand-leave-active { transition: all 0.2s ease; }
.cd-expand-enter-from,.cd-expand-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Dashboard ───────────────────────────────────────────────────────────── */
.cd-hero   { background: linear-gradient(135deg, #0b1f12 0%, #090f1e 60%, #0e091e 100%); border: 1px solid rgba(0,255,135,0.14); border-radius: 17px; padding: 15px; margin-bottom: 10px; position: relative; overflow: hidden; }
.cd-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 20% 0%, rgba(0,255,135,0.1) 0%, transparent 60%); pointer-events: none; }
.cd-xp-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: visible; position: relative; }
.cd-xp-fill  { height: 100%; background: linear-gradient(90deg, var(--cd-ac2), var(--cd-accent)); border-radius: 99px; transition: width 1.2s cubic-bezier(0.34,1.2,0.64,1); position: relative; }
.cd-xp-fill::after { content: ''; position: absolute; right: -1px; top: -3px; width: 12px; height: 12px; background: var(--cd-accent); border-radius: 50%; box-shadow: 0 0 12px var(--cd-accent), 0 0 24px rgba(0,255,135,0.3); }
.cd-stat   { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; padding: 10px 7px; text-align: center; cursor: pointer; transition: all 0.15s; }
.cd-stat:hover { border-color: var(--cd-bdr2); transform: translateY(-2px); }
.cd-stat-n { font-family: var(--cd-bebas); font-size: 32px; line-height: 1; letter-spacing: 0.5px; }
.cd-stat-l { font-size: 9px; color: var(--cd-dim); text-transform: uppercase; letter-spacing: 0.7px; font-weight: 700; margin-top: 1px; }
.cd-streak { background: linear-gradient(135deg, #190800, #0e0500); border: 1px solid rgba(255,69,0,0.25); border-radius: 13px; padding: 11px 13px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: all 0.2s; }
.cd-streak:hover { border-color: rgba(255,69,0,0.5); }
@keyframes cd-wig { 0%,100% { transform: rotate(-4deg) scale(1) } 50% { transform: rotate(4deg) scale(1.1) } }
.cd-sdot       { width: 9px; height: 9px; border-radius: 50%; }
.cd-sdot.done  { background: var(--cd-fire); box-shadow: 0 0 6px var(--cd-fire); }
.cd-sdot.today { background: var(--cd-fire); animation: cd-pf 1s infinite; }
.cd-sdot.empty { background: var(--cd-bg4); }
@keyframes cd-pf { 0%,100% { box-shadow: 0 0 6px var(--cd-fire) } 50% { box-shadow: 0 0 16px var(--cd-fire), 0 0 28px rgba(255,69,0,0.4) } }
.cd-mission { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; padding: 10px 12px; margin-bottom: 7px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; }
.cd-mission:hover { border-color: var(--cd-bdr2); transform: translateX(2px); }
.cd-mission.done { opacity: 0.45; }
.cd-mission.done:hover { transform: none; }
.cd-msn-glow { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 3px 0 0 3px; }
.cd-msn-glow.g { background: var(--cd-accent); box-shadow: 2px 0 10px rgba(0,255,135,0.5); }
.cd-msn-glow.o { background: var(--cd-orange); box-shadow: 2px 0 10px rgba(255,107,53,0.5); }
.cd-badge  { flex-shrink: 0; width: 66px; background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; padding: 10px 5px; text-align: center; cursor: pointer; transition: all 0.15s; }
.cd-badge:hover { transform: translateY(-3px); }
.cd-badge.ul { border-color: rgba(255,208,0,0.3); background: linear-gradient(135deg, rgba(255,208,0,0.06), rgba(255,208,0,0.02)); }

/* ── Contacts ────────────────────────────────────────────────────────────── */
.cd-pill   { flex-shrink: 0; padding: 5px 11px; border-radius: 99px; border: 1px solid var(--cd-bdr); background: transparent; color: var(--cd-dim); font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: var(--cd-sans); }
.cd-pill.on { background: var(--cd-bg3); color: var(--cd-text); border-color: var(--cd-bdr2); }
.cd-pill.hot.on     { background: rgba(255,107,53,0.08); color: var(--cd-orange); border-color: rgba(255,107,53,0.35); }
.cd-pill.warm.on    { background: rgba(255,224,51,0.08); color: var(--cd-yellow); border-color: rgba(255,224,51,0.35); }
.cd-pill.nurture.on { background: rgba(0,255,135,0.08); color: var(--cd-accent); border-color: rgba(0,255,135,0.3); }
.cd-pill.cold.on    { background: rgba(77,166,255,0.08); color: var(--cd-blue); border-color: rgba(77,166,255,0.3); }
.cd-crd    { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; padding: 10px 12px; margin-bottom: 7px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 10px; position: relative; overflow: hidden; }
.cd-crd:hover { transform: translateX(3px); border-color: var(--cd-bdr2); }
.cd-crd.alrt { background: rgba(255,69,0,0.04); border-color: rgba(255,107,53,0.22); }
.cd-cbar   { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 3px 0 0 3px; }
.cd-cbar.hot     { background: var(--cd-orange); }
.cd-cbar.warm    { background: var(--cd-yellow); }
.cd-cbar.nurture { background: var(--cd-accent); }
.cd-cbar.cold    { background: var(--cd-blue); }
.cd-cav    { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 19px; background: var(--cd-bg3); border: 1px solid var(--cd-bdr); flex-shrink: 0; }
.cd-cnm    { font-family: var(--cd-cond); font-size: 15px; font-weight: 800; letter-spacing: 0.2px; }
.cd-csb    { font-size: 11px; color: var(--cd-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-cmeta  { font-size: 10px; color: var(--cd-dim); margin-top: 2px; font-family: var(--cd-mono); }
.cd-rpill  { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.5px; }
.cd-rpill.hot     { color: var(--cd-orange); border-color: rgba(255,107,53,0.4); background: rgba(255,107,53,0.1); }
.cd-rpill.warm    { color: var(--cd-yellow); border-color: rgba(255,224,51,0.4); background: rgba(255,224,51,0.08); }
.cd-rpill.nurture { color: var(--cd-accent); border-color: rgba(0,255,135,0.3); background: rgba(0,255,135,0.08); }
.cd-rpill.cold    { color: var(--cd-blue); border-color: rgba(77,166,255,0.3); background: rgba(77,166,255,0.08); }

/* ── Contact detail ──────────────────────────────────────────────────────── */
.cd-det-hero { background: linear-gradient(180deg, var(--cd-bg3) 0%, var(--cd-bg) 100%); border: 1px solid var(--cd-bdr); border-radius: 15px; padding: 14px; margin-bottom: 11px; }
.cd-det-av   { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; background: var(--cd-bg4); border: 1px solid var(--cd-bdr2); flex-shrink: 0; }
.cd-tag-ind  { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; border: 1px solid var(--cd-bdr); color: var(--cd-dim); background: transparent; text-transform: uppercase; letter-spacing: 0.5px; }
.cd-fu-banner { border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
.cd-fu-banner.overdue { background: linear-gradient(135deg, rgba(255,107,53,0.1), rgba(255,69,0,0.06)); border: 1px solid rgba(255,107,53,0.3); }
.cd-fu-banner.due     { background: linear-gradient(135deg, rgba(255,224,51,0.08), rgba(255,200,0,0.04)); border: 1px solid rgba(255,224,51,0.25); }
.cd-fu-banner.ok      { background: rgba(0,255,135,0.04); border: 1px solid rgba(0,255,135,0.15); }
.cd-fu-banner.new     { background: rgba(77,166,255,0.04); border: 1px solid rgba(77,166,255,0.15); }
.cd-fu-t     { font-family: var(--cd-cond); font-size: 13px; font-weight: 800; margin-bottom: 2px; }
.cd-fu-banner.overdue .cd-fu-t { color: var(--cd-orange); }
.cd-fu-banner.due .cd-fu-t     { color: var(--cd-yellow); }
.cd-fu-banner.ok .cd-fu-t      { color: var(--cd-accent); }
.cd-fu-banner.new .cd-fu-t     { color: var(--cd-blue); }
.cd-fu-s     { font-size: 11px; color: var(--cd-dim); line-height: 1.4; }
.cd-info-grid { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; overflow: hidden; margin-bottom: 10px; }
.cd-info-row  { display: flex; gap: 10px; padding: 9px 13px; border-bottom: 1px solid var(--cd-bdr); }
.cd-info-row:last-child { border-bottom: none; }
.cd-info-k   { font-size: 11px; font-weight: 700; color: var(--cd-dim); width: 65px; flex-shrink: 0; }
.cd-info-v   { font-size: 12px; color: var(--cd-text); }
.cd-link     { color: var(--cd-blue); text-decoration: none; }
.cd-note-blk { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; padding: 11px 13px; font-size: 12px; color: var(--cd-muted); line-height: 1.7; margin-bottom: 10px; }
.cd-log-sec  { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 13px; padding: 13px; margin-bottom: 13px; }
.cd-act-type { flex: 1; min-width: 46px; padding: 6px 3px; border-radius: 9px; background: var(--cd-bg3); border: 1px solid var(--cd-bdr); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: var(--cd-dim); cursor: pointer; transition: all 0.15s; text-align: center; font-family: var(--cd-sans); }
.cd-act-type:hover { color: var(--cd-muted); }
.cd-act-type.sel { background: rgba(0,255,135,0.08); color: var(--cd-accent); border-color: rgba(0,255,135,0.3); }
.cd-tl-dot   { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; border: 1px solid; flex-shrink: 0; }
.cd-tl-dot.email    { background: rgba(77,166,255,0.1); border-color: rgba(77,166,255,0.3); }
.cd-tl-dot.call     { background: rgba(0,255,135,0.08); border-color: rgba(0,255,135,0.25); }
.cd-tl-dot.text     { background: rgba(184,125,255,0.1); border-color: rgba(184,125,255,0.3); }
.cd-tl-dot.meeting  { background: rgba(255,215,0,0.08); border-color: rgba(255,215,0,0.25); }
.cd-tl-dot.linkedin { background: rgba(77,166,255,0.08); border-color: rgba(77,166,255,0.2); }
.cd-tl-dot.other    { background: rgba(255,255,255,0.04); border-color: var(--cd-bdr); }
.cd-tl-resp  { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; border: 1px solid; cursor: pointer; transition: all 0.15s; }
.cd-tl-resp.yes { color: var(--cd-accent); border-color: rgba(0,255,135,0.3); background: rgba(0,255,135,0.08); cursor: default; }
.cd-tl-resp.no  { color: var(--cd-dim); border-color: var(--cd-bdr); background: transparent; }
.cd-tl-resp.no:hover { color: var(--cd-muted); }

/* ── Add ─────────────────────────────────────────────────────────────────── */
.cd-scan-zone { background: linear-gradient(135deg, #04130d, #050e0a); border: 2px dashed rgba(0,255,135,0.25); border-radius: 17px; padding: 24px 20px; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 4px; }
.cd-scan-zone:hover { border-color: rgba(0,255,135,0.6); background: linear-gradient(135deg, #061a10, #070f0c); }

/* ── Toast ───────────────────────────────────────────────────────────────── */
.cd-toast { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); background: var(--cd-bg2); border: 1.5px solid var(--cd-accent); border-radius: 99px; padding: 9px 18px; display: flex; align-items: center; gap: 8px; z-index: 999; white-space: nowrap; box-shadow: 0 0 30px rgba(0,255,135,0.2), 0 8px 24px rgba(0,0,0,0.7); }
.cd-toast-enter-active { animation: cd-tin 0.35s cubic-bezier(0.34,1.4,0.64,1); }
.cd-toast-leave-active { transition: opacity 0.2s; }
.cd-toast-leave-to { opacity: 0; }
@keyframes cd-tin { from { opacity: 0; transform: translateX(-50%) translateY(16px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }

/* ── Right panel ─────────────────────────────────────────────────────────── */
.cd-panel  { flex: 1; overflow-y: auto; padding: 28px 28px 40px; background: var(--cd-bg); }
.cd-panel::-webkit-scrollbar { width: 5px; }
.cd-panel::-webkit-scrollbar-track { background: transparent; }
.cd-panel::-webkit-scrollbar-thumb { background: var(--cd-bdr2); border-radius: 99px; }
.cd-panel-logo { font-family: var(--cd-bebas); font-size: 28px; letter-spacing: 2px; margin-bottom: 4px; }
.cd-tab    { padding: 7px 14px; border-radius: 9px; border: 1px solid var(--cd-bdr); background: transparent; color: var(--cd-dim); font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: var(--cd-sans); }
.cd-tab:hover { color: var(--cd-muted); border-color: var(--cd-bdr2); }
.cd-tab.on { background: rgba(0,255,135,0.1); color: var(--cd-accent); border-color: rgba(0,255,135,0.3); }
.cd-divider { height: 1px; background: var(--cd-bdr); margin: 20px 0; }
.cd-panel-sec { font-family: var(--cd-cond); font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--cd-dim); margin-bottom: 12px; }
.cd-guide-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
.cd-guide-card { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; padding: 12px; }
.cd-warmer-card { background: linear-gradient(135deg, rgba(168,216,234,0.06), rgba(77,166,255,0.03)); border: 1px solid rgba(168,216,234,0.15); border-radius: 11px; padding: 11px 13px; display: flex; align-items: flex-start; gap: 10px; }
.cd-xp-table { background: var(--cd-bg2); border: 1px solid var(--cd-bdr); border-radius: 12px; overflow: hidden; margin-bottom: 4px; }
.cd-xp-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--cd-bdr); }
.cd-xp-row:last-child { border-bottom: none; }
</style>
