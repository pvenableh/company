<!--
  MyCardSheet — one iOS-native place to manage your digital business card +
  booking link. Mounted once globally (app.vue); opened from the user menu via
  useMyCard().open(). Edits the SAME cd_cards + scheduler_settings rows CardDesk
  and the public /c/[id] card read — one edit, live everywhere.

  Results-first: a live card preview + one Share row up top; every field
  autosaves optimistically (no Save button). Earnest style throughout.
-->
<script setup lang="ts">
const { data, loading, saving, savedAt, error, isOpen, load, touch, flush } = useMyCard();
const toast = useToast();

// Persist any pending debounced edit when the sheet is dismissed (backdrop / drag
// / Escape all set isOpen=false through v-model).
watch(isOpen, (open, was) => { if (was && !open) flush(); });

onMounted(() => { if (isOpen.value) load(); });

// ── Derived preview bits ─────────────────────────────────────────────────────
const card = computed(() => data.value?.card ?? {});
const initials = computed(() => {
  const n = (card.value.display_name || '').trim();
  return n ? n.split(/\s+/).map((p: string) => p[0]).slice(0, 2).join('').toUpperCase() : '?';
});
function fileUrl(f: any, key = ''): string | null {
  const id = typeof f === 'object' ? f?.id : f;
  if (!id || !data.value?.assetsUrl) return null;
  return `${data.value.assetsUrl}/assets/${id}${key ? `?key=${key}` : ''}`;
}
const imageUrl = computed(() => fileUrl(card.value.image, 'avatar'));
const coverUrl = computed(() => fileUrl(card.value.cover_image));
const THEME_ACCENT: Record<string, string> = {
  carddesk: 'from-primary/70 to-primary',
  editorial: 'from-amber-400 to-orange-500',
  glass: 'from-sky-400 to-blue-500',
  tech: 'from-emerald-400 to-teal-500',
};
const accent = computed(() => THEME_ACCENT[card.value.card_theme || 'carddesk'] || THEME_ACCENT.carddesk);
const THEMES = [
  { key: 'carddesk', label: 'CardDesk' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'glass', label: 'Glass' },
  { key: 'tech', label: 'Tech' },
];
const SOCIALS: Array<{ key: string; icon: string; label: string }> = [
  { key: 'linkedin', icon: 'i-logos-linkedin-icon', label: 'LinkedIn' },
  { key: 'instagram', icon: 'i-logos-instagram-icon', label: 'Instagram' },
  { key: 'twitter', icon: 'i-logos-x', label: 'X / Twitter' },
  { key: 'youtube', icon: 'i-logos-youtube-icon', label: 'YouTube' },
  { key: 'behance', icon: 'i-logos-behance', label: 'Behance' },
];
const activeSocials = computed(() => SOCIALS.filter((s) => (card.value as any)[s.key]));

const bookingUrl = computed(() => {
  const p = data.value?.bookingPath;
  if (!p) return null;
  return import.meta.client ? `${window.location.origin}${p}` : p;
});

