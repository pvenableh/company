<script setup lang="ts">
/**
 * Digital business card surface — ported verbatim from CardDesk
 * (website/app/components/card/View.vue) so Earnest's "My Card" preview renders
 * the EXACT design the user selected. One markup tree, four full-bleed designs;
 * the look is selected entirely by `card.card_theme`
 * (carddesk | glass | editorial | tech), rendered as `data-card-theme` on the
 * root and styled by the scoped CSS below.
 *
 * This is the STATIC (preview) build: the interactive chrome CardDesk carries on
 * its live public page — Save-to-contacts vCard, native share, the floating QR
 * overlay, cover parallax — is dropped, because the My Card sheet renders it
 * read-only (`interactive=false`), exactly as CardDesk's own account editor
 * preview does. Keep the template + scoped CSS in sync with CardDesk's
 * card/View.vue so the two stay pixel-identical.
 */
import CdIcon from './CdIcon.vue'
import { SOCIALS, socialUrl } from '~/utils/cardSocials'
import { normalizeCardTheme } from '~/composables/useCardThemes'

export interface CardViewData {
  id?: string
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  headline?: string | null
  office_address?: string | null
  imageUrl?: string | null
  coverUrl?: string | null
  logoUrl?: string | null
  card_theme?: string | null
  /** Earnest-gated booking link-out; enabled only for scheduling-on users. */
  booking?: { enabled: boolean; url: string | null } | null
  /** Minimal/flat layout — strips the boxed row widgets on glass + tech. */
  flat_layout?: boolean | null
  [key: string]: any
}

const props = withDefaults(
  defineProps<{
    card: CardViewData
    /** Whether tel/mail/social links fire. False in the My Card preview. */
    interactive?: boolean
  }>(),
  { interactive: false },
)

const theme = computed(() => normalizeCardTheme(props.card.card_theme))
// Title reads as the role line; company is rendered separately as a badge.
const roleLine = computed(() => props.card.title || '')
// Earnest booking: shown only when the cardholder has public scheduling on
// AND the card is interactive (hidden in the read-only preview, like CardDesk).
const booking = computed(() => props.card.booking || null)
const socialLinks = computed(() => SOCIALS.filter((s) => props.card[s.key]))

// Tidy a URL for display: drop protocol + trailing slash (huestudios.com).
function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}
const initials = computed(() =>
  (props.card.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?',
)

// Contact details rendered as readable rows (label + actual value), like a real
// card — phone, email, website. Address is rendered separately at the bottom.
const rows = computed(() => {
  const c = props.card
  const out: { key: string; label: string; value: string; icon: string; emoji: string; href: string; aux?: { icon: string; href: string; label: string } }[] = []
  if (c.phone)
    out.push({ key: 'phone', label: 'Phone', value: c.phone, icon: 'lucide:phone', emoji: '📞', href: `tel:${c.phone}`, aux: { icon: 'lucide:message-square', href: `sms:${c.phone}`, label: 'Text' } })
  if (c.email) out.push({ key: 'email', label: 'Email', value: c.email, icon: 'lucide:mail', emoji: '✉️', href: `mailto:${c.email}` })
  if (c.website) out.push({ key: 'web', label: 'Website', value: prettyUrl(c.website), icon: 'lucide:globe', emoji: '🌐', href: c.website })
  return out
})
const mapsHref = computed(() =>
  props.card.office_address ? `https://maps.google.com/?q=${encodeURIComponent(props.card.office_address)}` : '',
)

// In the static preview all links are inert — swallow the click so tapping a row
// in the sheet doesn't navigate away.
function onChip(e: Event) {
  if (!props.interactive) e.preventDefault()
}
</script>

<template>
  <div class="cv" :data-card-theme="theme" :data-flat="card.flat_layout ? 'true' : 'false'" :class="{ 'cv--cover': !!card.coverUrl }">
    <div class="cv-bg" aria-hidden="true">
      <!-- Ambient colour field — only painted in the Glass direction. -->
      <span class="cv-blob" style="--bx: -6%; --by: -8%; --bs: 46vw; --bc: #08bdbd"></span>
      <span class="cv-blob" style="--bx: 64%; --by: 26%; --bs: 40vw; --bc: #c200fb; animation-delay: -5s"></span>
      <span class="cv-blob" style="--bx: 2%; --by: 62%; --bs: 36vw; --bc: #00bfff; animation-delay: -10s"></span>
      <span class="cv-blob" style="--bx: 58%; --by: 78%; --bs: 32vw; --bc: #c6c013; animation-delay: -15s"></span>
      <span class="cv-veil"></span>
    </div>

    <!-- True full-width cover banner, anchored to the very top of the card. -->
    <div v-if="card.coverUrl" ref="coverEl" class="cv-cover">
      <img :src="card.coverUrl" alt="" />
      <i class="cv-cover-scrim" aria-hidden="true"></i>
    </div>

    <div class="cv-main">
      <div class="cv-kicker"><span class="cv-brand">CARD<b>DESK</b></span></div>

      <!-- Header row: profile photo (left) + company logo (right). -->
      <div class="cv-head" :class="{ 'cv-head--cover': !!card.coverUrl }">
        <div class="cv-photo" :class="{ 'cv-photo--cover': !!card.coverUrl }">
          <img v-if="card.imageUrl" :src="card.imageUrl" :alt="card.name" />
          <span v-else>{{ initials }}</span>
        </div>
        <div v-if="card.logoUrl" class="cv-logo">
          <img :src="card.logoUrl" alt="Company logo" />
        </div>
      </div>

      <h1 class="cv-name">{{ card.name }}</h1>
      <p v-if="roleLine" class="cv-role">{{ roleLine }}</p>
      <p v-if="card.company" class="cv-company">{{ card.company }}</p>
      <p v-if="card.headline" class="cv-headline">{{ card.headline }}</p>

      <!-- Primary action: save the cardholder (for whoever opened this card).
           Inert in the read-only preview; the live CardDesk page wires it up. -->
      <button class="cv-save" type="button">
        <CdIcon emoji="📇" icon="lucide:user-plus" :size="17" />
        <span>Save contact</span>
      </button>

      <!-- Earnest-gated "Book a call" — link-out to the cardholder's Earnest
           booking page (new tab, card stays open). Hidden for card-only users. -->
      <a
        v-if="interactive && booking?.enabled && booking?.url"
        class="cv-book"
        :href="booking.url"
        target="_blank"
        rel="noopener"
      >
        <CdIcon emoji="📅" icon="lucide:calendar" :size="17" />
        <span>Book a call</span>
      </a>

      <!-- Contact details (label + value rows) -->
      <div v-if="rows.length" class="cv-rows">
        <div v-for="r in rows" :key="r.key" class="cv-row">
          <a
            class="cv-row-main"
            :href="r.href"
            :target="r.key === 'web' || r.key === 'map' ? '_blank' : undefined"
            rel="noopener"
            @click="onChip"
          >
            <span class="cv-row-ico"><CdIcon :emoji="r.emoji" :icon="r.icon" :size="16" /></span>
            <span class="cv-row-text">
              <span class="cv-row-label">{{ r.label }}</span>
              <span class="cv-row-value">{{ r.value }}</span>
            </span>
            <CdIcon class="cv-row-go" icon="lucide:chevron-right" :size="16" />
          </a>
          <a v-if="r.aux" class="cv-row-aux" :href="r.aux.href" :aria-label="r.aux.label" @click="onChip">
            <CdIcon :icon="r.aux.icon" :size="16" />
          </a>
        </div>
      </div>

      <!-- Socials — labelled "connect" rows with neutral (theme-coloured) glyphs;
           reuse the detail-row classes so they pick up each theme's treatment. -->
      <div v-if="socialLinks.length" class="cv-rows cv-socials">
        <a
          v-for="s in socialLinks"
          :key="s.key"
          class="cv-row-main cv-soc-row"
          :href="interactive ? socialUrl(s.key, card[s.key]) : undefined"
          target="_blank"
          rel="noopener"
          :aria-label="s.cta"
          @click="onChip"
        >
          <span class="cv-row-ico cv-soc-ico"><Icon :name="s.mono" :size="17" /></span>
          <span class="cv-row-text"><span class="cv-row-value">{{ s.cta }}</span></span>
          <CdIcon class="cv-row-go" icon="lucide:arrow-up-right" :size="15" />
        </a>
      </div>

      <!-- Address — last, below the social connections. Hidden when the owner
           toggles it off (show_address:false); shown for legacy cards (null). -->
      <div v-if="card.office_address && card.show_address !== false" class="cv-rows cv-address-row">
        <div class="cv-row">
          <a class="cv-row-main" :href="mapsHref" target="_blank" rel="noopener" @click="onChip">
            <span class="cv-row-ico"><CdIcon emoji="📍" icon="lucide:map-pin" :size="16" /></span>
            <span class="cv-row-text">
              <span class="cv-row-label">Address</span>
              <span class="cv-row-value">{{ card.office_address }}</span>
            </span>
            <CdIcon class="cv-row-go" icon="lucide:chevron-right" :size="16" />
          </a>
        </div>
      </div>

      <div class="cv-foot"><slot name="footer" /></div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================================
   SHARED STRUCTURE — full-bleed page (no floating card). Per-theme custom
   properties drive everything; only layout + var hooks live here.
   ========================================================================== */
.cv {
  position: relative;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--c-ink);
  font-family: var(--c-font);
  background: var(--c-bg);
  isolation: isolate;
  -webkit-font-smoothing: antialiased;
  /* fallbacks */
  --c-radius: 18px;
  --c-btn-radius: 100px;
  --c-photo-radius: 50%;
  --c-photo-size: 112px;
  --c-name-font: var(--c-font);
  --c-name-weight: 800;
  --c-name-spacing: -0.01em;
  --c-name-size: 30px;
  --c-name-transform: none;
  --c-accent-ink: #04130b;
}
.cv-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.cv-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--c-bg-grad, none);
}
.cv-blob {
  display: none;
  position: absolute;
  left: var(--bx);
  top: var(--by);
  width: var(--bs);
  height: var(--bs);
  border-radius: 50%;
  background: var(--bc);
  filter: blur(80px);
  opacity: 0.5;
  animation: cv-float 18s ease-in-out infinite;
}
.cv-veil {
  display: none;
  position: absolute;
  inset: 0;
  background: var(--c-bg);
  opacity: 0.28;
}
/* Drift + glow pulse so the orbs feel alive; the per-blob animation-delay
   staggers them so they brighten/dim out of sync. */
@keyframes cv-float {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
  33% { transform: translate(6%, -8%) scale(1.25); opacity: 0.95; }
  66% { transform: translate(-7%, 6%) scale(0.88); opacity: 0.45; }
}

.cv-main {
  position: relative;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  text-align: left;
  padding: clamp(36px, 9vh, 80px) 26px clamp(28px, 6vh, 56px);
  gap: 0;
  animation: cv-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes cv-rise {
  from { opacity: 0; transform: translateY(14px); }
}

.cv-kicker {
  margin-bottom: 22px;
}
.cv-brand {
  font-family: var(--c-brand-font, var(--c-font));
  font-size: 13px;
  font-weight: var(--c-brand-weight, 700);
  letter-spacing: var(--c-brand-spacing, 0.22em);
  text-transform: var(--c-brand-transform, uppercase);
  color: var(--c-faint);
}
.cv-brand b {
  color: var(--c-accent);
  font-weight: inherit;
}

/* True cover banner — full bleed at the top. Its transform is driven by JS to
   scroll at half speed (parallax) so the content sheet lifts off it with depth. */
.cv-cover {
  position: relative;
  z-index: 0;
  width: 100%;
  height: clamp(168px, 36vw, 260px);
  overflow: hidden;
  flex-shrink: 0;
  will-change: transform;
}
.cv-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cv-cover-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 55%, var(--c-cover-fade, rgba(8, 11, 18, 0.45)) 100%);
  /* Inset shadow on the cover so it reads as recessed — set behind everything. */
  box-shadow: inset 0 0 52px 10px rgba(0, 0, 0, 0.55);
}
/* With a cover, the brand label is dropped and content flows from the top so
   the photo can overlap the banner. */