// ── Share actions ────────────────────────────────────────────────────────────
async function copy(text: string | null | undefined, label: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: `${label} copied`, icon: 'i-lucide-check', color: 'green' });
  } catch {
    toast.add({ title: 'Could not copy', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}
function openPublicCard() {
  if (data.value?.publicCardUrl) window.open(data.value.publicCardUrl, '_blank', 'noopener');
}
function downloadVcard() {
  const c = card.value;
  const esc = (v: any) => String(v || '').replace(/[,;\\]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const [first, ...rest] = String(c.display_name || '').trim().split(/\s+/);
  const last = rest.join(' ');
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${esc(c.display_name || 'Contact')}`,
    `N:${esc(last)};${esc(first)};;;`,
    c.title && `TITLE:${esc(c.title)}`,
    c.company && `ORG:${esc(c.company)}`,
    c.email && `EMAIL;TYPE=WORK:${esc(c.email)}`,
    c.phone && `TEL;TYPE=CELL:${esc(c.phone)}`,
    c.website && `URL:${esc(c.website)}`,
    c.office_address && `ADR;TYPE=WORK:;;${esc(c.office_address)};;;;`,
    c.headline && `NOTE:${esc(c.headline)}`,
    'END:VCARD',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(c.display_name || 'card').replace(/\s+/g, '-').toLowerCase()}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <AppsAppBottomSheet v-model="isOpen" title="My Card" subtitle="Your shareable business card & booking link">
    <div v-if="loading && !data" class="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading your card…
    </div>

    <div v-else-if="data" class="space-y-5 pb-2">
      <!-- Live preview — a real business card -->
      <div class="my-card-preview rounded-3xl overflow-hidden ring-1 ring-border/60 shadow-[0_10px_30px_-12px_rgb(0_0_0_/_0.25)] bg-card">
        <div class="h-16 bg-gradient-to-br relative" :class="accent">
          <img v-if="coverUrl" :src="coverUrl" alt="" class="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-80" />
        </div>
        <div class="px-5 pb-5">
          <div class="-mt-9 relative z-10 w-fit">
            <img v-if="imageUrl" :src="imageUrl" :alt="card.display_name || 'You'" class="w-[68px] h-[68px] rounded-2xl object-cover ring-4 ring-card shadow-md shrink-0" />
            <div v-else class="w-[68px] h-[68px] rounded-2xl bg-card text-primary flex items-center justify-center text-xl font-semibold ring-4 ring-card shadow-md shrink-0">{{ initials }}</div>
          </div>
          <div class="mt-2.5 min-w-0">
            <p class="text-lg font-semibold leading-tight truncate">{{ card.display_name || 'Your name' }}</p>
            <p class="text-xs text-muted-foreground truncate mt-0.5">{{ [card.title, card.company].filter(Boolean).join(' · ') || 'Title · Company' }}</p>
          </div>

          <p v-if="card.headline" class="text-sm text-foreground/75 mt-3 leading-relaxed">{{ card.headline }}</p>

          <div v-if="card.email || card.phone || card.website" class="mt-3.5 space-y-1.5">
            <div v-if="card.email" class="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <UIcon name="i-lucide-mail" class="w-3.5 h-3.5 shrink-0 opacity-70" /><span class="truncate">{{ card.email }}</span>
            </div>
            <div v-if="card.phone" class="flex items-center gap-2 text-xs text-muted-foreground">
              <UIcon name="i-lucide-phone" class="w-3.5 h-3.5 shrink-0 opacity-70" />{{ card.phone }}
            </div>
            <div v-if="card.website" class="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <UIcon name="i-lucide-globe" class="w-3.5 h-3.5 shrink-0 opacity-70" /><span class="truncate">{{ card.website.replace(/^https?:\/\//, '') }}</span>
            </div>
          </div>

          <div v-if="activeSocials.length || (data.booking.public_booking_enabled && bookingUrl)" class="flex items-center gap-3 mt-4">
            <UIcon v-for="s in activeSocials" :key="s.key" :name="s.icon" class="w-[18px] h-[18px]" :title="s.label" />
            <span
              v-if="data.booking.public_booking_enabled && bookingUrl"
              class="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full text-white bg-gradient-to-br shadow-sm"
              :class="accent"
            >
              <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" /> Book a call
            </span>
          </div>
        </div>
      </div>

      <!-- Share row -->
      <div class="flex flex-wrap gap-2">
        <button type="button" class="pill-action" @click="copy(data.publicCardUrl, 'Card link')">
          <UIcon name="i-lucide-link" class="w-3.5 h-3.5" /> Copy link
        </button>
        <button type="button" class="pill-action" @click="openPublicCard">
          <UIcon name="i-lucide-external-link" class="w-3.5 h-3.5" /> Open card
        </button>
        <button type="button" class="pill-action" @click="downloadVcard">
          <UIcon name="i-lucide-contact" class="w-3.5 h-3.5" /> vCard
        </button>
        <button v-if="data.booking.public_booking_enabled && bookingUrl" type="button" class="pill-action" @click="copy(bookingUrl, 'Booking link')">
          <UIcon name="i-lucide-calendar-clock" class="w-3.5 h-3.5" /> Copy booking link
        </button>
        <span class="ml-auto self-center text-[11px] text-muted-foreground">
          <template v-if="saving">Saving…</template>
          <template v-else-if="savedAt"><UIcon name="i-lucide-check" class="w-3 h-3 inline -mt-0.5" /> Saved</template>
        </span>
      </div>

      <!-- Card fields -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2.5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Card</p>
        <UInput v-model="card.display_name" placeholder="Display name" @update:model-value="touch" />
        <div class="grid grid-cols-2 gap-2.5">
          <UInput v-model="card.title" placeholder="Title" @update:model-value="touch" />
          <UInput v-model="card.company" placeholder="Company" @update:model-value="touch" />
        </div>
        <UTextarea v-model="card.headline" :rows="2" autoresize placeholder="Short tagline / headline" @update:model-value="touch" />
        <div class="grid grid-cols-2 gap-2.5">
          <UInput v-model="card.email" type="email" placeholder="Email" @update:model-value="touch" />
          <UInput v-model="card.phone" placeholder="Phone" @update:model-value="touch" />
        </div>
        <UInput v-model="card.website" placeholder="Website (https://…)" @update:model-value="touch" />
        <UTextarea v-model="card.office_address" :rows="2" autoresize placeholder="Office / business address" @update:model-value="touch" />
      </section>

      <!-- Socials -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2.5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Social</p>
        <div class="grid grid-cols-1 gap-2.5">
          <div v-for="s in SOCIALS" :key="s.key" class="flex items-center gap-2">
            <UIcon :name="s.icon" class="w-4 h-4 shrink-0" />
            <UInput v-model="card[s.key]" :placeholder="`${s.label} handle or URL`" class="flex-1" @update:model-value="touch" />
          </div>
        </div>
      </section>

      <!-- Theme -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Card theme</p>
        <div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-xs font-medium flex-wrap">
          <button
            v-for="t in THEMES"
            :key="t.key"
            type="button"
            class="px-3 py-1 rounded-full transition-colors"
            :class="(card.card_theme || 'carddesk') === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="card.card_theme = t.key; touch()"
          >
            {{ t.label }}
          </button>
        </div>
      </section>

      <!-- Booking -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Booking</p>
          <UToggle v-model="data.booking.public_booking_enabled" @update:model-value="touch" />
        </div>
        <template v-if="data.booking.public_booking_enabled">
          <div v-if="data.bookingPath !== null || data.booking.booking_page_slug !== null">
            <UInput v-model="data.booking.booking_page_slug" placeholder="your-name (booking URL slug)" @update:model-value="touch" />
            <p v-if="bookingUrl" class="text-[11px] text-muted-foreground mt-1 truncate">
              <UIcon name="i-lucide-link" class="w-3 h-3 inline -mt-0.5" /> {{ bookingUrl }}
            </p>
            <p v-else class="text-[11px] text-amber-600 mt-1">Set an organization slug (Org settings) to activate your booking link.</p>
          </div>
          <UInput v-model="data.booking.booking_page_title" placeholder="Booking page title (optional)" @update:model-value="touch" />
          <UTextarea v-model="data.booking.booking_page_description" :rows="2" autoresize placeholder="What this meeting is for (optional)" @update:model-value="touch" />
          <p class="text-[11px] text-muted-foreground">
            Availability & meeting types live in <NuxtLink to="/scheduler/settings" class="text-primary hover:underline">Scheduler settings</NuxtLink>.
          </p>
        </template>
        <p v-else class="text-[11px] text-muted-foreground">Turn on to add a “Book a call” button to your card and share a booking link.</p>
      </section>

      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <p class="text-[11px] text-muted-foreground">
        Your card also lives on CardDesk and its public page — changes here show up there instantly.
      </p>
    </div>
  </AppsAppBottomSheet>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";
.pill-action {
  @apply inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-muted/50
    text-foreground hover:bg-muted transition-colors;
}
</style>