.cv--cover .cv-kicker {
  display: none;
}
.cv--cover .cv-main {
  justify-content: flex-start;
  padding-top: 0;
  /* Opaque sheet (rounded top) that scrolls up over the pinned, recessed cover.
     Pulled up so its rounded top corners sit on the cover and stay visible. */
  position: relative;
  z-index: 1;
  margin-top: -30px;
  background: var(--c-bg);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
}
/* Header row — profile photo (left) opposite the company logo (right). */
.cv-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
/* With a cover, sit the photo/logo high on the cover (~80% overlap). The +30px
   counters the sheet's -30px lift; the rest sets how far up the photo rides. */
.cv-head--cover {
  margin-top: calc(30px - var(--c-photo-size) * 0.8);
}
.cv-logo {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--c-soc-bg, #fff);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.25);
}
.cv-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
/* Higher specificity (.cv-photo.cv-photo--cover) so this wins over base
   .cv-photo, which is defined later in the file. */
.cv-photo.cv-photo--cover {
  z-index: 1;
  /* Ring matches the card background to cut the photo cleanly from the cover;
     the theme glow reads on dark backdrops, the soft wide drop shadow reads on
     light ones — together they lift the photo forward over the recessed cover. */
  box-shadow:
    var(--c-photo-cover-ring, 0 0 0 2px var(--c-bg)),
    var(--c-photo-shadow, 0 0 0 0 transparent),
    0 10px 24px -10px rgba(0, 0, 0, 0.3);
}

.cv-photo {
  position: relative;
  width: var(--c-photo-size);
  height: var(--c-photo-size);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  font-family: var(--c-name-font);
  color: var(--c-accent);
  background: var(--c-photo-bg);
  border: var(--c-photo-bdr);
  /* Theme glow (dark themes) + a soft drop shadow (light themes) for depth. */
  box-shadow: var(--c-photo-shadow, 0 0 0 0 transparent), 0 9px 22px -10px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}
.cv-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cv-name {
  margin: 18px 0 0;
  font-family: var(--c-name-font);
  font-weight: var(--c-name-weight);
  font-size: var(--c-name-size);
  letter-spacing: var(--c-name-spacing);
  text-transform: var(--c-name-transform);
  line-height: 1.06;
  color: var(--c-ink);
}
.cv-role {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: var(--c-role-weight, 600);
  font-family: var(--c-role-font, var(--c-font));
  color: var(--c-muted);
  letter-spacing: var(--c-role-spacing, 0);
  text-transform: var(--c-role-transform, none);
}
/* Company name — same font/size/case as the title line, just a stronger colour
   so the two read as one consistent type treatment. */
.cv-company {
  margin-top: 4px;
  font-family: var(--c-role-font, var(--c-font));
  font-size: 13px;
  font-weight: var(--c-role-weight, 600);
  color: var(--c-ink);
  letter-spacing: var(--c-role-spacing, 0);
  text-transform: var(--c-role-transform, none);
  line-height: 1.2;
}
.cv-headline {
  margin: 14px 0 0;
  max-width: 360px;
  font-size: var(--c-headline-size, 15px);
  line-height: 1.5;
  color: var(--c-muted);
  font-style: var(--c-headline-style, normal);
  font-family: var(--c-headline-font, var(--c-font));
}

/* Primary CTA */
.cv-save {
  width: 100%;
  margin-top: 26px;
  padding: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: var(--c-save-bdr, none);
  border-radius: var(--c-btn-radius);
  background: var(--c-accent);
  color: var(--c-accent-ink);
  font-family: var(--c-btn-font, var(--c-font));
  font-size: 15px;
  font-weight: 700;
  letter-spacing: var(--c-btn-spacing, 0);
  text-transform: var(--c-btn-transform, none);
  cursor: pointer;
  transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background 0.2s ease;
  box-shadow: var(--c-save-shadow, none);
}
.cv-save:hover {
  transform: translateY(-2px);
  box-shadow: var(--c-save-shadow-hover, var(--c-save-shadow, none));
  background: var(--c-save-hover, var(--c-accent));
}
.cv-save:active {
  transform: scale(0.98);
}
/* Secondary CTA: Earnest booking link-out. Accent-tinted so it reads as a real
   action under Save contact without competing with it; fully theme-driven via
   --c-accent, so it inherits each design's colour automatically. */
.cv-book {
  width: 100%;
  margin-top: 12px;
  padding: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: var(--c-btn-radius);
  border: 1px solid color-mix(in srgb, var(--c-accent) 40%, transparent);
  background: color-mix(in srgb, var(--c-accent) 14%, transparent);
  color: var(--c-accent);
  font-family: var(--c-btn-font, var(--c-font));
  font-size: 15px;
  font-weight: 700;
  letter-spacing: var(--c-btn-spacing, 0);
  text-transform: var(--c-btn-transform, none);
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease;
}
.cv-book:hover {
  transform: translateY(-2px);
  background: color-mix(in srgb, var(--c-accent) 22%, transparent);
}
.cv-book:active {
  transform: scale(0.98);
}

/* Contact detail rows — icon + label + the actual value (Blinq-style). */
.cv-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 22px;
  width: 100%;
}
.cv-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.cv-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--c-chip-radius, 14px);
  border: 1px solid var(--c-surface-bdr);
  background: var(--c-surface);
  backdrop-filter: var(--c-surface-blur, none);
  -webkit-backdrop-filter: var(--c-surface-blur, none);
  color: var(--c-ink);
  text-decoration: none;
  text-align: left;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.16s ease;
}
.cv-row-main:hover {
  transform: translateY(-1px);
  border-color: var(--c-accent);
}
.cv-row-ico {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
}
.cv-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cv-row-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: var(--c-row-label-spacing, 0.06em);
  text-transform: uppercase;
  color: var(--c-muted);
}
.cv-row-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-ink);
  white-space: pre-line;
  word-break: break-word;
}
.cv-row-go {
  flex-shrink: 0;
  color: var(--c-faint);
}
.cv-row-aux {
  flex-shrink: 0;
  width: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--c-chip-radius, 14px);
  border: 1px solid var(--c-surface-bdr);
  background: var(--c-surface);
  backdrop-filter: var(--c-surface-blur, none);
  -webkit-backdrop-filter: var(--c-surface-blur, none);
  color: var(--c-accent);
  transition: border-color 0.18s ease, transform 0.16s ease;
}
.cv-row-aux:hover {
  transform: translateY(-1px);
  border-color: var(--c-accent);
}

/* Social "connect" rows reuse the detail-row classes; this just lifts the
   neutral brand glyph to the row's icon colour + separates the group. */
.cv-socials {
  margin-top: 10px;
}
.cv-soc-ico :deep(svg) {
  width: 17px;
  height: 17px;
}

.cv-foot {
  margin-top: 30px;
  text-align: center;
}
.cv-foot:empty {
  display: none;
}

/* ── Floating "Share" button — fixed at the bottom of the viewport; opens the
   full-screen QR. Theme-neutral so it reads on any design. ── */
.cv-fab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
  z-index: 260;
  /* Match the Save Contact button: the content column (.cv-main, max-width
     430px) minus its 26px side padding = 378px, centred with side margins. */
  width: calc(100% - 52px);
  max-width: 378px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  border-radius: 100px;
  border: none;
  background: #0e1016;
  color: #fff;
  font-family: 'Barlow', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 14px 34px -10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, bottom 0.25s ease;
  animation: cv-fab-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both 0.3s;
}
.cv-fab.raised {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 132px);
}
.cv-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 44px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.16) inset;
}
.cv-fab :deep(svg) { color: var(--qr-accent, #70ffd7); }
@keyframes cv-fab-in {
  from { opacity: 0; transform: translateY(16px); }
}

/* ── Full-screen QR overlay ── */
.cv-qrov {
  position: fixed;
  inset: 0;
  z-index: 320;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(env(safe-area-inset-top, 0px) + 20px) 22px calc(env(safe-area-inset-bottom, 0px) + 20px);
  background:
    radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--qr-accent, #70ffd7) 12%, transparent) 0%, transparent 55%),
    rgba(6, 8, 14, 0.94);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}
.cv-qrov-x {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 14px);
  right: 16px;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
}
.cv-qrov-x:hover { background: rgba(255, 255, 255, 0.14); }
.cv-qrov-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: cv-qrov-rise 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes cv-qrov-rise {
  from { opacity: 0; transform: translateY(16px); }
}
.cv-qrov-name {
  font-family: 'Barlow', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
}
.cv-qrov-sub {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: 'Barlow', system-ui, sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin: 6px 0 18px;
}
.cv-qrov-sub :deep(svg) { color: var(--qr-accent, #70ffd7); }
.cv-qrov-box {
  width: min(80vw, 300px) !important;
  height: min(80vw, 300px) !important;
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 16px !important;
  border-radius: 22px !important;
  box-shadow: 0 30px 70px -24px rgba(0, 0, 0, 0.7) !important;
}
.cv-qrov-box .cv-qr-img { width: 100%; height: 100%; }
.cv-qrov-box .cv-qr-scan { animation-name: cv-qr-scan-lg; }
@keyframes cv-qr-scan-lg {
  0% { transform: translateY(0); opacity: 0; }
  8% { opacity: 1; }
  46% { transform: translateY(calc(min(80vw, 300px) - 40px)); opacity: 1; }
  54% { transform: translateY(calc(min(80vw, 300px) - 40px)); opacity: 0; }
  100% { transform: translateY(0); opacity: 0; }
}
.cv-qrov-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
  width: min(80vw, 300px);
}
.cv-qrov-act {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  border-radius: 100px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-family: 'Barlow', system-ui, sans-serif;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, border-color 0.15s;
}
.cv-qrov-act:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.1); }
.cv-qrov-act.primary {
  background: var(--qr-accent, #70ffd7);
  color: #0a0a0a;
  border-color: transparent;
}
.cv-qrov-act.primary:hover { background: color-mix(in srgb, var(--qr-accent, #70ffd7) 82%, #fff); }
.cv-qrov-enter-active,
.cv-qrov-leave-active { transition: opacity 0.24s ease; }
.cv-qrov-enter-from,
.cv-qrov-leave-to { opacity: 0; }

.cv-qr-box {
  position: relative;
  background: #fff;
  border: 1px solid #ececf0;
  border-radius: 16px;
  padding: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 240px;
  min-height: 240px;
  overflow: hidden;
}
.cv-qr-img {
  display: block;
  border-radius: 4px;
  /* animated reveal: the QR scales + clips in from the top */
  animation: cv-qr-pop 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  clip-path: inset(0 0 0 0);
}
@keyframes cv-qr-pop {
  0% { opacity: 0; transform: scale(0.9); clip-path: inset(0 0 100% 0); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: scale(1); clip-path: inset(0 0 0 0); }
}
/* Sweeping scan line — the "alive" QR reveal the user liked from Blinq. */
.cv-qr-scan {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 14px;
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(90deg, transparent, var(--qr-accent, #00b87a) 25%, color-mix(in srgb, var(--qr-accent, #00b87a) 65%, #fff) 50%, var(--qr-accent, #00b87a) 75%, transparent);
  box-shadow: 0 0 14px 2px color-mix(in srgb, var(--qr-accent, #00b87a) 55%, transparent);
  animation: cv-qr-scan 2.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes cv-qr-scan {
  0% { transform: translateY(0); opacity: 0; }
  8% { opacity: 1; }
  46% { transform: translateY(212px); opacity: 1; }
  54% { transform: translateY(212px); opacity: 0; }
  100% { transform: translateY(0); opacity: 0; }
}
/* Scanner corner brackets that draw in on reveal. */
.cv-qr-corner {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2.5px solid var(--qr-accent, #00b87a);
  animation: cv-qr-corner 0.5s ease 0.25s both;
}
.cv-qr-corner.tl { top: 8px; left: 8px; border-right: none; border-bottom: none; border-radius: 6px 0 0 0; }
.cv-qr-corner.tr { top: 8px; right: 8px; border-left: none; border-bottom: none; border-radius: 0 6px 0 0; }
.cv-qr-corner.bl { bottom: 8px; left: 8px; border-right: none; border-top: none; border-radius: 0 0 0 6px; }
.cv-qr-corner.br { bottom: 8px; right: 8px; border-left: none; border-top: none; border-radius: 0 0 6px 0; }
@keyframes cv-qr-corner {
  from { opacity: 0; transform: scale(0.5); }
}
@media (prefers-reduced-motion: reduce) {
  .cv-qr-img, .cv-qr-corner { animation: none; }
  .cv-qr-scan { display: none; }
}
.cv-qr-load {
  color: #b0b0b8;
  animation: cv-spin 1s linear infinite;
}
@keyframes cv-spin {
  to { transform: rotate(360deg); }
}

/* ============================================================================
   THEME 1 · CARDDESK — signature liquid-glass aurora on near-black
   ========================================================================== */
.cv[data-card-theme='carddesk'] {
  --c-font: 'Barlow', system-ui, sans-serif;
  --c-ink: #f1f5ff;
  --c-muted: #9aa8c6;
  --c-faint: #6c7b9c;
  --c-accent: #70ffd7;
  --c-accent-ink: #032015;
  --c-bg: #080b12;
  --c-surface: rgba(255, 255, 255, 0.05);
  --c-surface-bdr: rgba(255, 255, 255, 0.1);
  --c-surface-blur: blur(14px) saturate(150%);
  --c-name-font: 'Bebas Neue', sans-serif;
  --c-name-weight: 400;
  --c-name-size: 36px;
  --c-name-spacing: 0.02em;
  --c-photo-bg: color-mix(in srgb, #70ffd7 16%, transparent);
  --c-photo-bdr: 2px solid color-mix(in srgb, #70ffd7 60%, transparent);
  --c-photo-shadow: 0 0 0 6px rgba(112, 255, 215, 0.06), 0 14px 30px -12px rgba(112, 255, 215, 0.4);
  --c-rule-h: 2px;
  --c-headline-style: italic;
  --c-soc-bg: rgba(255, 255, 255, 0.96);
  --c-soc-bdr: transparent;
  --c-soc-shadow: 0 5px 14px -6px rgba(0, 0, 0, 0.55);
  --c-save-shadow: 0 14px 30px -12px rgba(112, 255, 215, 0.5);
}
.cv[data-card-theme='carddesk'] .cv-bg {
  --c-bg-grad:
    radial-gradient(120% 75% at 0% 0%, rgba(112, 255, 215, 0.2) 0%, transparent 52%),
    radial-gradient(120% 75% at 100% 8%, rgba(122, 92, 255, 0.24) 0%, transparent 52%),
    radial-gradient(150% 95% at 50% 100%, rgba(77, 166, 255, 0.18) 0%, transparent 60%);
}
/* CardDesk hierarchy (mirrors Glass): Save = mint outline over dark glass,
   the teleported "Share my card" FAB = solid mint fill. */
.cv[data-card-theme='carddesk'] .cv-save {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
  color: var(--c-accent);
  border: 1.5px solid color-mix(in srgb, var(--c-accent) 80%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 8px 20px -14px color-mix(in srgb, var(--c-accent) 40%, transparent);
}
.cv[data-card-theme='carddesk'] .cv-save:hover {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.04) 100%);
  border-color: var(--c-accent);
}
.cv-fab[data-card-theme='carddesk'] {
  background: var(--qr-accent, #70ffd7);
  color: #032015;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 14px 34px -10px color-mix(in srgb, var(--qr-accent, #70ffd7) 45%, transparent);
}
.cv-fab[data-card-theme='carddesk']:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 20px 44px -12px color-mix(in srgb, var(--qr-accent, #70ffd7) 55%, transparent);
}
.cv-fab[data-card-theme='carddesk'] :deep(svg) {
  color: #032015;
}

/* ============================================================================
   THEME 2 · GLASS — frosted dark depth, ambient colour field, #00bfff pop
   (mirrors the pitch "Glass" direction)
   ========================================================================== */
.cv[data-card-theme='glass'] {
  --c-font: 'Proxima Nova', system-ui, sans-serif;
  --c-ink: #f4f4f5;
  --c-muted: #c0c0c8;
  --c-faint: #8b8b95;
  --c-accent: #00bfff;
  --c-accent-ink: #06222e;
  --c-bg: #0a0b0f;
  --c-surface: rgba(255, 255, 255, 0.055);
  --c-surface-bdr: rgba(255, 255, 255, 0.1);
  --c-surface-blur: blur(22px) saturate(170%);
  --c-radius: 22px;
  --c-chip-radius: 18px;
  /* Thin, uppercase, tracked-out name; light tracked supporting type. */
  --c-name-font: 'Proxima Nova', system-ui, sans-serif;
  --c-name-weight: 100;
  --c-name-size: 26px;
  --c-name-spacing: 0.14em;
  --c-name-transform: uppercase;
  --c-brand-font: 'Proxima Nova', system-ui, sans-serif;
  --c-brand-transform: uppercase;
  --c-brand-spacing: 0.22em;
  --c-role-font: 'Proxima Nova', system-ui, sans-serif;
  --c-role-weight: 300;
  --c-role-spacing: 0.12em;
  --c-role-transform: uppercase;
  --c-headline-font: 'Proxima Nova', system-ui, sans-serif;
  --c-headline-size: 14px;
  --c-btn-font: 'Proxima Nova', system-ui, sans-serif;
  --c-btn-transform: uppercase;
  --c-btn-spacing: 0.12em;
  --c-photo-bg: rgba(255, 255, 255, 0.06);
  --c-photo-bdr: 1px solid rgba(255, 255, 255, 0.18);
  --c-photo-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.7);
  --c-rule-h: 2px;
  --c-rule: var(--c-accent);
  --c-soc-bg: rgba(255, 255, 255, 0.96);
  --c-soc-bdr: transparent;
  --c-soc-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.6);
  --c-save-shadow: 0 10px 24px -8px rgba(0, 191, 255, 0.5);
  --c-save-shadow-hover: 0 16px 32px -10px rgba(0, 191, 255, 0.6);
}
.cv[data-card-theme='glass'] .cv-blob,
.cv[data-card-theme='glass'] .cv-veil {
  display: block;
}
.cv[data-card-theme='glass'] .cv-photo {
  color: #fff;
  backdrop-filter: blur(22px) saturate(170%);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
}
.cv[data-card-theme='glass'] .cv-name {
  text-shadow: 0 1px 30px rgba(0, 0, 0, 0.3);
}
/* Lighter, more tracked detail-row labels to match the thin glass type. */
.cv[data-card-theme='glass'] .cv-row-label {
  font-weight: 400;
  letter-spacing: 0.16em;
}
/* Lighter cut for the primary CTA (uppercase + tracking come from the vars). */
.cv[data-card-theme='glass'] .cv-save {
  font-weight: 500;
}

/* ════════ Glass · liquid-glass surfaces ════════ */
/* Frosted content sheet so the glowing orbs (and cover) shimmer through. */
.cv[data-card-theme='glass'].cv--cover .cv-main {
  background: linear-gradient(180deg, rgba(14, 16, 22, 0.4) 0%, rgba(10, 11, 16, 0.58) 100%);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  /* Very subtle liquid-glass edge: a hairline translucent border + the existing
     top highlight, so the sheet reads as a pane of glass without a hard line. */
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}
/* Calmer orbs in Glass: dimmer + softer + a stronger dark veil, so the ambient
   colour reads as a subtle wash rather than vivid, fast-moving lights. */
.cv[data-card-theme='glass'] .cv-veil {
  opacity: 0.42;
}
.cv[data-card-theme='glass'] .cv-blob {
  opacity: 0.26;
  filter: blur(100px);
  animation-name: cv-float-glass;
  animation-duration: 26s;
}
/* Gentler drift + a much smaller brightness swing than the default cv-float. */
@keyframes cv-float-glass {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.26; }
  33% { transform: translate(4%, -5%) scale(1.1); opacity: 0.46; }
  66% { transform: translate(-5%, 4%) scale(0.94); opacity: 0.22; }
}
/* Glossy glass detail rows + aux button. */
.cv[data-card-theme='glass'] .cv-row-main,
.cv[data-card-theme='glass'] .cv-row-aux {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.04) 60%, rgba(255, 255, 255, 0.08) 100%);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -14px 22px -16px rgba(0, 0, 0, 0.45);
}
/* Liquid-glass icon backgrounds (accent-tinted, frosted, glossy top edge). */
.cv[data-card-theme='glass'] .cv-row-ico {
  background: linear-gradient(160deg, color-mix(in srgb, var(--c-accent) 32%, transparent), color-mix(in srgb, var(--c-accent) 8%, transparent));
  border-color: color-mix(in srgb, var(--c-accent) 45%, rgba(255, 255, 255, 0.25));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
}
/* Liquid-glass primary button — outlined in the accent over a frosted glass
   fill (not an accent flood), so it reads as the outline CTA against the orbs. */
.cv[data-card-theme='glass'] .cv-save {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.05) 100%);
  color: #ffffff;
  border: 1.5px solid color-mix(in srgb, var(--c-accent) 80%, transparent);
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -12px 20px -14px rgba(0, 20, 40, 0.3),
    0 8px 20px -14px color-mix(in srgb, var(--c-accent) 40%, transparent);
}
.cv[data-card-theme='glass'] .cv-save:hover {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.08) 100%);
  border-color: var(--c-accent);
}
/* The QR chrome is teleported to <body>, so it's tagged with data-card-theme
   and styled here with the same thin/tracked treatment in Glass. */
.cv-fab[data-card-theme='glass'] {
  font-family: 'Proxima Nova', system-ui, sans-serif;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  /* Match the liquid-glass primary CTA so the FAB doesn't vanish into the
     dark glass background instead of reading as a solid black pill. */
  background: linear-gradient(180deg, color-mix(in srgb, var(--qr-accent, #00bfff) 72%, transparent) 0%, color-mix(in srgb, var(--qr-accent, #00bfff) 46%, transparent) 100%);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -12px 20px -14px rgba(0, 20, 40, 0.3),
    0 12px 30px -12px color-mix(in srgb, var(--qr-accent, #00bfff) 50%, transparent);
}
.cv-fab[data-card-theme='glass']:hover {
  background: linear-gradient(180deg, color-mix(in srgb, var(--qr-accent, #00bfff) 82%, transparent) 0%, color-mix(in srgb, var(--qr-accent, #00bfff) 56%, transparent) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    inset 0 -12px 20px -14px rgba(0, 20, 40, 0.3),
    0 18px 40px -12px color-mix(in srgb, var(--qr-accent, #00bfff) 58%, transparent);
}
/* The icon sits on the accent fill now — keep it white, not accent-on-accent. */
.cv-fab[data-card-theme='glass'] :deep(svg) {
  color: #ffffff;
}
.cv-qrov[data-card-theme='glass'] .cv-qrov-name {
  font-family: 'Proxima Nova', system-ui, sans-serif;
  font-weight: 100;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}
.cv-qrov[data-card-theme='glass'] .cv-qrov-sub {
  font-family: 'Proxima Nova', system-ui, sans-serif;
  font-weight: 300;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.cv-qrov[data-card-theme='glass'] .cv-qrov-act {
  font-family: 'Proxima Nova', system-ui, sans-serif;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ============================================================================
   THEME 3 · EDITORIAL — print-magazine calm, cream/ink, Bauer Bodoni, bronze
   (mirrors the pitch "Editorial" direction)
   ========================================================================== */
.cv[data-card-theme='editorial'] {
  --c-font: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --c-ink: #2b2620;
  --c-muted: #8b8475;
  --c-faint: #8b8475;
  --c-accent: #2b2620;
  --c-accent-ink: #f5f3ef;
  --c-bg: #f5f3ef;
  --c-surface: transparent;
  --c-surface-bdr: #d4cfc7;
  --c-radius: 2px;
  --c-btn-radius: 2px;
  --c-chip-radius: 2px;
  --c-soc-radius: 2px;
  --c-badge-radius: 2px;
  --c-name-font: 'Bauer Bodoni', Georgia, serif;
  --c-name-weight: 400;
  --c-name-size: 38px;
  --c-name-spacing: -0.005em;
  --c-brand-font: 'Proxima Nova', system-ui, sans-serif;
  --c-brand-spacing: 0.22em;
  --c-photo-radius: 3px;
  --c-photo-size: 124px;
  --c-photo-bg: #efe6d5;
  --c-photo-bdr: 1px solid #d4cfc7;
  --c-rule-h: 2px;
  --c-rule: #8b7355;
  --c-headline-style: italic;
  --c-headline-font: 'Bauer Bodoni', Georgia, serif;
  --c-headline-size: 19px;
  --c-role-font: 'Proxima Nova', system-ui, sans-serif;
  --c-role-weight: 700;
  --c-role-spacing: 0.18em;
  --c-role-transform: uppercase;
  --c-btn-font: 'Proxima Nova', system-ui, sans-serif;
  --c-btn-spacing: 0.08em;
  --c-btn-transform: uppercase;
  --c-chip-font: 'Proxima Nova', system-ui, sans-serif;
  --c-chip-spacing: 0.08em;
  --c-chip-transform: uppercase;
  --c-soc-bg: #fdfcfa;
  --c-soc-bdr: #d4cfc7;
  /* the bronze brass accent for the primary button hover */
  --c-save-hover: #8b7355;
}
.cv[data-card-theme='editorial'] .cv-brand {
  color: #8b7355;
  font-size: 11px;
  font-weight: 700;
}
.cv[data-card-theme='editorial'] .cv-brand b {
  color: #8b7355;
}
.cv[data-card-theme='editorial'] .cv-role {
  font-size: 11px;
}
.cv[data-card-theme='editorial'] .cv-row-label {
  color: #8b7355;
  font-family: var(--c-chip-font);
}
.cv[data-card-theme='editorial'] .cv-row-main:hover,
.cv[data-card-theme='editorial'] .cv-row-aux:hover {
  border-color: #8b7355;
}
/* Match the editorial title's size so title + company read as one type style. */
.cv[data-card-theme='editorial'] .cv-company {
  font-size: 11px;
}
/* Cool paper gradient — a soft, subtle greige a touch cooler than the warm
   card panel, so the card still lifts off the page but the tone is calmer. */
.cv[data-card-theme='editorial'] .cv-bg::before {
  background:
    radial-gradient(120% 70% at 50% 120%, rgba(92, 98, 106, 0.05) 0%, transparent 55%),
    radial-gradient(140% 100% at 50% -6%, #f3f2ee 0%, #ebe9e2 60%, #e4e2d9 100%);
}
/* ── Editorial: clean borderless contact list (no boxes/labels), sans values,
   bronze icons, outline Save button. ── */
.cv[data-card-theme='editorial'] .cv-rows {
  gap: 4px;
}
.cv[data-card-theme='editorial'] .cv-row-main {
  background: none;
  border: none;
  border-radius: 0;
  padding: 6px 2px;
}
.cv[data-card-theme='editorial'] .cv-row-main:hover {
  transform: none;
}
.cv[data-card-theme='editorial'] .cv-row-aux {
  background: none;
  border: none;
  width: 40px;
  color: #8b7355;
}
.cv[data-card-theme='editorial'] .cv-row-aux:hover {
  transform: none;
}
/* Subtle bronze-tinted circular icon background. */
.cv[data-card-theme='editorial'] .cv-row-ico {
  background: color-mix(in srgb, #8b7355 12%, transparent);
  border: 1px solid color-mix(in srgb, #8b7355 22%, transparent);
  border-radius: 50%;
  box-shadow: none;
  color: #8b7355;
  width: 36px;
  height: 36px;
}
.cv[data-card-theme='editorial'] .cv-row-label {
  display: none;
}
.cv[data-card-theme='editorial'] .cv-row-value {
  font-family: 'Proxima Nova', system-ui, sans-serif;
  font-weight: 500;
  font-size: 14.5px;
  letter-spacing: 0.05em;
}
/* No chevrons. */
.cv[data-card-theme='editorial'] .cv-row-go {
  display: none;
}
/* Bronze OUTLINE pill Save button — fills bronze on hover. */
.cv[data-card-theme='editorial'] .cv-save {
  background: transparent;
  color: #8b7355;
  border: 1.5px solid #8b7355;
  border-radius: 100px;
  box-shadow: none;
}
.cv[data-card-theme='editorial'] .cv-save:hover {
  background: #8b7355;
  color: #ffffff;
  border-color: #8b7355;
}
/* Book-a-call secondary: bronze pill to match Save (editorial's --c-accent is
   dark ink, so tint it with the bronze brass instead for a cohesive pair). */
.cv[data-card-theme='editorial'] .cv-book {
  border-radius: 100px;
  border-color: color-mix(in srgb, #8b7355 45%, transparent);
  background: color-mix(in srgb, #8b7355 12%, transparent);
  color: #8b7355;
}
.cv[data-card-theme='editorial'] .cv-book:hover {
  background: color-mix(in srgb, #8b7355 20%, transparent);
}
/* Lift the content onto a subtle paper card so it reads like a printed card
   resting on the page (soft, diffuse shadow + hairline rule; sharp corners). */
.cv[data-card-theme='editorial'] .cv-main {
  background: #fffdf9;
  border: 1px solid #e7e1d7;
  border-radius: 3px;
  box-shadow: 0 22px 48px -26px rgba(64, 52, 34, 0.4), 0 6px 16px -10px rgba(64, 52, 34, 0.16);
  margin-top: clamp(16px, 4vh, 32px);
  margin-bottom: clamp(16px, 4vh, 32px);
}
/* With a cover photo, keep the sheet's rounded top + lift so the curved top
   still reads behind the profile photo (the flat radius/margin above erased it). */
.cv[data-card-theme='editorial'].cv--cover .cv-main {
  margin-top: -30px;
  border-radius: 20px 20px 3px 3px;
}
/* The teleported "Share my card" FAB picks up Editorial's uppercase button type. */
.cv-fab[data-card-theme='editorial'] {
  font-family: 'Proxima Nova', system-ui, sans-serif;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

/* ============================================================================
   THEME 4 · TECH — light Linear/Vercel-docs energy, cyan accent, mono labels
   (mirrors the pitch "Tech" direction)
   ========================================================================== */
.cv[data-card-theme='tech'] {
  --c-font: 'Proxima Nova', system-ui, sans-serif;
  --c-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  --c-ink: #18181b;
  --c-muted: #9b9ba4;
  --c-faint: #9b9ba4;
  --c-accent: #13708f;
  --c-accent-ink: #ffffff;
  --c-bg: #ffffff;
  --c-surface: #f7f7f9;
  --c-surface-bdr: #ececef;
  --c-radius: 12px;
  --c-btn-radius: 9px;
  --c-chip-radius: 12px;
  --c-soc-radius: 9px;
  --c-badge-radius: 8px;
  --c-name-weight: 700;
  --c-name-size: 30px;
  --c-name-spacing: -0.02em;
  --c-brand-font: var(--c-mono);
  --c-brand-spacing: 0.08em;
  --c-photo-radius: 14px;
  --c-photo-size: 112px;
  --c-photo-bg: #f7f7f9;
  --c-photo-bdr: 1px solid #ececef;
  --c-rule-h: 1px;
  --c-rule: #dcdce1;
  --c-role-font: var(--c-mono);
  --c-role-weight: 500;
  --c-role-spacing: 0.02em;
  /* Mono, uppercase buttons to match the tech direction's terminal-ish type. */
  --c-btn-font: var(--c-mono);
  --c-btn-spacing: 0.08em;
  --c-btn-transform: uppercase;
  --c-headline-size: 16px;
  --c-soc-bg: #f7f7f9;
  --c-soc-bdr: #dcdce1;
  /* bright cyan CTA from the pitch tech direction */
  --c-accent: #1e99c1;
  --c-save-hover: #178fb0;
}
.cv[data-card-theme='tech'] {
  /* keep the readable accent for text/rules, bright cyan only on the button */
  --c-rule: #dcdce1;
}
.cv[data-card-theme='tech'] .cv-brand {
  color: #13708f;
}
.cv[data-card-theme='tech'] .cv-brand b {
  color: #1e99c1;
}
.cv[data-card-theme='tech'] .cv-role {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #13708f;
}
.cv[data-card-theme='tech'] .cv-row-main:hover,
.cv[data-card-theme='tech'] .cv-row-aux:hover {
  border-color: #1e99c1;
  color: #13708f;
}
/* Mono detail-row labels (PHONE / EMAIL / …) for the tech direction. */
.cv[data-card-theme='tech'] .cv-row-label {
  font-family: var(--c-mono);
}
/* FAB is teleported outside .cv, so --c-mono won't resolve — use the stack. */
.cv-fab[data-card-theme='tech'] {
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cv[data-card-theme='tech'] .cv-bg::before {
  background:
    linear-gradient(180deg, #f7f7f9 0%, transparent 220px),
    radial-gradient(120% 60% at 50% 0%, rgba(30, 153, 193, 0.06) 0%, transparent 60%);
}
/* Lift the white card off the near-white page with a soft, diffuse shadow +
   hairline so it reads with depth (Linear/Vercel-card feel). */
.cv[data-card-theme='tech'] .cv-main {
  background: #ffffff;
  border: 1px solid #ececef;
  border-radius: var(--c-radius);
  box-shadow: 0 20px 44px -24px rgba(24, 24, 27, 0.22), 0 6px 16px -10px rgba(24, 24, 27, 0.1);
  margin-top: clamp(16px, 4vh, 32px);
  margin-bottom: clamp(16px, 4vh, 32px);
}
/* With a cover photo, keep the sheet's rounded top + lift (mirrors editorial). */
.cv[data-card-theme='tech'].cv--cover .cv-main {
  margin-top: -30px;
  border-radius: 20px 20px var(--c-radius) var(--c-radius);
}

/* ============================================================================
   FLAT LAYOUT (data-flat='true') — optional minimal treatment for Glass + Tech:
   strip the boxed detail-row "widgets" (backgrounds / borders / chevrons) and
   the glass card edge so the info reads as a clean list, like Editorial.
   ========================================================================== */
.cv[data-flat='true'][data-card-theme='glass'] .cv-row-main,
.cv[data-flat='true'][data-card-theme='glass'] .cv-row-aux,
.cv[data-flat='true'][data-card-theme='tech'] .cv-row-main,
.cv[data-flat='true'][data-card-theme='tech'] .cv-row-aux {
  background: none;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 8px 2px;
}
.cv[data-flat='true'][data-card-theme='glass'] .cv-row-main:hover,
.cv[data-flat='true'][data-card-theme='glass'] .cv-row-aux:hover,
.cv[data-flat='true'][data-card-theme='tech'] .cv-row-main:hover,
.cv[data-flat='true'][data-card-theme='tech'] .cv-row-aux:hover {
  transform: none;
  border-color: transparent;
}
/* Drop the trailing chevrons for the minimal list feel. */
.cv[data-flat='true'][data-card-theme='glass'] .cv-row-go,
.cv[data-flat='true'][data-card-theme='tech'] .cv-row-go {
  display: none;
}
/* Remove the subtle liquid-glass card edge in flat mode. */
.cv[data-flat='true'][data-card-theme='glass'].cv--cover .cv-main {
  border-color: transparent;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
</style>
